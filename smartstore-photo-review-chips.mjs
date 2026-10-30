import {readFile,stat} from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
const cache=new Map(),normalize=value=>String(value).replace(/\s+/g,'');
// Only reuse already-collected local official chips; never fetch or analyze photos.
export async function photoReviewChips(product,folder){
 if(!folder)return {};
 let manifest;try{manifest=JSON.parse(await readFile(path.join(folder,'color-chips.json'),'utf8'));}catch{return {};}
 const result={};
 await Promise.all((product.colors||[]).map(async color=>{
  const official=product.colorChips?.find(chip=>normalize(chip.name)===normalize(color));
  if(!official)return;
  try{const url=new URL(official.url);if(!/(^|\.)giordano\.co\.kr$/i.test(url.hostname)||!url.pathname.includes(product.style))return;}catch{return;}
  const entry=manifest.find(chip=>normalize(chip.name)===normalize(color));if(!/^colorchip-\d+\.jpg$/.test(entry?.file||''))return;
  try{
   const file=path.join(folder,entry.file),info=await stat(file),key=file+'|'+info.size+'|'+info.mtimeMs+'|'+info.ctimeMs;
   let chip=cache.get(key);
   if(!chip){const bytes=await readFile(file);if(bytes.length>1024*1024)return;const meta=await sharp(bytes).metadata();if(!meta.width||!meta.height)return;const left=Math.floor(meta.width*.2),top=Math.floor(meta.height*.2);const rgb=await sharp(bytes).extract({left,top,width:meta.width-left*2,height:meta.height-top*2}).flatten({background:'#fff'}).removeAlpha().resize(1,1).raw().toBuffer();chip={image:'data:image/jpeg;base64,'+bytes.toString('base64'),color:'#'+[...rgb].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')};cache.set(key,chip);while(cache.size>128)cache.delete(cache.keys().next().value);}
   result[color]=chip;
  }catch{/* A missing chip must not block the review or trigger downloads. */}
 }));
 return result;
}
