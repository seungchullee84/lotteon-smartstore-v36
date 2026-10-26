import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {load} from 'cheerio';
import {imageDownloadFolder} from './desktop-downloads.mjs';
import {BRAND_VIDEO_HEADING_HEIGHT} from './smartstore-brand-video.mjs';
import {detectLongPhotoRegions} from './smartstore-long-photo-detect.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const root=dataRoot=>path.join(dataRoot,'smartstore-long-photo-layouts');
const thumbnail=bytes=>sharp(bytes,{limitInputPixels:false}).flatten({background:'#fff'}).resize(48,128,{fit:'fill'}).removeAlpha().raw().toBuffer();
const closePixels=(a,b,coarse=false)=>{if(a.length!==b.length)return false;let sum=0,bad=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;if(d>12)bad++;}return sum/a.length<(coarse?4:3)&&bad/a.length<(coarse?.06:.025);};
export function mannequinPhotoRegions(){
 return [...document.querySelectorAll('section[id^="smartstore-color-"]')].flatMap(section=>{
  if(section.dataset.colorSource==='official'||[...section.querySelectorAll('p')].some(p=>p.textContent.trim()==='지오다노 공식 상품 사진'))return [];
  const heading=section.querySelector('h2'),color=heading?.textContent.trim();if(!color)return [];
  return [...section.querySelectorAll('img')].map(img=>{const r=img.getBoundingClientRect();return {color,left:Math.ceil(r.left),top:Math.ceil(r.top+scrollY),width:Math.floor(r.width),height:Math.floor(r.height)};});
 });
}
export async function registerLongPhotoLayout(bytes,{style,regions,brandIntroHeight,officialTop,dataRoot=path.resolve('data')}){
 if(!/^\d{6}$/.test(style)||!regions?.length)return;
 const meta=await sharp(bytes,{limitInputPixels:false}).metadata();
 if(meta.width!==860||meta.height>150000)throw Error('긴 상세 사진 위치의 이미지 크기가 다릅니다.');
 for(const r of regions)if(!r.color||![r.left,r.top,r.width,r.height].every(Number.isInteger)||r.left<0||r.top<0||r.width<150||r.height<150||r.left+r.width>meta.width||r.top+r.height>meta.height)throw Error('마네킹 사진 위치를 확인해 주세요.');
 const records=[{bytes,offset:0,height:meta.height}];
 const first=brandIntroHeight+BRAND_VIDEO_HEADING_HEIGHT;
 if(Number.isInteger(first)&&Number.isInteger(officialTop)&&officialTop>first&&officialTop<meta.height)records.push({bytes:await sharp(bytes,{limitInputPixels:false}).extract({left:0,top:first,width:860,height:officialTop-first}).png().toBuffer(),offset:first,height:officialTop-first});
 await mkdir(root(dataRoot),{recursive:true});
 for(const record of records){
  const crops=[];
  for(const r of regions){if(r.top<record.offset||r.top+r.height>record.offset+record.height)continue;
   const region={...r,top:r.top-record.offset};const crop=await sharp(record.bytes,{limitInputPixels:false}).extract({left:region.left,top:region.top,width:region.width,height:region.height}).png().toBuffer();crops.push({...region,thumbnail:(await thumbnail(crop)).toString('base64')});
  }
  if(!crops.length)continue;const sha=digest(record.bytes);
  await writeFile(path.join(root(dataRoot),style+'-'+sha+'.json'),JSON.stringify({version:1,style,sha256:sha,width:860,height:record.height,thumbnail:(await thumbnail(record.bytes)).toString('base64'),regions:crops}));
 }
}
export async function backfillLongPhotoLayouts(style,{dataRoot=path.resolve('data'),downloadFolder,check=()=>{}}={}){
 downloadFolder||=await imageDownloadFolder();let files;try{files=(await readdir(downloadFolder)).filter(f=>f.startsWith(style+'_')&&f.endsWith('_제작정보.json'));}catch(e){if(e.code==='ENOENT')return 0;throw e;}
 if(!files.length)return 0;let count=0;const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:860,height:1200},deviceScaleFactor:1});await page.route('**/*',route=>route.request().url().startsWith('data:')?route.continue():route.abort());
  for(const f of files){check();const meta=JSON.parse(await readFile(path.join(downloadFolder,f),'utf8'));if(meta.style!==style)continue;
   const stem=path.join(downloadFolder,f.replace(/_제작정보\.json$/,''));let html,bytes;try{html=await readFile(stem+'.html','utf8');bytes=await readFile(stem+'.png');}catch(e){if(e.code==='ENOENT')continue;throw e;}
   const $=load(html);$('[data-brand-video]').remove();if(!$('section[id^="smartstore-color-"]').length)continue;
   await page.setContent($.html());await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));check();
   const height=await page.evaluate(()=>document.documentElement.scrollHeight),image=await sharp(bytes,{limitInputPixels:false}).metadata();
   if(height!==image.height||image.width!==860)continue;
   const regions=await page.evaluate(mannequinPhotoRegions);await registerLongPhotoLayout(bytes,{style,regions,brandIntroHeight:meta.brandIntroHeight,officialTop:meta.officialTop,dataRoot});count++;
  }
 }finally{await browser.close();}return count;
}
export async function extractLongMannequinPhotos(bytes,{style,colors,dataRoot=path.resolve('data'),backfill=true,detect=true,recognize,check=()=>{}}){
 const meta=await sharp(bytes,{limitInputPixels:false}).metadata();if(meta.width<300||meta.height>150000||meta.width*meta.height>150000000)return [];
 const find=async()=>{
  let files;try{files=(await readdir(root(dataRoot))).filter(f=>f.startsWith(style+'-')&&f.endsWith('.json'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const sha=digest(bytes);let thumb;
  for(const file of files){check();const record=JSON.parse(await readFile(path.join(root(dataRoot),file),'utf8'));if(record.style!==style||!record.regions?.length)continue;
   const scale=meta.width/record.width;if(Math.abs(meta.height-record.height*scale)>2)continue;
   if(record.sha256!==sha){thumb||=await thumbnail(bytes);if(!closePixels(thumb,Buffer.from(record.thumbnail,'base64'),true))continue;}
   const crops=[];let valid=true;
   for(const r of record.regions){if(!colors.includes(r.color)){valid=false;break;}
    const rect={left:Math.round(r.left*scale),top:Math.round(r.top*scale),width:Math.round(r.width*scale),height:Math.round(r.height*scale)};
    if(rect.left+rect.width>meta.width||rect.top+rect.height>meta.height){valid=false;break;}
    const cropped=await sharp(bytes,{limitInputPixels:false}).extract(rect).png().toBuffer();
    if(record.sha256!==sha&&!closePixels(await thumbnail(cropped),Buffer.from(r.thumbnail,'base64'))){valid=false;break;}
    crops.push({bytes:cropped,colorHint:r.color,extractedFromLong:true,sourceRectangle:rect,layoutHash:record.sha256});
   }
   if(valid)return crops;
  }return [];
 };
 let result=await find();if(!result.length&&backfill){await backfillLongPhotoLayouts(style,{dataRoot,check});result=await find();}
 if(!result.length&&detect){
  const normalized=meta.width===860?bytes:await sharp(bytes,{limitInputPixels:false}).resize({width:860}).png().toBuffer();
  const regions=await detectLongPhotoRegions(normalized,{style,colors,recognize,check});
  if(regions.length){await registerLongPhotoLayout(normalized,{style,regions,dataRoot});result=await find();}
 }
 return result;
}
