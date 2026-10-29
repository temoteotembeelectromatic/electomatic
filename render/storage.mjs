import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
export function createBucket(config=process.env, client=new S3Client({region:config.AWS_REGION, ...(config.S3_ENDPOINT?{endpoint:config.S3_ENDPOINT,forcePathStyle:config.S3_FORCE_PATH_STYLE==='true'}:{})})) {
  async function send(command){try{return await client.send(command)}catch(e){e.service='S3';e.operation=command.constructor.name.replace(/Command$/, '');throw e}}
  const Bucket=config.S3_BUCKET;
  const prefix=(config.S3_PREFIX||'electomatic/').replace(/\/*$/, '/');
  const key=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid attachment key');return prefix+id};
  return {
    async put(id,data,options) { await send(new PutObjectCommand({Bucket,Key:key(id),Body:Buffer.from(data),ContentType:options?.httpMetadata?.contentType, ...(config.S3_SSE?{ServerSideEncryption:config.S3_SSE,...(config.S3_KMS_KEY_ID?{SSEKMSKeyId:config.S3_KMS_KEY_ID}:{})}:{})})); },
    async get(id) { try { const r=await send(new GetObjectCommand({Bucket,Key:key(id)}));return {body:r.Body.transformToWebStream()}; }catch(e){if(e.name==='NoSuchKey')return null;throw e} },
    async delete(id) {await send(new DeleteObjectCommand({Bucket,Key:key(id)}));}
  };
}
