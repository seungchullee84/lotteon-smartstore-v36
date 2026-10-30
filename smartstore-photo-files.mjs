import {readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {imageDownloadFolder} from './desktop-downloads.mjs';
import {readPhotoMappings} from './smartstore-photo-mapping-cache.mjs';
import {readPhotoFileSelection} from './smartstore-photo-file-selection.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const image=/\.(jpe?g|png|webp)$/i;
export async function resolveStylePhotoFolders(parent,style){
 if(!/^\d{6}$/.test(style||''))throw Error('사진 폴더의 품번 6자리를 확인해 주세요.');
 let entries;try{entries=await readdir(parent,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
 return entries.filter(e=>e.isDirectory()&&(e.name===style||(e.name.startsWith(style)&&!/^\d/.test(e.name.slice(6)))))
  .map(e=>path.join(parent,e.name)).sort((a,b)=>a.localeCompare(b));
}
export async function findPhotos(product,{desktop,photoRoots,dataRoot=path.resolve('data'),includeExcluded=false}={}){
 if(!photoRoots)desktop||=path.dirname(await imageDownloadFolder());
 const roots=photoRoots||await resolveStylePhotoFolders(path.join(desktop,'상품등록기사진폴더'),product.style);
 const found=new Map();
 for(const root of roots){let canonical;try{canonical=await realpath(root);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  async function walk(dir,depth=0){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const file=path.join(dir,e.name);if(e.isDirectory()&&depth<1)await walk(file,depth+1);else if(e.isFile()&&image.test(e.name)){const actual=await realpath(file);if(!actual.startsWith(canonical+path.sep))throw Error('사진 폴더 밖의 파일은 연결하지 않습니다.');const bytes=await readFile(actual);found.set(actual,{name:e.name,file:actual,bytes,id:hash(Buffer.from(actual+'|'+hash(bytes))).slice(0,20)});}}}
  await walk(canonical);
 }
 const excluded=includeExcluded?new Set():new Set((await readPhotoMappings(dataRoot,product)).filter(p=>p.reviewed&&p.role==='excluded').map(p=>p.hash));
 const selected=includeExcluded?new Map():new Map((await readPhotoFileSelection(dataRoot,product)).map(item=>[item.id,item]));
 return [...found.values()].filter(p=>{
  const digest=hash(p.bytes),choice=selected.get(p.id);
  // A file choice is bound to its path/content id. Excluding a duplicate copy
  // must not exclude the separately selected original with identical bytes.
  if(choice?.hash===digest)return choice.role!=='excluded';
  return !excluded.has(digest);
 }).sort((a,b)=>a.file.localeCompare(b.file));
}
