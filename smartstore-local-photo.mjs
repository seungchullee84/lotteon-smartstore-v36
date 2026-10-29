import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const run=promisify(execFile);
export function acceptedLocalPrediction(result,colors){
 return result&&['front','side','back','detail'].includes(result.role)&&colors.includes(result.color)&&result.roleScore>=.90&&result.roleMargin>=.25&&result.colorScore>=.90&&result.colorMargin>=.25;
}
// Runs once per original hash. Uncertain results remain in the full detail gallery.
export async function classifyLocalPhotos(product,photos,{dataRoot,signal,log=()=>{},predict}={}){
 if(!photos.length)return [];
 let settings;
 if(!predict){try{settings=JSON.parse(await readFile(path.join(dataRoot,'photo-local-runtime.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;log('사진 자동 판별: 로컬 모델 설정 필요 · 원본 전체 유지');return [];}}
 const cacheRoot=path.join(dataRoot,'local-photo-predictions');await mkdir(cacheRoot,{recursive:true});
 const results=[],pending=[];
 for(const photo of photos){const hash=createHash('sha256').update(photo.bytes).digest('hex');const key=createHash('sha256').update(JSON.stringify([1,product.style,product.sourceUrl,product.colors,hash])).digest('hex');let cached;try{cached=JSON.parse(await readFile(path.join(cacheRoot,key+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
  if(cached)results.push({photo,key,...cached});else pending.push({photo,key,hash});
 }
 if(pending.length){
  log('사진 자동 판별 실행 · 새 원본 '+pending.length+'장 · 로컬 모델');
  let predictions;
  if(predict)predictions=await predict(pending.map(p=>p.photo),product);
  else{
   await mkdir(settings.tempRoot,{recursive:true});const temp=await mkdtemp(path.join(settings.tempRoot,'photo-'));
   try{const input=path.join(temp,'input.json'),output=path.join(temp,'output.json');await writeFile(input,JSON.stringify({settings,colors:product.colors,photos:pending.map(p=>({file:p.photo.file}))}));await run(process.execPath,[fileURLToPath(new URL('./smartstore-local-photo-worker.mjs',import.meta.url)),input,output],{windowsHide:true,signal,timeout:240000,maxBuffer:65536});predictions=JSON.parse(await readFile(output,'utf8'));}
   catch(error){signal?.throwIfAborted();log('사진 자동 판별 미완료 · '+error.message.split('\n')[0]+' · 원본 전체 유지');return [];}
   finally{await rm(temp,{recursive:true,force:true});}
  }
  for(let i=0;i<pending.length;i++){const item=pending[i],prediction=predictions[i]||{};await writeFile(path.join(cacheRoot,item.key+'.json'),JSON.stringify({prediction}));results.push({...item,prediction});}
 }
 const accepted=results.filter(r=>acceptedLocalPrediction(r.prediction,product.colors)).map(r=>({...r.photo,color:r.prediction.color,role:r.prediction.role,automatic:true}));
 log('사진 자동 판별 결과 · 연결 '+accepted.length+'장 · 확인 필요 '+(photos.length-accepted.length)+'장');return accepted;
}
