import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';
import {composeBackground,BACKGROUND_COMPOSITE_VERSION} from './background-composite.mjs';

const keys=['main','extra1','extra2'];
const maxAttempts=3;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=()=>randomBytes(12).toString('hex');
const changed=()=>Error('품번·사진 선택·원본 또는 작업 상태가 변경되어 합성을 적용하지 않았습니다. 새로 요청해 주세요.');
function stamp(file){const s=fs.statSync(file,{bigint:true});return [s.size,s.mtimeNs,s.ctimeNs,s.ino].join(':');}
function atomic(file,bytes){const temp=file+'.'+id()+'.tmp';try{fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function picture(bytes){return sharp(bytes,{limitInputPixels:40000000}).metadata();}
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(value);

// No generation service or seller automation is called here. Jobs are scoped to
// this server lifetime; a restart can never accept an old completion command.
export function createBackgroundWorkflow({getState,cacheRoot,compose=composeBackground,onInvalidate=()=>{}}){
 let epoch=0,active=null,manualReview=null,view=null;
 const cancelled=new Set();
 const cacheSettings={version:1,composition:BACKGROUND_COMPOSITE_VERSION,generation:'builtin-reviewed-background-v1',width:1500,height:1500,format:'jpeg',quality:95};
 const timing=(s,terminal=false)=>({startedAt:s.startedAt,attempt:s.attempt,maxAttempts,...(terminal?{elapsedMs:Math.round(performance.now()-s.started)}:{})});
 const previewFile=(jobId,attempt,file)=>file==='background-preview-'+jobId+'-attempt-'+attempt+'.jpg'||attempt===1&&file==='background-preview-'+jobId+'.jpg';
 function persistReview(s,{allowed=!s.invalid,status=view?.status,message=view?.message}={}){
  if(!s.previews?.length)return;
  atomic(path.join(s.folder,'background-review.json'),JSON.stringify({version:1,allowed,folder:s.folder,jobId:s.jobId,requestId:s.requestId,style:s.style,key:s.key,sourceUrl:s.sourceUrl,sourceImageUrl:s.sourceImageUrl,sourceHash:s.sourceHash,sourceStamp:s.sourceStamp,selectionHash:s.selectionHash,selectionStamp:s.selectionStamp,startedAt:s.startedAt,attempt:s.attempt,maxAttempts,status,message,elapsedMs:view?.elapsedMs,selectedAttempt:s.selectedAttempt,previews:s.previews}));
 }
 function rememberReview(s){manualReview={...s,invalid:false,staged:undefined,previews:s.previews};persistReview(manualReview);}
 function invalidate(message='상품 또는 작업이 변경되어 이전 합성 요청을 취소했습니다.'){
  epoch++;
  const invalidated=active||manualReview;
  if(manualReview){manualReview.invalid=true;persistReview(manualReview,{allowed:false,status:'cancelled',message});}
  if(invalidated){invalidated.invalid=true;view={...timing(invalidated,true),status:'cancelled',style:invalidated.style,key:invalidated.key,jobId:invalidated.jobId,requestId:invalidated.requestId,sourceUrl:invalidated.sourceUrl,message};onInvalidate({jobId:invalidated.jobId});}
 }
 function cancel({requestId}={}){
  if(!validId(requestId))throw Error('합성 요청 번호를 확인해 주세요.');
  cancelled.add(requestId);
  // Keep all cancellations for this process: a delayed HTTP request must not
  // become valid again merely because other requests were made afterwards.
  const matches=active?.requestId===requestId||manualReview?.requestId===requestId;
  if(matches)invalidate();
  return {ok:true,cancelled:matches};
 }
 function stateMatches(s){
  const now=getState();
  return now.folder===s.folder&&now.product?.style===s.style&&now.product?.sourceUrl===s.sourceUrl&&now.product.images?.[s.key]===s.sourceImageUrl;
 }
 function assertCurrent(s){
  if(s.invalid||s.epoch!==epoch||cancelled.has(s.requestId)||!stateMatches(s))throw changed();
  try{
   if(stamp(s.sourcePath)!==s.sourceStamp||hash(fs.readFileSync(s.sourcePath))!==s.sourceHash||stamp(s.selectionPath)!==s.selectionStamp||hash(fs.readFileSync(s.selectionPath))!==s.selectionHash)throw changed();
   const current=getState();
   // Other product metadata writes can briefly truncate this file. Applying
   // always waits for idle, when the stored identity is checked strictly again.
   if(!current.busy&&current.photoPreparation?.status!=='preparing'){
    const disk=JSON.parse(fs.readFileSync(path.join(s.folder,'product.json'),'utf8'));
    if(disk.style!==s.style||disk.sourceUrl!==s.sourceUrl)throw changed();
   }
  }catch{throw changed();}
 }
 function snapshot({style,key,sourceUrl,revision,requestId}){
  if(!validId(requestId)||cancelled.has(requestId))throw changed();
  const current=getState();
  if(current.busy||current.photoPreparation?.status==='preparing')throw Error('진행 중인 작업이 끝난 뒤 합성을 요청해 주세요.');
  if(!current.product||!current.folder||current.product.style!==style||!keys.includes(key)||!current.product.images?.[key]||(sourceUrl!==undefined&&sourceUrl!==current.product.sourceUrl)||(revision!==undefined&&revision!==current.revision))throw changed();
  const folder=current.folder,selectionPath=path.join(folder,'background-selection.json'),sourcePath=path.join(folder,key+'.jpg');
  const selection=fs.readFileSync(selectionPath),selected=JSON.parse(selection);
  if(selected.key!==key||selected.style!==style)throw changed();
  const original=fs.readFileSync(sourcePath),sourceHash=hash(original);
  const s={epoch,requestId,jobId:id(),style,key,sourceUrl:current.product.sourceUrl,sourceImageUrl:current.product.images[key],product:current.product,folder,revision:current.revision,sourcePath,sourceHash,original,sourceStamp:stamp(sourcePath),selectionPath,selectionHash:hash(selection),selectionStamp:stamp(selectionPath),started:performance.now(),startedAt:Date.now(),attempt:1,previews:[]};
  s.cacheKey=hash(JSON.stringify({style,key,sourceUrl:s.sourceUrl,sourceHash,settings:cacheSettings}));
  assertCurrent(s);return s;
 }
 async function cached(s){
  const manifest=path.join(cacheRoot,s.cacheKey+'.json');
  try{
   const entry=JSON.parse(fs.readFileSync(manifest,'utf8'));
   if(entry.cacheKey!==s.cacheKey||entry.reviewed!==true||entry.sourceHash!==s.sourceHash||entry.style!==s.style||entry.sourceUrl!==s.sourceUrl||entry.key!==s.key||JSON.stringify(entry.settings)!==JSON.stringify(cacheSettings)||entry.file!==s.cacheKey+'.jpg')return null;
   const bytes=fs.readFileSync(path.join(cacheRoot,entry.file));
   if(hash(bytes)!==entry.outputHash)return null;
   const m=await picture(bytes);
   return m.width===1500&&m.height===1500&&m.format==='jpeg'?bytes:null;
  }catch{return null;}
 }
 function activate(s,bytes,{reused=false,manual=false,selectedAttempt}={}){
  // Nothing asynchronous is allowed between this final validation and rename.
  // Node cannot interleave another product/selection mutation in this section.
  assertCurrent(s);
  const outputHash=hash(bytes),file='main-composite-'+id()+'.jpg';
  fs.writeFileSync(path.join(s.folder,file),bytes,{flag:'wx'});
  assertCurrent(s);
  const selected=s.previews?.find(p=>p.attempt===selectedAttempt);
  atomic(path.join(s.folder,'background-image.json'),JSON.stringify({file,style:s.style,sourceUrl:s.sourceUrl,sourceKey:s.key,sourceHash:s.sourceHash,outputHash,cacheKey:manual?undefined:s.cacheKey,settings:manual?{...cacheSettings,composition:selected?.recipe||'legacy-manual-preview'}:cacheSettings,reviewed:true,...(manual?{manual:true,reviewer:'user',selectedAttempt}:{}),createdAt:new Date().toISOString()}));
  const result={ok:true,cached:reused,file,elapsedMs:Math.round(performance.now()-s.started),...(manual?{manual:true,selectedAttempt}:{}),message:manual?'직접 선택하고 승인한 합성 결과를 대표이미지에 적용했습니다.':reused?'같은 원본의 검수된 합성 결과를 대표이미지에 적용했습니다.':'원본을 보존한 1500×1500 합성 결과를 대표이미지에 적용했습니다.'};
  view={...timing(manual?{...s,attempt:selectedAttempt}:s),status:'complete',style:s.style,key:s.key,sourceUrl:s.sourceUrl,jobId:s.jobId,requestId:s.requestId,...result};active=null;
  if(s.previews?.length){manualReview={...s,invalid:false,staged:undefined};persistReview(manualReview);}
  return result;
 }
 async function prepare(input){
  if(!validId(input.requestId)||cancelled.has(input.requestId))throw changed();
  invalidate('새 합성 요청으로 이전 요청을 취소했습니다.');
  const s=snapshot(input);active=s;
  view={...timing(s),status:'checking',style:s.style,key:s.key,message:'원본과 재사용 가능한 결과를 확인합니다.'};
  try{
   const bytes=await cached(s);assertCurrent(s);
   if(bytes){s.cachedBytes=bytes;view={...timing(s),status:'checking',style:s.style,key:s.key,message:'같은 원본의 검수된 결과를 찾았습니다. 현재 화면을 재확인합니다.'};return {ok:true,cached:true,applied:false,jobId:s.jobId,message:view.message};}
   view={...timing(s),status:'waiting',style:s.style,key:s.key,message:'채팅에서 배경 생성 후 검수된 결과를 자동 처리합니다.'};
   return {ok:true,cached:false,jobId:s.jobId,sourcePath:s.sourcePath,style:s.style,key:s.key,sourceHash:s.sourceHash};
  }catch(error){if(active===s){view={...timing(s,true),status:'cancelled',style:s.style,key:s.key,sourceUrl:s.sourceUrl,jobId:s.jobId,requestId:s.requestId,message:error.message};active=null;}throw error;}
 }
 function job(jobId){if(!active||active.jobId!==jobId)throw changed();assertCurrent(active);return active;}
 async function stage({jobId,generatedPath}){
  const s=job(jobId);
  if(s.processing||s.staged)throw Error('이 요청의 합성 결과가 이미 준비 중이거나 검수 대기 중입니다.');
  if(typeof generatedPath!=='string'||!path.isAbsolute(generatedPath)||!/^\.(png|jpe?g|webp)$/i.test(path.extname(generatedPath)))throw Error('생성된 이미지의 절대 경로를 확인해 주세요.');
  if(fs.statSync(generatedPath).size>40*1024*1024)throw Error('생성 이미지 파일이 너무 큽니다.');
  s.processing=true;view={...timing(s),status:'processing',style:s.style,key:s.key,message:'원본 보존 합성과 규격 검사를 진행합니다.'};
  try{
   const bytes=await compose({original:s.original,generated:fs.readFileSync(generatedPath)});
   assertCurrent(s);
   const m=await picture(bytes);assertCurrent(s);
   if(m.width!==1500||m.height!==1500||m.format!=='jpeg')throw Error('합성 결과 규격이 올바르지 않습니다.');
   const previewPath=path.join(s.folder,'background-preview-'+s.jobId+'-attempt-'+s.attempt+'.jpg');
   fs.writeFileSync(previewPath,bytes,{flag:'wx'});s.staged={bytes,hash:hash(bytes),previewPath,attempt:s.attempt};
   s.previews.push({attempt:s.attempt,file:path.basename(previewPath),hash:s.staged.hash,recipe:BACKGROUND_COMPOSITE_VERSION});
   view={...timing(s),status:'review',style:s.style,key:s.key,message:'원본 합성을 마쳤습니다. 최종 이미지 검수 후 자동 적용합니다.'};
   rememberReview(s);
   return {ok:true,jobId,attempt:s.attempt,maxAttempts,previewPath,width:1500,height:1500,originalPreserved:true};
  }catch(error){if(active===s&&!s.invalid){view={...timing(s,true),status:'error',style:s.style,key:s.key,message:error.message};}throw error;}
  finally{s.processing=false;}
 }
 function retry({jobId,reason}){
  const s=job(jobId);
  if(s.processing||!s.staged||view?.status!=='review')throw Error('현재 합성 결과의 검수를 마친 뒤 품질 보완을 요청해 주세요.');
  const qualityReason=typeof reason==='string'?reason.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160):'';
  if(!qualityReason)throw Error('보완할 이미지 품질 문제를 구체적으로 입력해 주세요.');
  if(s.attempt>=maxAttempts)throw Object.assign(Error('총 '+maxAttempts+'회 합성 후에도 품질 보완이 필요합니다: '+qualityReason+'. 원본 대표이미지는 유지됩니다.'),{code:'BACKGROUND_QUALITY_RETRY_LIMIT'});
  s.previews.find(p=>p.attempt===s.attempt).reason=qualityReason;
  s.attempt++;s.staged=null;s.retryReason=qualityReason;
  view={...timing(s),status:'generating',style:s.style,key:s.key,message:'배경 합성 '+s.attempt+'/'+maxAttempts+'회 · 보완: '+qualityReason};
  rememberReview(s);
  return {...inspect({jobId}),reason:qualityReason,message:view.message};
 }
 function applicationWait(s){
  const current=getState();
  if(!current.busy&&current.photoPreparation?.status!=='preparing')return null;
  const result={ok:true,waiting:true,jobId:s.jobId,attempt:s.attempt,message:'합성 완료 · 다른 작업이 끝나면 대표이미지에 적용합니다.'};
  view={...timing(s),status:'applying-wait',style:s.style,key:s.key,sourceUrl:s.sourceUrl,jobId:s.jobId,requestId:s.requestId,message:result.message};
  return result;
 }
 function complete({jobId,reviewed,reuse,attempt}){
  const s=job(jobId);
  if(reuse===true){if(!s.cachedBytes)throw Error('재사용할 검수 결과가 없습니다.');return applicationWait(s)||activate(s,s.cachedBytes,{reused:true});}
  if(reviewed!==true||!s.staged)throw Error('최종 합성 이미지의 시각 검수 후 적용해 주세요.');
  if((s.attempt>1||attempt!==undefined)&&(!Number.isInteger(attempt)||attempt!==s.staged.attempt))throw Object.assign(Error('검수한 합성 차수가 현재 결과와 다릅니다. '+s.attempt+'회차 이미지를 확인한 뒤 적용해 주세요.'),{code:'BACKGROUND_REVIEW_ATTEMPT_CHANGED'});
  if(hash(fs.readFileSync(s.staged.previewPath))!==s.staged.hash)throw changed();
  assertCurrent(s);
  const waiting=applicationWait(s);if(waiting)return waiting;
  const bytes=s.staged.bytes;
  // Only a reviewed result is cached. The cache is independent of collection
  // folders, but tied to product identity, exact source bytes and recipe.
  fs.mkdirSync(cacheRoot,{recursive:true});
  atomic(path.join(cacheRoot,s.cacheKey+'.jpg'),bytes);
  atomic(path.join(cacheRoot,s.cacheKey+'.json'),JSON.stringify({cacheKey:s.cacheKey,file:s.cacheKey+'.jpg',style:s.style,sourceUrl:s.sourceUrl,key:s.key,sourceHash:s.sourceHash,outputHash:hash(bytes),reviewed:true,settings:cacheSettings}));
  return activate(s,bytes);
 }
 function select({style,key}){
  const current=getState();
  if(current.busy||current.photoPreparation?.status==='preparing'||!current.product||!current.folder||current.product.style!==style||!keys.includes(key)||!current.product.images?.[key])throw changed();
  fs.readFileSync(path.join(current.folder,key+'.jpg'));
  invalidate('사진 선택이 변경되어 이전 합성 요청을 취소했습니다.');
  atomic(path.join(current.folder,'background-selection.json'),JSON.stringify({style,key,selectionId:id()}));
  return {ok:true,key};
 }
 function review(jobId){const s=manualReview?.jobId===jobId?manualReview:active?.jobId===jobId?active:null;if(!s)throw changed();assertCurrent(s);return s;}
 function previewBytes(s,attempt){
  if(!Number.isInteger(attempt)||attempt<1||attempt>maxAttempts)throw Error('확인할 합성 회차를 선택해 주세요.');
  const entry=s.previews?.find(p=>p.attempt===attempt);
  if(!entry||!previewFile(s.jobId,attempt,entry.file)||!/^[a-f0-9]{64}$/.test(entry.hash))throw Error('저장된 합성 미리보기를 확인해 주세요.');
  const file=path.join(s.folder,entry.file),details=fs.lstatSync(file);
  if(!details.isFile()||details.isSymbolicLink()||details.size>40*1024*1024)throw changed();
  const bytes=fs.readFileSync(file);if(hash(bytes)!==entry.hash)throw changed();return bytes;
 }
 function preview({jobId,attempt}){return previewBytes(review(jobId),attempt);}
 function manualApply({jobId,attempt,userApproved}){
  if(userApproved!==true)throw Error('합성 결과를 직접 확인하고 선택한 사진 적용을 승인해 주세요.');
  const s=review(jobId),bytes=previewBytes(s,attempt);
  if(!manualReview||manualReview.jobId!==jobId)manualReview={...s,invalid:false,staged:undefined};
  manualReview.selectedAttempt=attempt;
  if(active?.jobId===jobId){active.invalid=true;active=null;onInvalidate({jobId});}
  const waiting=applicationWait({...manualReview,attempt});
  if(waiting){view={...view,manual:true,selectedAttempt:attempt};persistReview(manualReview);return {...waiting,manual:true,selectedAttempt:attempt};}
  return activate(manualReview,bytes,{manual:true,selectedAttempt:attempt});
 }
 function manualFail({jobId,message}){
  if(manualReview?.jobId!==jobId)return;
  manualReview.invalid=true;view={...timing({...manualReview,attempt:manualReview.selectedAttempt||manualReview.attempt},true),status:'error',style:manualReview.style,key:manualReview.key,jobId,requestId:manualReview.requestId,sourceUrl:manualReview.sourceUrl,message,manual:true};persistReview(manualReview,{allowed:false});
 }
 function restoreReview(){
  if(active)return {ok:true,restored:false};
  const current=getState();if(!current.folder||!current.product)return {ok:true,restored:false};
  try{
   const record=JSON.parse(fs.readFileSync(path.join(current.folder,'background-review.json'),'utf8'));
   if(record.version!==1||record.allowed!==true||!validId(record.jobId)||!validId(record.requestId)||record.folder!==current.folder||!keys.includes(record.key)||!Number.isFinite(record.startedAt)||!Number.isInteger(record.attempt)||record.attempt<1||record.attempt>maxAttempts||!Array.isArray(record.previews)||!record.previews.length||record.previews.length>maxAttempts||!/^[a-f0-9]{64}$/.test(record.sourceHash)||!/^[a-f0-9]{64}$/.test(record.selectionHash)||typeof record.sourceStamp!=='string'||typeof record.selectionStamp!=='string')return {ok:true,restored:false};
   const seen=new Set();for(const p of record.previews){if(!Number.isInteger(p.attempt)||p.attempt<1||p.attempt>maxAttempts||seen.has(p.attempt)||!previewFile(record.jobId,p.attempt,p.file)||!/^[a-f0-9]{64}$/.test(p.hash))return {ok:true,restored:false};seen.add(p.attempt);}
   const s={...record,epoch,invalid:false,sourcePath:path.join(current.folder,record.key+'.jpg'),selectionPath:path.join(current.folder,'background-selection.json'),started:performance.now()-Math.max(0,Date.now()-record.startedAt)};
   assertCurrent(s);for(const p of s.previews)previewBytes(s,p.attempt);
   manualReview=s;
   view={...timing({...s,attempt:s.selectedAttempt||s.attempt},true),status:record.status==='complete'?'complete':'error',style:s.style,key:s.key,sourceUrl:s.sourceUrl,jobId:s.jobId,requestId:s.requestId,message:record.message||'이전 합성 결과를 직접 확인하고 적용할 사진을 선택해 주세요.',...(Number.isFinite(record.elapsedMs)?{elapsedMs:record.elapsedMs}:{})};
   return {ok:true,restored:true,jobId:s.jobId};
  }catch{return {ok:true,restored:false};}
 }
 function inspect({jobId}){const s=job(jobId);return {ok:true,jobId,style:s.style,key:s.key,sourcePath:s.sourcePath,sourceHash:s.sourceHash,attempt:s.attempt,maxAttempts,previewPath:s.staged?.previewPath};}
 function dispatch({jobId}){const s=job(jobId);if(s.dispatched||s.cachedBytes)throw Error('이미 진행 중이거나 재사용할 수 있는 합성 요청입니다.');s.dispatched=true;view={...timing(s),status:'generating',style:s.style,key:s.key,message:'Codex가 원본을 확인하고 배경 합성을 진행합니다.'};return inspect({jobId});}
 function fail({jobId,message}){if(active?.jobId!==jobId||active.invalid)return;view={...timing(active,true),status:'error',style:active.style,key:active.key,sourceUrl:active.sourceUrl,jobId:active.jobId,requestId:active.requestId,message};if(active.previews.length){const last=active.previews.find(p=>p.attempt===active.attempt);if(last)last.reason=String(message||'품질 확인 필요').slice(0,300);rememberReview(active);}active.invalid=true;active=null;}
 function status(){
  if(!view)return null;
  const jobId=view.jobId||active?.jobId,s=manualReview?.jobId===jobId?manualReview:active?.jobId===jobId?active:null;
  let manualAvailable=false;if(s?.previews?.length)try{assertCurrent(s);manualAvailable=true;}catch{}
  return {...view,jobId,requestId:view.requestId||active?.requestId,sourceUrl:view.sourceUrl||active?.sourceUrl,manualAvailable,previews:(s?.previews||[]).map(p=>({attempt:p.attempt,url:'/api/background-preview?jobId='+encodeURIComponent(jobId)+'&attempt='+p.attempt,...(p.reason?{reason:p.reason}:{})}))};
 }
 return {prepare,stage,retry,complete,select,cancel,invalidate,inspect,dispatch,fail,preview,manualApply,manualFail,restoreReview,status};
}
