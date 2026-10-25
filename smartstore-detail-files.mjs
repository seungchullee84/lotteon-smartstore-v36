import {readFile,writeFile,mkdir,readdir,realpath,access,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {imageDownloadFolder} from './desktop-downloads.mjs';
import {smartstoreDetailDocument,TEMPLATE_ASSET_NAMES,TEMPLATE_ASSET_BASE} from './smartstore-detail.mjs';
import {exportBrandVideo,requireBrandVideo,productVideoOptions} from './smartstore-brand-video.mjs';
import {renderCacheKey,restoreRenderedDetail,cacheRenderedDetail} from './smartstore-render-cache.mjs';
const appRoot=path.dirname(fileURLToPath(import.meta.url));
const assetsRoot=path.join(appRoot,'public/smartstore-template');
const inside=(root,file)=>file.startsWith(root+path.sep);
const normalize=s=>String(s).replace(/\s+/g,'').toLowerCase();
const imageExtension=/\.(jpe?g|png|webp)$/i;
function validStyle(p){if(!/^\d{5,8}$/.test(p?.style||''))throw Error('현재 상품의 품번을 확인해 주세요.');return String(p.style);}

export async function prepareSmartstoreDetail(product,folder,{dataRoot=path.join(appRoot,'data'),mannequinRoots}={}){
 const style=validStyle(product);const draftRoot=path.join(dataRoot,'smartstore-details',style);
 let draft=null;try{draft=JSON.parse(await readFile(path.join(draftRoot,'draft.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(draft&&(String(draft.style)!==style||draft.sourceUrl!==product.sourceUrl))throw Error('상세페이지 준비 자료의 품번·공식 출처가 현재 상품과 다릅니다.');
 const prepared={style,includeBrandVideo:true,colorImages:{},sellingPoints:[],photoCount:0,photoFiles:{},sourceUrl:product.sourceUrl};
 if(draft){
  if(draft.headline)prepared.headline=String(draft.headline).slice(0,200);
  if(draft.sellingPoints){if(!Array.isArray(draft.sellingPoints)||draft.sellingPoints.some(p=>!p.title||!p.description||!p.evidence))throw Error('소구점의 공식 확인 근거를 함께 저장해 주세요.');prepared.sellingPoints=draft.sellingPoints.slice(0,3);}
 }
 const attach=async(color,file,allowedRoot)=>{
  if(!product.colors.includes(color))throw Error('현재 상품에 없는 색상의 마네킨 컷입니다: '+color);
  const canonicalRoot=await realpath(allowedRoot),canonical=await realpath(file);
  if(!inside(canonicalRoot,canonical)||!imageExtension.test(canonical))throw Error('마네킨 컷 파일 위치를 확인해 주세요.');
  const bytes=await readFile(canonical);const meta=await sharp(bytes,{limitInputPixels:80000000}).metadata();
  if(!['jpeg','png','webp'].includes(meta.format))throw Error('지원하지 않는 마네킨 이미지 형식');
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,24);const name='smartstore-photo-'+hash+'.jpg';
  await writeFile(path.join(folder,name),await sharp(bytes).rotate().jpeg({quality:96}).toBuffer());
  const src='/smartstore-photo/'+hash;prepared.photoFiles[src]=name;
  prepared.colorImages[color]||=[];
  if(!prepared.colorImages[color].includes(src)){prepared.colorImages[color].push(src);prepared.photoCount++;}
 };
 if(draft?.photos){
  if(!Array.isArray(draft.photos))throw Error('마네킨 컷 연결 자료를 확인해 주세요.');
  for(const group of draft.photos){if(!Array.isArray(group.files))throw Error('색상별 사진 목록이 필요합니다.');for(const relative of group.files.slice(0,3)){
   if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('마네킨 컷은 준비 자료 폴더 안의 파일만 연결합니다.');
   await attach(group.color,path.resolve(draftRoot,relative),draftRoot);
  }}
 }else{
  if(!mannequinRoots){const desktop=path.dirname(await imageDownloadFolder());mannequinRoots=[path.join(desktop,'상품등록기사진폴더')];}
  for(const root of mannequinRoots){
   const productRoot=path.join(root,style);let entries;
   try{entries=await readdir(productRoot,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
   // Unlabelled loose files are left for the assistant's visual mapping; never infer a product from a date filename.
   for(const color of product.colors||[]){
    const label=normalize(color).replace(/^\d+/,''),matches=[];
    for(const e of entries){
     if(e.isDirectory()&&[normalize(color),label].includes(normalize(e.name))){for(const file of (await readdir(path.join(productRoot,e.name))).sort())if(imageExtension.test(file))matches.push(path.join(productRoot,e.name,file));}
     else if(e.isFile()&&imageExtension.test(e.name)&&label&&normalize(e.name).includes(label))matches.push(path.join(productRoot,e.name));
    }
    for(const file of matches.slice(0,3))await attach(color,file,productRoot);
   }
   if(prepared.photoCount)break;
  }
 }
 const p={...product,smartstoreDetail:prepared};
 return p;
}

export function localSmartstorePreview(p){
 const map=new Map(Object.entries(p.images).map(([key,src])=>[src,'/image/'+key]));
 return smartstoreDetailDocument(p,{assetBase:'/smartstore-template/',fontUrl:'/smartstore-template/GowunDodum-Regular.ttf',imageUrl:src=>map.get(src)||src});
}

export async function saveSmartstoreDetail(product,folder,output,{signal,...options}={}){
 const videoOptions={...productVideoOptions(product),...options.videoOptions};
 await requireBrandVideo(options.dataRoot,videoOptions);
 const p=await prepareSmartstoreDetail(product,folder,options);const data=new Map();
 const check=()=>{if(signal?.aborted)throw Error('상세페이지 만들기를 중단했습니다.');};check();
 for(const name of TEMPLATE_ASSET_NAMES.filter(n=>!n.endsWith('.ttf')))data.set(TEMPLATE_ASSET_BASE+name,'data:image/jpeg;base64,'+(await readFile(path.join(assetsRoot,name))).toString('base64'));
 for(const [key,src] of Object.entries(p.images)){
  if(!/^(detail|size|check|info|main|extra[12]|color[1-9]\d*_[123])$/.test(key))continue;
  try{const bytes=await readFile(path.join(folder,key+'.jpg'));data.set(src,'data:image/jpeg;base64,'+(await sharp(bytes).rotate().resize({width:860,withoutEnlargement:true}).jpeg({quality:96}).toBuffer()).toString('base64'));}catch(e){if(e.code==='ENOENT')throw Error('현재 상품의 '+key+' 원본 파일을 확인해 주세요.');throw e;}
 }
 for(const [src,file] of Object.entries(p.smartstoreDetail.photoFiles))data.set(src,'data:image/jpeg;base64,'+(await readFile(path.join(folder,file))).toString('base64'));
 const imageUrl=src=>{if(!data.has(src))throw Error('현재 상품에 연결되지 않은 상세 이미지: '+src);return data.get(src);};
 const fontUrl='data:font/ttf;base64,'+(await readFile(path.join(assetsRoot,'GowunDodum-Regular.ttf'))).toString('base64');
 const document=smartstoreDetailDocument(p,{imageUrl,fontUrl,includeVideo:false,includeNavigation:false});
 const cacheRoot=path.join(options.dataRoot||path.join(appRoot,'data'),'smartstore-render-cache');
 const cacheKey=await renderCacheKey(document.html);let height,brandIntroHeight,renderCacheHit=false;
 let browser;const close=()=>browser?.close().catch(()=>{});signal?.addEventListener('abort',close,{once:true});
 const partial=output+'.partial';
 try{
  const cached=await restoreRenderedDetail(cacheRoot,p.style,cacheKey,output);check();
  if(cached&&Number.isFinite(cached.brandIntroHeight)){height=cached.height;brandIntroHeight=cached.brandIntroHeight;renderCacheHit=true;options.log?.('사진·문구·템플릿 일치 · 상세이미지 재사용');}
  else{
  browser=await chromium.launch({headless:true});check();
  const page=await browser.newPage({viewport:{width:860,height:1200},deviceScaleFactor:1});
  await page.setContent(document.html);await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));check();
  height=await page.evaluate(()=>document.documentElement.scrollHeight);
  brandIntroHeight=await page.locator('[data-brand-intro]').evaluate(n=>Math.ceil(n.getBoundingClientRect().height));
  if(height>150000)throw Error('상세페이지가 너무 깁니다. 사진 개수와 원본 길이를 확인해 주세요.');
  const layers=[];for(let top=0;top<height;top+=4096){check();layers.push({input:await page.screenshot({type:'png',fullPage:true,clip:{x:0,y:top,width:860,height:Math.min(4096,height-top)}}),left:0,top});}
  await sharp({create:{width:860,height,channels:3,background:'#fff'},limitInputPixels:false}).composite(layers).png().toFile(partial);check();
  const {rename}=await import('node:fs/promises');await rename(partial,output);
  await cacheRenderedDetail(cacheRoot,p.style,cacheKey,output,height,{brandIntroHeight});
  }
  const stem=output.replace(/\.[^.]+$/,'');
  const video=await exportBrandVideo(stem,options.dataRoot,videoOptions);check();
  await writeFile(stem+'.html',smartstoreDetailDocument(p,{imageUrl,fontUrl,videoUrl:encodeURIComponent(video.filename)}).html);
  const videoGuidePath=stem+'_영상안내.txt';
  await writeFile(videoGuidePath,'공통 MP4: '+video.filename+'\n브랜드 소개 이미지 다음에 SmartEditor ONE 동영상 첨부로 넣습니다.\n긴 PNG에는 동영상이 들어가지 않습니다. HTML은 로컬 미리보기용이며 판매자센터 동영상 업로드를 대신하지 않습니다.\n로컬 미리보기: 무음 자동재생·반복. 네이버 판매페이지 자동재생: 미검증.\n');
  const result={width:860,height,brandIntroHeight,template:document.template,photoCount:p.smartstoreDetail.photoCount,points:document.points,htmlPath:stem+'.html',includeVideo:true,videoOptions,videoPath:video.path,videoSha256:video.sha256,videoGuidePath,previewVideoPlayback:video.previewPlayback,storeVideoPlayback:video.storePlayback,renderCacheHit};
  await writeFile(stem+'_제작정보.json',JSON.stringify({style:p.style,sourceUrl:p.sourceUrl,...result},null,2));return result;
 }finally{signal?.removeEventListener('abort',close);await close();await unlink(partial).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
