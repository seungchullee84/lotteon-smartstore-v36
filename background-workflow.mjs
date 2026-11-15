import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';
import {composeBackground,BACKGROUND_COMPOSITE_VERSION} from './background-composite.mjs';

const keys=['main','extra1','extra2'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=()=>randomBytes(12).toString('hex');
const changed=()=>Error('품번·사진 선택·원본 또는 작업 상태가 변경되어 합성을 적용하지 않았습니다. 새로 요청해 주세요.');
function stamp(file){const s=fs.statSync(file,{bigint:true});return [s.size,s.mtimeNs,s.ctimeNs,s.ino].join(':');}
function atomic(file,bytes){const temp=file+'.'+id()+'.tmp';try{fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function picture(bytes){return sharp(bytes,{limitInputPixels:40000000}).metadata();}
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(value);

// No generation service or seller automation is called here. Jobs are scoped to
// this server lifetime; a restart can never accept an old completion command.
export function createBackgroundWorkflow({getState,cacheRoot,compose=composeBackground}){
 let epoch=0,active=null,view=null;
 const cancelled=new Set();
 const cacheSettings={version:1,composition:BACKGROUND_COMPOSITE_VERSION,generation:'builtin-reviewed-background-v1',width:1500,height:1500,format:'jpeg',quality:95};
 function invalidate(message='상품 또는 작업이 변경되어 이전 합성 요청을 취소했습니다.'){
  epoch++;
  if(active){active.invalid=true;view={status:'cancelled',style:active.style,key:active.key,message};}
 }
 function cancel({requestId}={}){
  if(!validId(requestId))throw Error('합성 요청 번호를 확인해 주세요.');
  cancelled.add(requestId);
  // Keep all cancellations for this process: a delayed HTTP request must not
  // become valid again merely because other requests were made afterwards.
  if(active?.requestId===requestId)invalidate();
  return {ok:true};
 }
 function stateMatches(s){
  const now=getState();
  return !now.busy&&now.photoPreparation?.status!=='preparing'&&now.product===s.product&&now.folder===s.folder&&now.revision===s.revision&&now.product?.style===s.style&&now.product?.sourceUrl===s.sourceUrl&&now.product.images?.[s.key]===s.sourceImageUrl;
 }
 function assertCurrent(s){
  if(s.invalid||s.epoch!==epoch||cancelled.has(s.requestId)||!stateMatches(s))throw changed();
  try{
   if(stamp(s.sourcePath)!==s.sourceStamp||hash(fs.readFileSync(s.sourcePath))!==s.sourceHash||stamp(s.selectionPath)!==s.selectionStamp||hash(fs.readFileSync(s.selectionPath))!==s.selectionHash)throw changed();
   const disk=JSON.parse(fs.readFileSync(path.join(s.folder,'product.json'),'utf8'));
   if(disk.style!==s.style||disk.sourceUrl!==s.sourceUrl)throw changed();
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
  const s={epoch,requestId,jobId:id(),style,key,sourceUrl:current.product.sourceUrl,sourceImageUrl:current.product.images[key],product:current.product,folder,revision:current.revision,sourcePath,sourceHash,original,sourceStamp:stamp(sourcePath),selectionPath,selectionHash:hash(selection),selectionStamp:stamp(selectionPath),started:performance.now()};
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
 function activate(s,bytes,{reused=false}={}){
  // Nothing asynchronous is allowed between this final validation and rename.
  // Node cannot interleave another product/selection mutation in this section.
  assertCurrent(s);
  const outputHash=hash(bytes),file='main-composite-'+id()+'.jpg';
  fs.writeFileSync(path.join(s.folder,file),bytes,{flag:'wx'});
  assertCurrent(s);
  atomic(path.join(s.folder,'background-image.json'),JSON.stringify({file,style:s.style,sourceUrl:s.sourceUrl,sourceKey:s.key,sourceHash:s.sourceHash,outputHash,cacheKey:s.cacheKey,settings:cacheSettings,reviewed:true,createdAt:new Date().toISOString()}));
  const result={ok:true,cached:reused,file,elapsedMs:Math.round(performance.now()-s.started),message:reused?'같은 원본의 검수된 합성 결과를 대표이미지에 적용했습니다.':'원본을 보존한 1500×1500 합성 결과를 대표이미지에 적용했습니다.'};
  view={status:'complete',style:s.style,key:s.key,...result};active=null;
  return result;
 }
 async function prepare(input){
  if(!validId(input.requestId)||cancelled.has(input.requestId))throw changed();
  invalidate('새 합성 요청으로 이전 요청을 취소했습니다.');
  const s=snapshot(input);active=s;
  view={status:'checking',style:s.style,key:s.key,message:'원본과 재사용 가능한 결과를 확인합니다.'};
  try{
   const bytes=await cached(s);assertCurrent(s);
   if(bytes)return activate(s,bytes,{reused:true});
   view={status:'waiting',style:s.style,key:s.key,message:'채팅에서 배경 생성 후 검수된 결과를 자동 처리합니다.'};
   return {ok:true,cached:false,jobId:s.jobId,sourcePath:s.sourcePath,style:s.style,key:s.key,sourceHash:s.sourceHash};
  }catch(error){if(active===s){view={status:'cancelled',style:s.style,key:s.key,message:error.message};active=null;}throw error;}
 }
 function job(jobId){if(!active||active.jobId!==jobId)throw changed();assertCurrent(active);return active;}
 async function stage({jobId,generatedPath}){
  const s=job(jobId);
  if(s.processing||s.staged)throw Error('이 요청의 합성 결과가 이미 준비 중이거나 검수 대기 중입니다.');
  if(typeof generatedPath!=='string'||!path.isAbsolute(generatedPath)||!/^\.(png|jpe?g|webp)$/i.test(path.extname(generatedPath)))throw Error('생성된 이미지의 절대 경로를 확인해 주세요.');
  if(fs.statSync(generatedPath).size>40*1024*1024)throw Error('생성 이미지 파일이 너무 큽니다.');
  s.processing=true;view={status:'processing',style:s.style,key:s.key,message:'원본 보존 합성과 규격 검사를 진행합니다.'};
  try{
   const bytes=await compose({original:s.original,generated:fs.readFileSync(generatedPath)});
   assertCurrent(s);
   const m=await picture(bytes);assertCurrent(s);
   if(m.width!==1500||m.height!==1500||m.format!=='jpeg')throw Error('합성 결과 규격이 올바르지 않습니다.');
   const previewPath=path.join(s.folder,'background-preview-'+s.jobId+'.jpg');
   fs.writeFileSync(previewPath,bytes,{flag:'wx'});s.staged={bytes,hash:hash(bytes),previewPath};
   view={status:'review',style:s.style,key:s.key,message:'원본 합성을 마쳤습니다. 최종 이미지 검수 후 자동 적용합니다.'};
   return {ok:true,jobId,previewPath,width:1500,height:1500,originalPreserved:true};
  }catch(error){if(active===s){view={status:'error',style:s.style,key:s.key,message:error.message};}throw error;}
  finally{s.processing=false;}
 }
 function complete({jobId,reviewed}){
  const s=job(jobId);
  if(reviewed!==true||!s.staged)throw Error('최종 합성 이미지의 시각 검수 후 적용해 주세요.');
  if(hash(fs.readFileSync(s.staged.previewPath))!==s.staged.hash)throw changed();
  assertCurrent(s);
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
 function inspect({jobId}){const s=job(jobId);return {ok:true,jobId,style:s.style,key:s.key,sourcePath:s.sourcePath,sourceHash:s.sourceHash,previewPath:s.staged?.previewPath};}
 return {prepare,stage,complete,select,cancel,invalidate,inspect,status:()=>view};
}
