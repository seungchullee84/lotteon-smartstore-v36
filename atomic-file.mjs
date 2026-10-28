import {mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const pending=new Map();
export function atomicWrite(file,text){
 const key=path.resolve(file);
 const job=(pending.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
  await mkdir(path.dirname(key),{recursive:true});
  const temp=key+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,text);await rename(temp,key);}finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 });
 pending.set(key,job);
 job.finally(()=>{if(pending.get(key)===job)pending.delete(key);}).catch(()=>{});
 return job;
}
