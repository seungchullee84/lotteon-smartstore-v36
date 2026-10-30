import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const run=promisify(execFile);
import {LOCAL_PHOTO_POLICY,garmentKind} from './smartstore-local-photo-policy.mjs';
export function acceptedLocalPrediction(result,colors){
 if(result?.method===LOCAL_PHOTO_POLICY)return result.status==='supported'&&!!result.evidence&&(result.role==='care-label'?Number.isFinite(result.evidence.careScore)&&result.evidence.careScore>=.8&&result.evidence.careScore<=1:['front','side','back','detail'].includes(result.role)&&colors.includes(result.color)&&Number.isFinite(result.evidence.coverage)&&result.evidence.coverage>=.05&&result.evidence.coverage<=1&&!!result.evidence.colorBasis);
 return !!result&&['front','side','back','detail'].includes(result.role)&&colors.includes(result.color)&&Number.isFinite(result.roleScore)&&result.roleScore>=0.65&&Number.isFinite(result.roleMargin)&&result.roleMargin>=0.15&&Number.isFinite(result.colorScore)&&result.colorScore>=0.65&&Number.isFinite(result.colorMargin)&&result.colorMargin>=0.15;
}
// Runs once per original hash. Uncertain results remain in the full detail gallery.
export async function classifyLocalPhotos(product,photos,{dataRoot,signal,log=()=>{},predict,folder,draftColors=false}={}){
 signal?.throwIfAborted();
 if(!photos.length)return [];
 let settings;
 if(!predict){try{settings=JSON.parse(await readFile(path.join(dataRoot,'photo-local-runtime.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;log('사진 자동 판별: 로컬 모델 설정 필요 · 원본 전체 유지');return [];}}
 const cacheRoot=path.join(dataRoot,'local-photo-predictions');await mkdir(cacheRoot,{recursive:true});
 const kind=garmentKind(product);
 const colorChips=[];if(folder)for(let i=0;i<product.colors.length;i++){const file=path.join(folder,'colorchip-'+i+'.jpg');try{colorChips.push({color:product.colors[i],file,hash:createHash('sha256').update(await readFile(file)).digest('hex')});}catch(e){if(e.code!=='ENOENT')throw e;colorChips.push({color:product.colors[i],file:null,hash:null});}}
 const featureVersion=createHash('sha256').update(await readFile(new URL('./smartstore-local-photo-worker.mjs',import.meta.url))).update(JSON.stringify(settings||{})).update(draftColors?'color-only-v1':'full-v1').digest('hex');
 const revision=createHash('sha256').update(await readFile(new URL('./smartstore-local-photo-worker.mjs',import.meta.url))).update(await readFile(new URL('./smartstore-local-photo-policy.mjs',import.meta.url))).update(JSON.stringify([settings,kind,colorChips.map(c=>c.hash),draftColors])).digest('hex');
 const results=[],pending=[];
 for(const photo of photos){const hash=createHash('sha256').update(photo.bytes).digest('hex');const key=createHash('sha256').update(JSON.stringify([revision,product.style,product.sourceUrl,product.colors,hash])).digest('hex');let cached;try{cached=JSON.parse(await readFile(path.join(cacheRoot,key+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
  if(cached?.analysisVersion===revision)results.push({photo,key,...cached});else pending.push({photo,key,hash});
 }
 if(pending.length){
  log('사진 자동 판별 실행 · 새 원본 '+pending.length+'장 · 로컬 모델');
  let predictions;
  if(predict)predictions=await predict(pending.map(p=>p.photo),product);
  else{
   await mkdir(settings.tempRoot,{recursive:true});const temp=await mkdtemp(path.join(settings.tempRoot,'photo-'));
   try{const input=path.join(temp,'input.json'),output=path.join(temp,'output.json');await writeFile(input,JSON.stringify({settings,analysisVersion:revision,featureVersion,colorOnly:draftColors,kind,colors:product.colors,colorChips,photos:pending.map(p=>({file:p.photo.file}))}));const inference=run(process.execPath,[fileURLToPath(new URL('./smartstore-local-photo-worker.mjs',import.meta.url)),input,output],{windowsHide:true,signal,timeout:Math.max(240000,pending.length*30000),maxBuffer:65536});let progress='';inference.child?.stdout?.on('data',chunk=>{progress+=chunk.toString();const lines=progress.split('\n');progress=lines.pop();for(const line of lines)if(line.startsWith('사진 대조 '))log(line.trim());});await inference;predictions=JSON.parse(await readFile(output,'utf8'));}
   catch(error){signal?.throwIfAborted();log('사진 자동 판별 미완료 · '+error.message.split('\n')[0]+' · 원본 전체 유지');return [];}
   finally{await rm(temp,{recursive:true,force:true});}
  }
  for(let i=0;i<pending.length;i++){const item=pending[i],prediction=predictions[i]||{};await writeFile(path.join(cacheRoot,item.key+'.json'),JSON.stringify({analysisVersion:revision,prediction}));results.push({...item,prediction});}
 }
 const accepted=results.filter(r=>acceptedLocalPrediction(r.prediction,product.colors)).map(r=>({...r.photo,color:r.prediction.color,role:r.prediction.role,automatic:true,autoValidated:r.prediction.method===LOCAL_PHOTO_POLICY,evidence:r.prediction.evidence}));
 log('사진 자동 판별 결과 · 추정 배치 '+accepted.length+'장 · 추가 확인 '+(photos.length-accepted.length)+'장');
 if(draftColors)return results.filter(r=>acceptedLocalPrediction(r.prediction,product.colors)||(product.colors.includes(r.prediction?.color)&&r.prediction?.evidence?.coverage>=.05)).map(r=>({...r.photo,color:r.prediction.color,role:r.prediction.role,automatic:true,needsReview:!acceptedLocalPrediction(r.prediction,product.colors),evidence:r.prediction.evidence}));
 return accepted;
}
