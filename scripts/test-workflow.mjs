import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const sqlite=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+f,'utf8'));
class Statement {constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Statement(this.sql,args)} async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
const db={prepare:sql=>new Statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const files=new Map();globalThis.__testEnv={DB:db,BUCKET:{async put(k,v){files.set(k,v)},async get(k){return files.has(k)?{body:files.get(k)}:null},async delete(k){files.delete(k)}}};
let user={userId:'owner',email:'owner@example.com',displayName:'Owner'};globalThis.__testUser=()=>user;
const source=fs.readFileSync('app/api/workspace/route.ts','utf8').replace(/import \{ env \} from 'cloudflare:workers';/,'const env=globalThis.__testEnv;').replace(/import \{ getChatGPTUser \} from '..\/..\/chatgpt-auth';/,'const getChatGPTUser=async()=>globalThis.__testUser();');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;const api=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
async function post(body,expected=200){const upload=body instanceof FormData;const res=await api.POST(new Request('https://test.local/api/workspace',{method:'POST',headers:upload?{Origin:'https://test.local'}:{Origin:'https://test.local','Content-Type':'application/json'},body:upload?body:JSON.stringify(body)}));const result=await res.json();assert.equal(res.status,expected,JSON.stringify(result));return result}
async function get(){const r=await api.GET(new Request('https://test.local/api/workspace'));return {status:r.status,body:await r.json()}}
function upload(id,action,extra={}){const f=new FormData();for(const [k,v] of Object.entries({id,action,...extra}))f.set(k,v);f.set('file',new File(['%PDF-1.7 test evidence'],'receipt.pdf',{type:'application/pdf'}));return f}
assert.equal((await get()).body.setup,true);
await post({action:'setup',name:'Electomatic',nuit:'123456789'});
await post({action:'member',name:'Technician',email:'tech@example.com',role:'technician'});
await post({action:'member',name:'Manager',email:'manager@example.com',role:'manager'});
await post({action:'project',name:'Maputo project',client:'Client',location:'Maputo',budget:'10000'});
const project=(await get()).body.projects[0].id;
user={userId:'tech',email:'tech@example.com',displayName:'Technician'};
await post({action:'project',name:'Denied',client:'Client',location:'Maputo',budget:'100'},403);
await post({action:'request',project,purpose:'Invalid cents',category:'Materiais',amount:'1.001'},400);
const {id}=await post({action:'request',project,purpose:'Cable materials',category:'Materiais',amount:'1500.50'});
await post({action:'decision',id,status:'approved',note:'Self approval'},403);
await post(upload(id,'pay',{method:'M-Pesa',reference:'123',payee:'Tech',date:'2026-01-01'}),403);
user={userId:'outsider',email:'outsider@example.com',displayName:'Outsider'};assert.equal((await get()).status,403);
user={userId:'owner',email:'owner@example.com',displayName:'Owner'};
await post({action:'decision',id,status:'approved',note:'Materials verified'});
await post({action:'decision',id,status:'approved',note:'Duplicate'},409);
await post({action:'pay',id,method:'M-Pesa',reference:'123',payee:'Tech',date:'2026-01-01'},400);
await post(upload(id,'pay',{method:'M-Pesa',reference:'MP-123',payee:'Tech',date:'2026-01-01'}));
await post(upload(id,'pay',{method:'M-Pesa',reference:'MP-123',payee:'Tech',date:'2026-01-01'}),403);
await post({action:'close',id,note:'Checked'},400);
user={userId:'tech',email:'tech@example.com',displayName:'Technician'};
await post(upload(id,'upload'));
user={userId:'manager',email:'manager@example.com',displayName:'Manager'};
await post({action:'close',id,note:'Receipt reconciled to paid amount'});
await post(upload(id,'upload'),400);
const own=await post({action:'request',project,purpose:'Own request',category:'Transporte',amount:200});
await post({action:'decision',id:own.id,status:'approved',note:'Self'},403);
const state=(await get()).body;assert.equal(state.requests.find(x=>x.id===id).status,'closed');assert.equal(state.evidence.length,2);assert.equal(state.audit.filter(x=>x.request===id).length,5);assert.equal(files.size,2);
user={userId:'tech',email:'tech@example.com',displayName:'Technician'};assert.equal((await get()).body.requests.length,1);
user={userId:'spoof',email:'tech@example.com',displayName:'Spoof'};assert.equal((await get()).status,403);
console.log('PASS: setup, roles, membership, user isolation, integer money, self-approval, repeated decisions, proof requirement, payment transitions, receipt requirement, closure and audit trail.');
