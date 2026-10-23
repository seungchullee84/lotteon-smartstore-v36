import sharp from 'sharp';
import {decorateMainImage} from './color-chips.mjs';
import path from 'node:path';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
async function writePreparedImage(output,bytes){
 const temporary=output+'.'+randomBytes(8).toString('hex')+'.tmp';
 await writeFile(temporary,bytes);
 await rename(temporary,output);
}
export function isPants(product){return /바지|팬츠|슬랙스|데님|청바지|레깅스|PANTS|DENIM|JEANS|SHORTS|TROUSERS/i.test([product.rawName,product.name,...(product.sourceCategory||[])].filter(Boolean).join(' '));}
export async function pantsCropTop(file,width,height){
 const scanHeight=Math.min(height,width*3);
 // Keep original row positions; only reduce horizontal resolution.
 const {data,info}=await sharp(file).extract({left:0,top:0,width,height:scanHeight}).resize(160,scanHeight,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const rows=[];let streak=0;
 for(let y=0;y<info.height;y++){
  let white=0,sum=0;for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels;const r=data[i],g=data[i+1],b=data[i+2];sum+=(r+g+b)/3;if(r>246&&g>246&&b>246)white++;}
  rows.push(sum/info.width);streak=white/info.width>.985?streak+1:0;
  if(streak<5)continue;
  const separator=y-streak+1;if(separator<width*.7)continue;
  let photoEnd=separator;
  // A pale separator/shadow can begin before its pure white rows.
  for(let row=Math.max(1,separator-Math.ceil(width*.06));row<separator;row++){
   if(rows[row]>242&&rows[row]-rows[row-1]>4){photoEnd=row-1;break;}
  }
  return Math.max(0,photoEnd-width);
 }
 throw Error('바지 상세 상단 사진의 끝을 확인하지 못했습니다. 바지 전체가 보이는 대표 컷을 확인해 주세요.');
}
export async function prepareMainImage(folder,key='main'){
 if(!['main','extra1','extra2'].includes(key))throw Error('잘못된 이미지 종류입니다.');
 const output=path.join(folder,key+'-1500.jpg');
 const composite=await backgroundImageStatus(folder,key);
 if(composite.ready)return key==='main'?decorateMainImage(folder,composite.file):composite.file;
 if(key==='main'){
  const selectedProduct=JSON.parse(await readFile(path.join(folder,'product.json'),'utf8'));
  if(/^\d{6}$/.test(selectedProduct.style)){
   let approved;try{approved=await readFile(path.join(folder,'..','main-overrides',selectedProduct.style+'.jpg'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(approved){const size=await sharp(approved).metadata();if(size.width!==1500||size.height!==1500)throw Error('승인 대표이미지 크기가 올바르지 않습니다.');await writePreparedImage(output,approved);return decorateMainImage(folder,output);}
  }
  // Collection may explicitly approve official gallery photos when the detail
  // source is missing. Preserve the whole photo rather than crop a missing file.
  if(selectedProduct.detailFallbackApproved===true&&!selectedProduct.originalDetailUrl&&!selectedProduct.images?.detail){
   await writePreparedImage(output,await sharp(path.join(folder,'main.jpg')).rotate().resize(1500,1500,{fit:'contain',background:'#ffffff'}).jpeg({quality:95}).toBuffer());
   return decorateMainImage(folder,output);
  }
  let meta;try{meta=await sharp(path.join(folder,'detail.jpg')).metadata();}catch{throw Error('상세 원본 상단 사진이 없어 대표이미지를 만들 수 없습니다.');}
  if(!meta.width||meta.height<meta.width)throw Error('상세 상단 사진의 정사각형 영역을 확인해 주세요.');
  const product=JSON.parse(await readFile(path.join(folder,'product.json'),'utf8'));
  const top=isPants(product)?await pantsCropTop(path.join(folder,'detail.jpg'),meta.width,meta.height):0;
  await writePreparedImage(output,await sharp(path.join(folder,'detail.jpg')).extract({left:0,top,width:meta.width,height:meta.width}).resize(1500,1500).jpeg({quality:95}).toBuffer());
 }else{
  await writePreparedImage(output,await sharp(path.join(folder,key+'.jpg')).rotate().resize(1500,1500,{fit:'contain',background:'#ffffff'}).jpeg({quality:95}).toBuffer());
 }
 return key==='main'?decorateMainImage(folder,output):output;
}

export async function backgroundImageStatus(folder,key='main'){
 if(!['main','extra1','extra2'].includes(key))throw Error('잘못된 이미지 종류입니다.');
 let request;
 const manifest=key==='main'?'background-image.json':'background-image-'+key+'.json';
 try{request=JSON.parse(await readFile(path.join(folder,manifest),'utf8'));}catch(e){if(e.code==='ENOENT')return {ready:false};throw e;}
 if(!new RegExp('^'+key+'-composite-[a-f0-9]{24}\\.jpg$').test(request.file))throw Error('합성 이미지 경로가 올바르지 않습니다.');
 const file=path.join(folder,request.file);
 try{
  const bytes=await readFile(file);
  const size=await sharp(bytes).metadata();
  if(size.width!==1500||size.height!==1500)return {ready:false};
  return {ready:true,file,version:request.file};
 }catch(e){if(e.code==='ENOENT')return {ready:false};throw e;}
}

export async function backgroundSelection(folder){
 try{const value=JSON.parse(await readFile(path.join(folder,'background-selection.json'),'utf8'));return ['main','extra1','extra2'].includes(value.key)?value.key:'main';}
 catch(e){if(e.code==='ENOENT')return 'main';throw e;}
}

export async function applyExtraExclusions(folder,product){
 let excluded;
 try{excluded=JSON.parse(await readFile(path.join(folder,'excluded-extra-images.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return;throw e;}
 product.images={...product.images};
 for(const key of ['extra1','extra2'])if(excluded[key]===true)product.images[key]=null;
}

export async function excludeExtraImage(folder,product,key){
 if(!['extra1','extra2'].includes(key))throw Error('추가이미지만 제외할 수 있습니다.');
 let excluded={};
 try{excluded=JSON.parse(await readFile(path.join(folder,'excluded-extra-images.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 excluded[key]=true;
 const temporary=path.join(folder,'excluded-extra-images.tmp');
 await writeFile(temporary,JSON.stringify(excluded));
 await rename(temporary,path.join(folder,'excluded-extra-images.json'));
 await applyExtraExclusions(folder,product);
}
