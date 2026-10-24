import {readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {imageDownloadFolder} from './desktop-downloads.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const image=/\.(jpe?g|png|webp)$/i;
export async function findPhotos(product,{desktop,photoRoots}={}){
 desktop||=path.dirname(await imageDownloadFolder());
 const roots=photoRoots||['마네킨 컷','마네킹 컷','마네킨컷','마네킹컷',''].map(name=>path.join(desktop,name,product.style));
 const found=new Map();
 for(const root of roots){let canonical;try{canonical=await realpath(root);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  async function walk(dir,depth=0){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const file=path.join(dir,e.name);if(e.isDirectory()&&depth<1)await walk(file,depth+1);else if(e.isFile()&&image.test(e.name)){const actual=await realpath(file);if(!actual.startsWith(canonical+path.sep))throw Error('사진 폴더 밖의 파일은 연결하지 않습니다.');const bytes=await readFile(actual);found.set(hash(bytes),{name:e.name,file:actual,bytes,id:hash(bytes).slice(0,20)});}}}
  await walk(canonical);
 }
 if(found.size>40)throw Error('한 상품의 사진은 40장 이내로 정리해 주세요.');return [...found.values()].sort((a,b)=>a.file.localeCompare(b.file));
}
