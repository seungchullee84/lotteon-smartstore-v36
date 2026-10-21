import sharp from 'sharp';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
// fileURLToPath handles spaces and Korean folder names on Windows.
import {fileURLToPath} from 'node:url';
const library=path.join(path.dirname(fileURLToPath(import.meta.url)),'data','washing-icon-library.json');
export async function readIconLibrary(file=library){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {version:1,entries:[]};throw e;}}
export async function iconHash(bytes){
 const pixels=await sharp(bytes).flatten({background:'#fff'}).greyscale().threshold(180).trim({background:'#fff',threshold:10}).resize(96,96,{fit:'contain',background:'#fff'}).raw().toBuffer();
 return createHash('sha256').update(pixels).digest('hex');
}
let saving=Promise.resolve();
export function saveIconMeaning(bytes,meaning,file=library){
 const task=saving.then(()=>storeIconMeaning(bytes,meaning,file));saving=task.catch(()=>{});return task;
}
async function storeIconMeaning(bytes,meaning,file){
 const value=String(meaning||'').trim();if(!value||value.length>180)throw Error('확인한 아이콘 의미를 180자 이내로 입력해 주세요.');
 const hash=await iconHash(bytes),db=await readIconLibrary(file);
 const previous=db.entries.find(e=>e.hash===hash);
 if(previous&&previous.meaning!==value)throw Error('이미 저장한 의미와 다릅니다. 기존 학습 내용을 확인해 주세요.');
 if(!previous)db.entries.push({hash,meaning:value,confirmedAt:new Date().toISOString(),confirmedBy:'user'});
 await mkdir(path.dirname(file),{recursive:true});
 const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(db,null,2));await rename(temp,file);
 return {hash,meaning:value};
}
export async function extractWashingIcons(file,band){
 // Only the symbol area above the captions enters the matcher.
 const rect={...band,height:Math.max(1,Math.floor(band.height*.62))};
 const {data,info}=await sharp(file).extract(rect).flatten({background:'#fff'}).greyscale().raw().toBuffer({resolveWithObject:true});
 const occupied=[];
 for(let x=0;x<info.width;x++){let n=0;for(let y=2;y<info.height-2;y++)if(data[y*info.width+x]<160)n++;occupied[x]=n>=3;}
 const spans=[];let first=-1,last=-1;
 for(let x=0;x<=occupied.length+8;x++){
  if(occupied[x]){if(first<0)first=x;last=x;}
  else if(first>=0&&x-last>8){if(last-first>=18)spans.push({left:first,width:last-first+1});first=-1;}
 }
 const db=await readIconLibrary(),icons=[];
 for(const span of spans){
  if(span.width>rect.width*.25)continue;
  const image=await sharp(file).extract({left:rect.left+span.left,top:rect.top,width:span.width,height:rect.height}).png().toBuffer();
  const hash=await iconHash(image),known=db.entries.find(e=>e.hash===hash);
  const key='wash-icon-'+(icons.length+1);await writeFile(path.join(path.dirname(file),key+'.png'),image);
  icons.push({key,hash,meaning:known?.meaning||'',known:!!known});
 }
 return {icons};
}
export function iconWashingResult(icons){
 const complete=icons.length>0&&icons.every(i=>i.known&&i.meaning);
 return {complete,value:complete?[...new Set(icons.map(i=>i.meaning))].join(', '):''};
}
