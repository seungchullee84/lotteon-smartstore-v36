import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
export const PHOTO_WORK_VERSION='1500x750-jpg-v1';
const defaultData=path.join(path.dirname(fileURLToPath(import.meta.url)),'data');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pending=new Map();
export async function normalizedPhotoBytes(bytes){
 return sharp(bytes,{limitInputPixels:80000000}).rotate().resize(1500,750,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toBuffer();
}
export async function cachedPhotoWorkFile(bytes,root){
 const sourceHash=digest(bytes),file=path.join(root,sourceHash+'-'+PHOTO_WORK_VERSION+'.jpg');
 if(pending.has(file))return pending.get(file);
 const task=(async()=>{
  try{
   const record=JSON.parse(await readFile(file+'.json','utf8')),current=await readFile(file);
   if(record.version===PHOTO_WORK_VERSION&&record.sourceHash===sourceHash&&record.outputHash===digest(current))return file;
  }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  const converted=await normalizedPhotoBytes(bytes);await mkdir(root,{recursive:true});
  await writeFile(file+'.tmp',converted);await rename(file+'.tmp',file);
  await writeFile(file+'.json',JSON.stringify({version:PHOTO_WORK_VERSION,sourceHash,outputHash:digest(converted),width:1500,height:750,format:'jpeg'}));
  return file;
 })();pending.set(file,task);
 try{return await task;}finally{pending.delete(file);}
}
export async function workingProductPhoto(photo,product,{dataRoot=defaultData}={}){
 if(!/^\d{6}$/.test(product?.style||''))throw Error('사진 변환 대상 품번을 확인해 주세요.');
 const bytes=photo.bytes||await readFile(photo.file);
 return cachedPhotoWorkFile(bytes,path.join(dataRoot,'smartstore-photo-work',product.style));
}
