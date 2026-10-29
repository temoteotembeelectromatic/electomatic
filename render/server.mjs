import {reportError} from '../lib/error-report.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pool,requestUser} from './runtime.mjs';
import {migrate} from './migrate.mjs';
import {createAuth,workspaceAccess} from './auth.mjs';
import {authHTML,authJS} from './auth-page.mjs';
import * as workspace from '../render-dist/workspace.mjs';
for(const key of ['DATABASE_URL','AWS_REGION','S3_BUCKET','ADMIN_EMAIL','BOOTSTRAP_TOKEN'])if(!process.env[key])throw new Error('Missing required setting: '+key);
if(process.env.BOOTSTRAP_TOKEN.length<32)throw new Error('BOOTSTRAP_TOKEN must contain at least 32 characters');
const origin=process.env.APP_URL||process.env.RENDER_EXTERNAL_URL||(process.env.NODE_ENV!=='production'?`http://127.0.0.1:${process.env.PORT||10000}`:null);
if(!origin)throw new Error('APP_URL or RENDER_EXTERNAL_URL is required');
const publicOrigin=new URL(origin).origin;
if(process.env.NODE_ENV==='production'&&!publicOrigin.startsWith('https:'))throw new Error('Production requires HTTPS');
await migrate(pool);
const auth=createAuth(pool);
const publicRoot=path.resolve('render-dist/public');
const json=(body,status=200)=>Response.json(body,{status});
async function dispatch(req){
  const url=new URL(req.url);
  if(req.method==='GET'&&url.pathname==='/healthz'){await pool.query('SELECT 1');return json({status:'ok'})}
  if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==publicOrigin)return json({error:'Origem não autorizada.'},403);
  if(url.pathname.startsWith('/api/auth/')){
    if(req.method!=='POST')return json({error:'Método não permitido.'},405);
    const action=url.pathname.slice('/api/auth/'.length);const b=await req.json();
    const result=await auth.act(action,b,req);const response=json(result.body);if(result.cookie)response.headers.set('Set-Cookie',result.cookie);return response;
  }
  if(url.pathname==='/logout'&&req.method==='GET')return new Response('<form method="post" action="/logout"><button>Confirmar saída</button></form>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if(url.pathname==='/logout'&&req.method==='POST'){const result=await auth.act('logout',{},req);return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':result.cookie}})}
  if(url.pathname==='/api/workspace'){
    const user=await auth.current(req);
    const denied=workspaceAccess(user);if(denied)return json(denied.body,denied.status);
    // Only the configured owner account can initialize the company on the public Render URL.
    if(!(await pool.query('SELECT id FROM company LIMIT 1')).rows.length&&user.email!==process.env.ADMIN_EMAIL.toLowerCase())return json({error:'Aguarde a configuração pelo administrador.'},403);
    return requestUser.run(user,()=>req.method==='GET'?workspace.GET(req):req.method==='POST'?workspace.POST(req):json({error:'Método não permitido.'},405));
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json({error:'Método não permitido.'},405);
  if(['/login','/activate','/setup-account','/change-password'].includes(url.pathname))return new Response(authHTML,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if(url.pathname==='/auth-client.js')return new Response(authJS,{headers:{'Content-Type':'application/javascript; charset=utf-8'}});
  if(url.pathname.startsWith('/api/'))return json({error:'Não encontrado.'},404);
  const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file=path.resolve(publicRoot,relative);if(!file.startsWith(publicRoot+path.sep))return json({error:'Não encontrado.'},404);
  try {const bytes=await readFile(file);const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'};return new Response(bytes,{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream',...(relative.startsWith('assets/')?{'Cache-Control':'public,max-age=31536000,immutable'}:{})}})}catch{return json({error:'Não encontrado.'},404)}
}
const server=http.createServer(async(incoming,outgoing)=>{
  try {
    const chunks=[];let size=0;
    if(Number(incoming.headers['content-length']||0)>12*1024*1024){outgoing.writeHead(413);outgoing.end('Upload demasiado grande');return}
    for await(const chunk of incoming){size+=chunk.length;if(size>12*1024*1024){outgoing.writeHead(413);outgoing.end('Upload demasiado grande');return}chunks.push(chunk)}
    const headers=new Headers();for(const [k,v] of Object.entries(incoming.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    const request=new Request(new URL(incoming.url,publicOrigin),{method:incoming.method,headers,...(!['GET','HEAD'].includes(incoming.method)?{body:Buffer.concat(chunks)}:{})});
    let response;
    try{response=await dispatch(request)}catch(e){const result=reportError(e);response=json(result.body,result.status)}
    if(!response.headers.has('Cache-Control'))response.headers.set('Cache-Control','no-store');
    response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('X-Frame-Options','DENY');response.headers.set('Referrer-Policy','no-referrer');
    response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));if(response.body&&incoming.method!=='HEAD')await pipeline(Readable.fromWeb(response.body),outgoing);else outgoing.end();
  }catch{if(!outgoing.headersSent)outgoing.writeHead(500);outgoing.end()}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Electomatic Render server listening'));
const cleanup=setInterval(()=>pool.query('DELETE FROM sessions WHERE expires<now(); DELETE FROM invites WHERE expires<now(); DELETE FROM login_limits WHERE expires<now()').catch(()=>{}),3600000);cleanup.unref();
process.on('SIGTERM',()=>{clearInterval(cleanup);server.close(()=>pool.end().then(()=>process.exit(0)))});
