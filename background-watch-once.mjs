import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Lightweight one-shot watcher for Antigravity (Gemini) automatic background synthesis.
// Exits with the pending job JSON as soon as the user clicks "합성 진행" in the registrar.
const root=path.dirname(fileURLToPath(import.meta.url));
const sessionFile=path.join(root,'data','active-register-session.json');
const args=process.argv.slice(2);
const take=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const ignoreJobId=take('--ignore-job')||'';
const intervalMs=Math.max(500,Math.min(5000,Number(take('--interval'))||1500));

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function checkOnce(){
 let session;
 try{session=JSON.parse(await readFile(sessionFile,'utf8'));}catch{return null;}
 if(!session?.port||!session?.token)return null;
 const origin='http://127.0.0.1:'+session.port;
 try{
  const response=await fetch(origin+'/api/background-pending',{
   method:'GET',
   headers:{origin,cookie:'register_session_'+session.port+'='+session.token},
   signal:AbortSignal.timeout(4000)
  });
  if(!response.ok)return null;
  const data=await response.json();
  if(data?.ok&&data?.pending&&data?.dispatched&&!data?.previewPath&&data.jobId&&data.jobId!==ignoreJobId){
   return data;
  }
 }catch{}
 return null;
}

async function main(){
 while(true){
  const found=await checkOnce();
  if(found){
   console.log(JSON.stringify(found,null,2));
   return;
  }
  await sleep(intervalMs);
 }
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
