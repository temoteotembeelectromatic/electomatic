import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function workspaceAccess(user){
  if(!user)return {status:401,body:{error:'Inicie sessão para continuar.'}};
  if(user.mustChangePassword)return {status:403,body:{error:'Altere a palavra-passe temporária para continuar.',redirect:'/change-password'}};
  return null;
}
const token=()=>randomBytes(32).toString('base64url');
const error=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const emailValue=value=>{if(typeof value!=='string'||value.length>180||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))error('Email inválido.');return value.trim().toLowerCase()};
export async function passwordHash(password){if(typeof password!=='string'||password.length<12||password.length>200)error('Use uma palavra-passe entre 12 e 200 caracteres.');const salt=randomBytes(16).toString('hex');return salt+':'+Buffer.from(await scrypt(password,salt,64)).toString('hex')}
export async function passwordMatches(password,stored){if(typeof password!=='string'||password.length>200)return false;const [salt,key]=stored.split(':');const calculated=Buffer.from(await scrypt(password,salt,64));return timingSafeEqual(calculated,Buffer.from(key,'hex'))}
export function createAuth(pool,config=process.env){
  const cookieName=config.NODE_ENV==='production'?'__Host-electomatic':'electomatic';
  const cookie=(value,age)=>`${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${config.NODE_ENV==='production'?'; Secure':''}`;
  const cookieToken=req=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  async function current(req){const value=cookieToken(req);if(!value)return null;const r=await pool.query('SELECT a.id,a.email,a.name,a.password_change_required FROM sessions s JOIN accounts a ON a.id=s.account WHERE s.token_hash=$1 AND s.expires>now()',[hash(value)]);const a=r.rows[0];return a?{userId:a.id,email:a.email,displayName:a.name,fullName:a.name,mustChangePassword:a.password_change_required}:null}
  async function rateLimit(email){const key=hash(email);const r=await pool.query("INSERT INTO login_limits(key,attempts,expires) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.expires<now() THEN 1 ELSE login_limits.attempts+1 END,expires=CASE WHEN login_limits.expires<now() THEN now()+interval '15 minutes' ELSE login_limits.expires END RETURNING attempts",[key]);if(r.rows[0].attempts>12)error('Demasiadas tentativas. Aguarde 15 minutos.',429)}
  async function session(account){const value=token();await pool.query("INSERT INTO sessions(token_hash,account,expires) VALUES($1,$2,now()+interval '12 hours')",[hash(value),account]);return cookie(value,43200)}
  async function act(action,b,req){
    if(action==='logout'){await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(cookieToken(req))]);return {body:{ok:true},cookie:cookie('',0)}}
    if(action==='force-password'){
      const user=await current(req);if(!user)error('Inicie sessão.',401);
      const admin=(await pool.query('SELECT role FROM members WHERE user_id=$1',[user.userId])).rows[0];
      if(admin?.role!=='admin'||user.mustChangePassword)error('Apenas o administrador pode definir palavras-passe temporárias.',403);
      const email=emailValue(b.email);const encrypted=await passwordHash(b.password);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(74522102)');
        const member=(await client.query('SELECT name,role FROM members WHERE email=$1 FOR UPDATE',[email])).rows[0];
        if(!member||member.role==='admin'||email===user.email)error('Seleccione um Técnico, Gestor ou Financeiro da equipa.',403);
        const saved=(await client.query('INSERT INTO accounts(id,email,name,password_hash,password_change_required) VALUES($1,$2,$3,$4,true) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,password_change_required=true RETURNING id',[randomUUID(),email,member.name,encrypted])).rows[0];
        await client.query('DELETE FROM sessions WHERE account=$1',[saved.id]);await client.query('DELETE FROM invites WHERE email=$1',[email]);
        await client.query('INSERT INTO audit(id,actor,action,detail,created) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.email,'Palavra-passe temporária definida',email,new Date().toISOString()]);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      return {body:{ok:true}};
    }
    if(action==='change-password'){
      const user=await current(req);if(!user)error('Inicie sessão.',401);await rateLimit(user.email);
      const encrypted=await passwordHash(b.password);const client=await pool.connect();
      try{
        await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(74522102)');
        const account=(await client.query('SELECT password_hash FROM accounts WHERE id=$1 FOR UPDATE',[user.userId])).rows[0];
        if(!account||!await passwordMatches(b.currentPassword,account.password_hash))error('Palavra-passe actual incorrecta.',403);
        if(await passwordMatches(b.password,account.password_hash))error('Escolha uma palavra-passe diferente da actual.');
        await client.query('UPDATE accounts SET password_hash=$1,password_change_required=false WHERE id=$2',[encrypted,user.userId]);
        await client.query('DELETE FROM sessions WHERE account=$1',[user.userId]);await client.query('DELETE FROM invites WHERE email=$1',[user.email]);
        await client.query('INSERT INTO audit(id,actor,action,detail,created) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.email,'Palavra-passe alterada',user.email,new Date().toISOString()]);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      return {body:{ok:true,redirect:'/'},cookie:await session(user.userId)};
    }
    if(action==='invite'){
      const user=await current(req);if(!user)error('Inicie sessão.',401);
      const m=(await pool.query('SELECT role FROM members WHERE user_id=$1',[user.userId])).rows[0];if(m?.role!=='admin'||user.mustChangePassword)error('Apenas o administrador pode gerar convites.',403);
      const email=emailValue(b.email);const member=(await pool.query('SELECT role FROM members WHERE email=$1',[email])).rows[0];if(!member||member.role==='admin')error('Adicione primeiro um Técnico, Gestor ou Financeiro.');
      const value=token();await pool.query("INSERT INTO invites(token_hash,email,expires) VALUES($1,$2,now()+interval '48 hours') ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires",[hash(value),email]);
      await pool.query('INSERT INTO audit(id,actor,action,detail,created) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.email,'Convite de acesso gerado',email,new Date().toISOString()]);
      return {body:{ok:true,invitation:'/activate#'+value}};
    }
    const email=emailValue(b.email);await rateLimit(email);
    if(action==='login'){
      const a=(await pool.query('SELECT * FROM accounts WHERE email=$1',[email])).rows[0];
      const fallback='00000000000000000000000000000000:'+('00'.repeat(64));
      const valid=await passwordMatches(b.password,a?.password_hash||fallback);if(!a||!valid)error('Email ou palavra-passe incorrectos.',401);
      return {body:{ok:true,redirect:a.password_change_required?'/change-password':'/'},cookie:await session(a.id)};
    }
    if(!['activate','bootstrap'].includes(action))error('Operação inválida.');
    if(typeof b.token!=='string'||b.token.length>300)error('Código inválido.');
    const encrypted=await passwordHash(b.password);
    const client=await pool.connect();let account;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(74522102)');
      if(action==='bootstrap'){
        const exists=(await client.query('SELECT id FROM accounts LIMIT 1')).rows.length;
        const expected=config.BOOTSTRAP_TOKEN||'';
        if(exists||email!==(config.ADMIN_EMAIL||'').toLowerCase()||expected.length<32||!timingSafeEqual(Buffer.from(hash(b.token)),Buffer.from(hash(expected))))error('Configuração inicial não autorizada.',403);
        account=randomUUID();await client.query('INSERT INTO accounts(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[account,email,'Administrador',encrypted]);
      }else{
        const invite=(await client.query('DELETE FROM invites WHERE token_hash=$1 AND email=$2 AND expires>now() RETURNING email',[hash(b.token),email])).rows[0];if(!invite)error('Convite inválido ou expirado.',403);
        const member=(await client.query('SELECT name FROM members WHERE email=$1',[email])).rows[0];if(!member)error('Acesso removido.',403);
        const existing=(await client.query('SELECT id FROM accounts WHERE email=$1',[email])).rows[0];account=existing?.id||randomUUID();
        await client.query('INSERT INTO accounts(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,password_change_required=false',[account,email,member.name,encrypted]);
        await client.query('DELETE FROM sessions WHERE account=$1',[account]);
      }
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    return {body:{ok:true},cookie:await session(account)};
  }
  return {current,act};
}
