import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createDatabase } from './postgres.mjs';
import { createBucket } from './storage.mjs';
// All money is bounded below Number.MAX_SAFE_INTEGER by the shared workflow.
pg.types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Integer out of safe range');return n});
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:10000,statement_timeout:15000,...(process.env.DATABASE_SSL==='true'?{ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA?{ca:process.env.DATABASE_CA}:{})}}:{})});
export const env={DB:createDatabase(pool),BUCKET:createBucket()};
export const requestUser=new AsyncLocalStorage();
export async function getChatGPTUser(){return requestUser.getStore()||null}
