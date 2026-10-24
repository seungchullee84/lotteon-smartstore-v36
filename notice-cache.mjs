import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';
import {analyzeNotice} from './notice.mjs';
export async function analyzeNoticeCached(file,{cacheRoot,log=()=>{},signal,analyze=analyzeNotice}={}){
 signal?.throwIfAborted();if(!cacheRoot)return analyze(file,log,signal);
 const hash=createHash('sha256').update(await readFile(file));
 for(const name of ['notice.mjs','washing-icons.mjs','country.mjs','data/washing-icon-library.json']){
  try{hash.update(await readFile(new URL('./'+name,import.meta.url)));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const key=hash.digest('hex'),root=path.join(cacheRoot,key),manifest=path.join(root,'analysis.json');
 try{
  const cached=JSON.parse(await readFile(manifest,'utf8'));
  if(cached.key===key&&cached.result?.ocrText&&Array.isArray(cached.icons)){
   for(const name of cached.icons){if(!/^wash-icon-[1-9]\d*\.png$/.test(name))throw Error('Invalid icon cache');await copyFile(path.join(root,name),path.join(path.dirname(file),name));}
   signal?.throwIfAborted();log('고시 원본·분석 규칙 일치 · 확인된 글자 인식 결과 재사용');return cached.result;
  }
 }catch(e){if(signal?.aborted)throw e;}
 const result=await analyze(file,log,signal);signal?.throwIfAborted();
 if(result?.ocrText){
  try{
   await mkdir(root,{recursive:true});const icons=[];
   for(const icon of result.washingIcons||[]){if(!/^wash-icon-[1-9]\d*$/.test(icon.key||''))continue;const name=icon.key+'.png';await copyFile(path.join(path.dirname(file),name),path.join(root,name));icons.push(name);}
   const tmp=manifest+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify({key,result,icons}));await rename(tmp,manifest);
  }catch{} // A cache failure must not discard a successful fresh analysis.
 }
 return result;
}
