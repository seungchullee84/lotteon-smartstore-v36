import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';

const formats={jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
const invalid=()=>Object.assign(new Error('스마트스토어 사진 파일 경로를 확인해 주세요.'),{code:'SMARTSTORE_PHOTO_INVALID'});

// A preview can create an original PNG/WebP before the product state includes
// its mapping. Read the full file before the HTTP caller sends any headers.
export async function readSmartstorePhoto(folder,id,photoFiles={}){
 if(typeof folder!=='string'||!folder||typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))throw invalid();
 const key='/smartstore-photo/'+id,hasMapping=Object.hasOwn(photoFiles,key),mapped=photoFiles[key];
 if(hasMapping&&(typeof mapped!=='string'||!new RegExp('^smartstore-photo-'+id+'\\.(jpg|png|webp)$').test(mapped)))throw invalid();
 const names=hasMapping?[mapped]:Object.keys(formats).map(extension=>'smartstore-photo-'+id+'.'+extension);
 for(const name of names){
  const file=path.join(folder,name);
  try{
   const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw invalid();
   const bytes=await readFile(file),extension=path.extname(name).slice(1);
   return {bytes,mime:formats[extension]};
  }catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
 }
 return null;
}
