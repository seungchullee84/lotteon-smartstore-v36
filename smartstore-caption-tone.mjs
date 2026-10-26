import {readFile} from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export function toneContrast(rgb,background=[246,243,239]){const a=luminance(rgb),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
export function readableCaptionTone(rgb){let result=rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))));for(let i=0;i<100&&toneContrast(result)<4.5;i++)result=result.map(v=>Math.floor(v*.96));return '#'+result.map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function collectCaptionTones(product,folder){
 let chips;try{chips=JSON.parse(await readFile(path.join(folder,'color-chips.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}
 const norm=s=>String(s).replace(/\s+/g,'');const result={};
 for(const color of product.colors||[]){
  const chip=chips.find(c=>norm(c.name)===norm(color));if(!chip||!/^colorchip-\d+\.jpg$/.test(chip.file))continue;
  const official=product.colorChips?.find(c=>norm(c.name)===norm(color));if(!official)continue;
  try{const bytes=await readFile(path.join(folder,chip.file)),meta=await sharp(bytes).metadata();const left=Math.floor(meta.width*.2),top=Math.floor(meta.height*.2);const {data}=await sharp(bytes).extract({left,top,width:meta.width-2*left,height:meta.height-2*top}).flatten({background:'#fff'}).removeAlpha().resize(1,1).raw().toBuffer({resolveWithObject:true});result[color]=readableCaptionTone([...data].slice(0,3));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return result;
}
