import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {buildDetailContent} from './detail-html.mjs';

export async function saveLongDetailImage(product,folder,output){
 const {sources}=buildDetailContent(product.images,product.colors,product.colorImages,product.originalDetailUrl);
 if(!sources.length)throw Error('저장할 상세이미지가 없습니다.');
 const images=new Map();
 for(const src of new Set(sources)){
  const key=Object.keys(product.images).find(k=>product.images[k]===src);
  if(!/^(detail|size|check|info|main|extra[12]|color[1-9]\d*_[12])$/.test(key||''))throw Error('상세 원본 파일 확인 필요');
  const bytes=await readFile(path.join(folder,key+'.jpg'));
  const metadata=await sharp(bytes).rotate().png().toBuffer({resolveWithObject:true});
  images.set(src,{bytes:metadata.data,width:metadata.info.width,height:metadata.info.height});
 }
 const preferred=images.get(product.images.detail)||images.get(product.images.main)||images.values().next().value;
 const width=preferred.width;
 const plan=[];
 const groups=!product.images.detail?(product.colors||[]).map(color=>({color,urls:[...new Set(product.colorImages?.[color]||[])].slice(0,2)})).filter(g=>g.urls.length):[];
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 if(groups.length){
  for(const group of groups){
   plan.push({heading:group.color});for(const src of group.urls)plan.push({src});
  }
  for(const src of [...new Set(['size','check','info'].map(k=>product.images[k]).filter(Boolean))])plan.push({src});
 }else for(const src of sources)plan.push({src});
 const layers=[];let height=0;
 for(const item of plan){
  let input,h;
  if(item.heading){h=100;input=Buffer.from(`<svg width="${width}" height="100"><rect width="100%" height="100%" fill="white"/><text x="50%" y="62" text-anchor="middle" font-family="Malgun Gothic, sans-serif" font-size="28" fill="#222">${escape(item.heading)}</text></svg>`);}
  else{
   const image=images.get(item.src),scaledWidth=Math.min(width,image.width);
   h=Math.max(1,Math.round(image.height*scaledWidth/image.width));
   const left=Math.floor((width-scaledWidth)/2),right=width-scaledWidth-left;
   input=await sharp(image.bytes).resize(scaledWidth,h).flatten({background:'#fff'}).extend({left,right,top:0,bottom:0,background:'#fff'}).png().toBuffer();
  }
  layers.push({input,left:0,top:height});height+=h;
 }
 await sharp({create:{width,height,channels:3,background:'#fff'},limitInputPixels:false}).composite(layers).png().toFile(output);
 return {width,height,count:plan.filter(i=>i.src).length};
}
