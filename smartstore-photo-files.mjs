import {readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {imageDownloadFolder} from './desktop-downloads.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const image=/\.(jpe?g|png|webp)$/i;
export async function findPhotos(product,{desktop,photoRoots}={}){
 desktop||=path.dirname(await imageDownloadFolder());
 const roots=photoRoots||[path.join(desktop,'상품등록기사진폴더',product.style)];
 const found=new Map();
 for(const root of roots){let canonical;try{canonical=await realpath(root);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  async function walk(dir,depth=0){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const file=path.join(dir,e.name);if(e.isDirectory()&&depth<1)await walk(file,depth+1);else if(e.isFile()&&image.test(e.name)){const actual=await realpath(file);if(!actual.startsWith(canonical+path.sep))throw Error('사진 폴더 밖의 파일은 연결하지 않습니다.');const bytes=await readFile(actual);const previous=found.get(hash(bytes));if(!previous||/^1(?:번)?\./i.test(e.name)||!/^1(?:번)?\./i.test(previous.name))found.set(hash(bytes),{name:e.name,file:actual,bytes,id:hash(bytes).slice(0,20)});}}}
  await walk(canonical);
 }
 return [...found.values()].sort((a,b)=>a.file.localeCompare(b.file));
}
