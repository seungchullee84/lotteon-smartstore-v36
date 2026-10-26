import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import sharp from 'sharp';import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const registry=dataRoot=>path.join(dataRoot,'smartstore-photo-exclusions.json');
async function records(dataRoot){try{return JSON.parse(await readFile(registry(dataRoot),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
async function signature(bytes){return [...await sharp(bytes).flatten({background:'#fff'}).resize(16,16,{fit:'fill'}).removeAlpha().raw().toBuffer()];}
export function noticePhotoText(text){const value=String(text).replace(/\s+/g,'');return /정품상품출고안내|롯데백화점.*출고|교환.*반품.*안내|교환및반품|배송.*안내.*고객|클릭해서들어가기|지금바로.*클릭|다른상품.*구경|상품보러가기/.test(value);}
export async function rememberExcludedPhoto(bytes,reason,{dataRoot}){const list=await records(dataRoot),sha256=hash(bytes);if(!list.some(r=>r.sha256===sha256)){list.push({sha256,signature:await signature(bytes),reason});await mkdir(dataRoot,{recursive:true});await writeFile(registry(dataRoot),JSON.stringify(list,null,2));}return reason;}
export async function excludedPhotoReason(bytes,{dataRoot,recognize}={}){
 const list=await records(dataRoot);const exact=list.find(r=>r.sha256===hash(bytes));if(exact)return exact.reason;
 if(list.length){const sig=await signature(bytes);const match=list.find(r=>r.signature?.length===sig.length&&sig.reduce((sum,v,i)=>sum+Math.abs(v-r.signature[i]),0)/sig.length<=4);if(match)return match.reason;}
 if(recognize){
  const file=path.join(dataRoot,'smartstore-photo-ocr',hash(bytes)+'.json');let text;
  try{text=JSON.parse(await readFile(file,'utf8')).text;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(typeof text!=='string'){text=await recognize(bytes);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify({text}));}
  if(noticePhotoText(text)){const reason='출고·배송·교환·반품 안내 또는 홍보·클릭 유도 배너';await rememberExcludedPhoto(bytes,reason,{dataRoot});return reason;}
 }
 return '';
}
