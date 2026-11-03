import {readFile,mkdir,open,unlink,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fork} from 'node:child_process';
import {atomicWrite} from './atomic-file.mjs';
export const NEW_PRODUCT_STORAGE='D:/KC334/Desktop/지오다노소구점자료/auto-new-products';
const json=async(file,fallback)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export function appendNewProducts(queue,website){
 const ids=new Set(queue.items.map(item=>item.id));
 for(const batch of website?.batches||[])for(const event of batch.events||[]){
  if(event.type!=='new'||Date.parse(event.firstCheckedAt)<Date.parse(queue.enabledAt)||!Number.isFinite(Date.parse(event.firstCheckedAt)))continue;
  let url;try{url=new URL(event.sourceUrl);}catch{continue;}
  const id=url.searchParams.get('pno')?.toLowerCase();
  if(url.origin!=='https://www.giordano.co.kr'||url.pathname!=='/shop/detail.php'||!/^[a-f0-9]{32}$/.test(id||'')||ids.has(id)||/JUNIOR|KIDS|주니어|키즈|아동/i.test(event.name||''))continue;
  ids.add(id);queue.items.push({id,style:event.style,name:event.name,sourceUrl:url.href,discoveredAt:event.firstCheckedAt,status:'queued',attempts:0});
 }
 return queue;
}
export function resourcePause({cpuPercent,freeBytes,totalBytes},busy){
 if(busy)return '상품등록·사진 작업 우선';
 if(freeBytes<2*1024**3||freeBytes/totalBytes<0.15)return '메모리 여유 부족';
 if(cpuPercent>=80)return 'CPU 사용량 높음';
 return null;
}
export function systemSampler(){
 let previous;
 return ()=>{const cpus=os.cpus(),now=cpus.reduce((a,c)=>({idle:a.idle+c.times.idle,total:a.total+Object.values(c.times).reduce((x,y)=>x+y,0)}),{idle:0,total:0});
 const cpuPercent=previous&&now.total>previous.total?100*(1-(now.idle-previous.idle)/(now.total-previous.total)):100;previous=now;
 return {cpuPercent,freeBytes:os.freemem(),totalBytes:os.totalmem()};};
}
export function runNewProductWorker(root,item,storage,{signal,onMetrics=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  const child=fork(path.join(root,'new-product-research-worker.mjs'),[storage,JSON.stringify(item)],{cwd:storage,windowsHide:true,execArgv:['--max-old-space-size=768'],env:{...process.env,TEMP:storage,TMP:storage,OMP_THREAD_LIMIT:'1',VIPS_CONCURRENCY:'1'},stdio:['ignore','ignore','ignore','ipc']});
  let result,error,killTimer;
  const abort=()=>{if(child.connected)child.send({abort:true});killTimer=setTimeout(()=>child.kill(),10000);killTimer.unref();};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.on('message',message=>{if(message.metrics)onMetrics(message.metrics);if(message.result)result=message.result;if(message.error)error=message.error;});
  child.on('error',reject);
  child.on('exit',code=>{clearTimeout(killTimer);signal?.removeEventListener('abort',abort);if(signal?.aborted)reject(signal.reason);else if(code===0&&result)resolve(result);else reject(Error(error||'신상품 조사 프로세스 종료 '+code));});
 });
}
export function startNewProductResearch(root,{isBusy=()=>false,sample=systemSampler(),storage=NEW_PRODUCT_STORAGE,storageReady=async()=>{await access('D:/');},runWorker=runNewProductWorker,clock=()=>Date.now(),interval=30000}={}){
 const file=path.join(root,'data','new-product-research.json'),lock=file+'.lock';
 const state={status:'waiting',message:'신상품 폴더 조사 준비',queued:0,completed:0,needsReview:0};
 let website,pending,stopped=false,controller,timer;
 const persist=q=>atomicWrite(file,JSON.stringify(q,null,2));
 async function tick(){if(stopped)return;if(pending)return pending;pending=(async()=>{
  await mkdir(path.dirname(file),{recursive:true});let handle;
  try{handle=await open(lock,'wx');await handle.writeFile(String(process.pid));}
  catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await readFile(lock,'utf8').catch(()=>0));if(pid>0){try{process.kill(pid,0);state.message='다른 등록기에서 신상품 폴더 조사 관리 중';return;}catch{await unlink(lock).catch(()=>{});}}return;}
  try{
   const q=appendNewProducts(await json(file,{enabledAt:new Date(clock()).toISOString(),items:[]}),website);
   for(const item of q.items)if(item.status==='running')item.status='queued';
   await persist(q);
   const update=()=>{state.queued=q.items.filter(x=>['queued','running'].includes(x.status)).length;state.completed=q.items.filter(x=>x.status==='complete').length;state.needsReview=q.items.filter(x=>['needs-review','failed'].includes(x.status)).length;};update();
   try{await storageReady();}catch{state.status='waiting-storage';state.message='신상품 폴더 조사 대기 · D드라이브 연결 필요';return;}
   const reason=resourcePause(sample(),isBusy());if(reason){state.status='waiting';state.message='신상품 폴더 조사 대기 · '+reason;return;}
   const item=q.items.find(x=>x.status==='queued'&&(!x.retryAt||Date.parse(x.retryAt)<=clock()));
   if(!item){state.status='idle';state.message=`신상품 폴더 자동 조사 · 대기 ${state.queued} · 완료 ${state.completed} · 확인 필요 ${state.needsReview}`;return;}
   await mkdir(storage,{recursive:true});item.status='running';item.startedAt=new Date(clock()).toISOString();await persist(q);
   state.status='running';state.message='신상품 폴더 조사 중 · '+(item.style||item.name);controller=new AbortController();
   let peakCpu=0,minFree=Infinity,highSamples=0;
   const guard=setInterval(()=>{const m=sample();peakCpu=Math.max(peakCpu,m.cpuPercent);minFree=Math.min(minFree,m.freeBytes);const why=resourcePause(m,isBusy());highSamples=why==='CPU 사용량 높음'?highSamples+1:0;if(why&&(why!=='CPU 사용량 높음'||highSamples>=3))controller?.abort(Error(why));},2000);guard.unref();
   const deadline=setTimeout(()=>controller?.abort(Error('한 상품 10분 제한')),10*60*1000);deadline.unref();
   try{
    const result=await runWorker(root,item,storage,{signal:controller.signal,onMetrics:m=>{state.metrics=m;}});
    Object.assign(item,result,{status:result.pointCount>=3?'complete':'needs-review',finishedAt:new Date(clock()).toISOString(),metrics:{...result.metrics,systemPeakCpuPercent:peakCpu,systemMinFreeBytes:Number.isFinite(minFree)?minFree:null}});
   }catch(e){
    const paused=controller.signal.aborted&&e.message!=='한 상품 10분 제한';
    if(!paused)item.attempts++;item.status=paused||item.attempts<3?'queued':'failed';item.lastError=e.message;item.retryAt=new Date(clock()+5*60*1000).toISOString();
   }finally{clearInterval(guard);clearTimeout(deadline);controller=null;}
   q.nextWorkAt=new Date(clock()+60000).toISOString();await persist(q);update();state.status='waiting';state.message=`신상품 폴더 조사 · 대기 ${state.queued} · 완료 ${state.completed} · 확인 필요 ${state.needsReview}`;
  }finally{await handle.close();await unlink(lock).catch(()=>{});}
 })().catch(e=>{state.status='error';state.message='신상품 폴더 조사 확인 필요 · '+e.message;});try{await pending;}finally{pending=null;}}
 const ready=tick();timer=setInterval(tick,Math.max(interval,60000));timer.unref();
 return {state,ready,async observe(value){website=value;await tick();},tick,pause(){controller?.abort(Error('상품등록·사진 작업 우선'));},stop(){stopped=true;clearInterval(timer);controller?.abort(Error('등록기 종료'));}};
}
