import {readFile,mkdir,realpath,symlink,access,open,unlink,copyFile} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {readJson,restoreBenefitSnapshot,exportBenefitSnapshot,SHARED_BENEFIT_DIR} from './benefit-sharing.mjs';
const exec=promisify(execFile);
const exists=async file=>{try{await access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
export async function benefitStorage(root){
 const local=path.join(root,'data','official-benefit-catalog');await mkdir(path.dirname(local),{recursive:true});
 if(!await exists(local)){
  const target=process.platform==='win32'&&await exists('D:/')?path.resolve('D:/GiordanoResearch/official-benefit-catalog'):local;
  await mkdir(target,{recursive:true});if(target!==local)await symlink(target,local,'junction');
 }
 const catalogDir=await realpath(local),runtimeDir=path.join(catalogDir,'resume-runtime');
 await mkdir(runtimeDir,{recursive:true});return {catalogDir,runtimeDir,sharedDir:path.join(root,SHARED_BENEFIT_DIR)};
}
async function workerAlive(info){
 if(!Number.isInteger(info?.pid)||info.pid<=0)return false;
 try{process.kill(info.pid,0);
  if(process.platform==='win32'){const result=await exec('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId=${info.pid}').CommandLine`],{windowsHide:true,timeout:10000});return result.stdout.includes('benefit-research-worker.mjs');}
  return (await readFile('/proc/'+info.pid+'/cmdline','utf8')).includes('benefit-research-worker.mjs');
 }catch{return false;}
}
export async function startBenefitWorker(root,storage,{spawnImpl=spawn,alive=workerAlive}={}){
 const lock=path.join(storage.runtimeDir,'worker.json');const previous=await readJson(lock);
 if(await alive(previous))return {running:true,pid:previous.pid,reused:true};
 if(previous)await unlink(lock).catch(e=>{if(e.code!=='ENOENT')throw e;});
 let handle;try{handle=await open(lock,'wx');}catch(e){if(e.code==='EEXIST')return {running:true,reused:true};throw e;}
 try{
  for(const language of ['kor.traineddata','eng.traineddata'])if(!await exists(path.join(storage.runtimeDir,language))&&await exists(path.join(root,language)))await copyFile(path.join(root,language),path.join(storage.runtimeDir,language));
  const temp=path.join(storage.runtimeDir,'temp');await mkdir(temp,{recursive:true});const env={...process.env,TEMP:temp,TMP:temp};
  if(await exists(path.join(root,'runtime-browsers')))env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'runtime-browsers');
  const output=await open(path.join(storage.runtimeDir,'analysis.log'),'a');const errors=await open(path.join(storage.runtimeDir,'analysis-error.log'),'a');let child;
  try{child=spawnImpl(process.execPath,[path.join(root,'benefit-research-worker.mjs'),storage.catalogDir,storage.runtimeDir,storage.sharedDir],{cwd:storage.runtimeDir,env,windowsHide:true,detached:true,stdio:['ignore',output.fd,errors.fd]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}finally{await output.close();await errors.close();}
  await handle.writeFile(JSON.stringify({pid:child.pid,startedAt:new Date().toISOString()}));child.unref();return {running:true,pid:child.pid,reused:false};
 }catch(error){await unlink(lock).catch(()=>{});throw error;}finally{await handle.close();}
}
export function startBenefitResearch(root,{interval=60000,autoRun=process.env.REGISTER_BENEFIT_AUTORUN!=='0'}={}){
 const state={status:'initializing',message:'공유 소구점 자료 확인 중',imageComplete:0,total:0};let busy=false,stopped=false,attempted=false,storage;
 async function tick(){if(busy||stopped)return;busy=true;
  try{
   if(!storage){storage=await benefitStorage(root);const restored=await restoreBenefitSnapshot(storage.sharedDir,storage.catalogDir);state.restored=restored.restored;}
   const queue=await readJson(path.join(storage.catalogDir,'queue.json'),[]);if(!queue.length){state.status='empty';state.message='공유할 소구점 조사자료 없음';return;}
   const snapshot=await exportBenefitSnapshot(storage.catalogDir,storage.sharedDir);Object.assign(state,{imageComplete:snapshot.imageComplete,total:snapshot.queue.length,withThreeOrFour:snapshot.withThreeOrFour,lastSharedAt:snapshot.updatedAt});
   const progress=await readJson(path.join(storage.catalogDir,'progress.json'),{});const info=await readJson(path.join(storage.runtimeDir,'worker.json'));
   state.website=snapshot.websiteCheck||null;
   if(await workerAlive(info)){Object.assign(state,{status:'running',pid:info.pid,message:`성인 소구점 분석 ${state.imageComplete}/${state.total}건 · 홈페이지 30분 간격 확인`});return;}
   if(!attempted&&autoRun){attempted=true;const job=await startBenefitWorker(root,storage);Object.assign(state,{status:'running',pid:job.pid,message:'남은 소구점 분석·홈페이지 30분 간격 확인 시작'});return;}
   state.status=progress.phase==='complete'?'complete':autoRun?'stopped':'paused';state.message=state.status==='complete'?`소구점 분석 종료 ${state.imageComplete}/${state.total}건 · 미확인 자료는 재검토 필요`:autoRun?'소구점 분석 중지 · 다음 실행 시 재개':'소구점 자동 분석 꺼짐';
  }catch(error){state.status='error';state.message=error.message;}finally{busy=false;}
 }
 const ready=tick();const timer=setInterval(tick,interval);timer.unref();return {state,ready,async refresh(){await tick();return state;},stop(){stopped=true;clearInterval(timer);}};
}
