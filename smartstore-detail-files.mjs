import {originalListingMain} from './smartstore-listing-images.mjs';
import {findPhotos,resolveStylePhotoFolders} from './smartstore-photo-files.mjs';
import {mannequinPhotoRegions,registerLongPhotoLayout} from './smartstore-long-photo-import.mjs';
import {collectCaptionTones} from './smartstore-caption-tone.mjs';
import {reviewSellingPoints,officialPointSource} from './smartstore-selling-point-review.mjs';
import {importedPhotoSelection} from './smartstore-imported-selection.mjs';
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
import {workingProductPhoto} from './smartstore-photo-work.mjs';
import {embeddedOfficialSections} from './smartstore-official-sections.mjs';
import * as cheerio from 'cheerio';
import {styleFromDetail} from './product.mjs';
const appRoot=path.dirname(fileURLToPath(import.meta.url));
const assetsRoot=path.join(appRoot,'public/smartstore-template');
const inside=(root,file)=>file.startsWith(root+path.sep);
const normalize=s=>String(s).replace(/\s+/g,'').toLowerCase();
const imageExtension=/\.(jpe?g|png|webp)$/i;
function validStyle(p){if(!/^\d{5,8}$/.test(p?.style||''))throw Error('현재 상품의 품번을 확인해 주세요.');return String(p.style);}

export async function prepareSmartstoreDetail(product,folder,{dataRoot=path.join(appRoot,'data'),mannequinRoots,photoRoots}={}){
 const style=validStyle(product);const draftRoot=path.join(dataRoot,'smartstore-details',style);
 const configuredPhotoRoots=async()=>photoRoots||(mannequinRoots?(await Promise.all(mannequinRoots.map(root=>/^\d{6}$/.test(style)?resolveStylePhotoFolders(root,style):[path.join(root,style)]))).flat():undefined);
 let draft=null;try{draft=JSON.parse(await readFile(path.join(draftRoot,'draft.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(draft&&(String(draft.style)!==style||draft.sourceUrl!==product.sourceUrl))throw Error('상세페이지 준비 자료의 품번·공식 출처가 현재 상품과 다릅니다.');
 const imported=draft?.acceptAllFolderPhotos?null:importedPhotoSelection(product,draft);
 const prepared={style,includeBrandVideo:true,colorImages:{},colorSources:{},storeColorPhotoHashes:{},sellingPoints:[],photoCount:0,photoFiles:{},providedImages:[],sourceUrl:product.sourceUrl,displayColors:[...product.colors]};
 if(draft){
  if(draft.headline)prepared.headline=String(draft.headline).slice(0,200);
  if(draft.sellingPoints){if(!Array.isArray(draft.sellingPoints)||draft.sellingPoints.some(p=>!p.title||!p.description||!p.evidence))throw Error('소구점의 공식 확인 근거를 함께 저장해 주세요.');prepared.sellingPoints=draft.sellingPoints.slice(0,4);}
 }
 // Preview, export and upload must re-check the current official wording, too.
 let sourceText=product.officialDetailText||product.officialDescription||'';
 try{const html=await readFile(path.join(folder,'smartstore-official.html'),'utf8');if(styleFromDetail(html)!==style)throw Error('소구점 원문의 공식 품번이 다릅니다.');sourceText=cheerio.load(html)('.prd_detail_content_gio').first().text().trim()||sourceText;}catch(error){if(error.code!=='ENOENT')throw error;}
 {
  let detailHash=null;try{detailHash=createHash('sha256').update(await readFile(path.join(folder,'detail.jpg'))).digest('hex');}catch(e){if(e.code!=='ENOENT')throw e;}
  const checkedSource=await officialPointSource(product,folder,sourceText,{dataRoot});sourceText=checkedSource.text;
  const review=await reviewSellingPoints(product,sourceText,{dataRoot,detailHash,existing:prepared.sellingPoints});
  prepared.sellingPoints=review.points;prepared.sellingPointReview={status:review.status,message:review.message||''};
  if(draft&&review.points.length){draft.sellingPoints=review.points;await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify(draft,null,2));}
  prepared.sellingPointSource={style,sourceUrl:product.sourceUrl,textHash:createHash('sha256').update(sourceText).digest('hex'),detailHash,imageChecked:checkedSource.imageChecked};
 }
 if(!sourceText.trim()&&!prepared.sellingPoints.length){prepared.sellingPoints=[];prepared.sellingPointReview={status:'needs-review',message:'현재 공식 상세 원문을 확인해야 합니다.'};}
 const attach=async(color,file,allowedRoot)=>{
  if(!product.colors.includes(color))throw Error('현재 상품에 없는 색상의 마네킨 컷입니다: '+color);
  const canonicalRoot=await realpath(allowedRoot),canonical=await realpath(file);
  if(!inside(canonicalRoot,canonical)||!imageExtension.test(canonical))throw Error('마네킨 컷 파일 위치를 확인해 주세요.');
  const bytes=await readFile(canonical),sourceDigest=createHash('sha256').update(bytes).digest('hex');
  const sourceHash=draft?.photoMapping?.files?.find(r=>r.color===color&&(r.hash===sourceDigest||r.preparedHash===sourceDigest))?.hash||sourceDigest;
  if(imported&&!imported.get(color)?.includes(sourceHash))return;
  const meta=await sharp(bytes,{limitInputPixels:80000000}).metadata();
  if(!['jpeg','png','webp'].includes(meta.format))throw Error('지원하지 않는 마네킨 이미지 형식');
  const hash=createHash('sha256').update(bytes).update(draft?.acceptAllFolderPhotos?canonical:'').digest('hex').slice(0,24);const name='smartstore-photo-'+hash+'.jpg';
  await writeFile(path.join(folder,name),await readFile(await workingProductPhoto({bytes},product,{dataRoot})));
  const src='/smartstore-photo/'+hash;prepared.photoFiles[src]=name;
  prepared.colorImages[color]||=[];
  if(!prepared.colorImages[color].includes(src)){prepared.colorImages[color].push(src);(prepared.storeColorPhotoHashes[color]||=[]).push(sourceHash);prepared.photoCount++;}
 };
 if(draft?.acceptAllFolderPhotos){
  const photos=await findPhotos(product,{photoRoots:await configuredPhotoRoots()});
  const substitutions=[];
  const rank=photo=>{const digest=createHash('sha256').update(photo.bytes).digest('hex'),record=draft.photoMapping?.files?.find(r=>r.name===photo.name&&r.hash===digest),order=draft.importedColorPhotos?.find(g=>g.color===record?.color)?.hashes||[],index=order.indexOf(digest);return index<0?100:index;};
  photos.sort((a,b)=>rank(a)-rank(b));
  for(const photo of photos){
   const digest=createHash('sha256').update(photo.bytes).digest('hex'),record=draft.photoMapping?.files?.find(r=>r.name===photo.name&&r.hash===digest);
   const replacement=(draft.editedPhotoReplacements||[]).find(r=>r.sourceHash===digest&&r.sourceName===photo.name);
   if(replacement){
    if(!record||record.color!==replacement.sourceColor||!product.colors.includes(replacement.color)||!path.isAbsolute(replacement.file))throw Error('편집 사진의 원본과 색상을 다시 확인해 주세요.');
    const bytes=await readFile(replacement.file),hash=createHash('sha256').update(bytes).digest('hex');
    if(hash!==replacement.sha256)throw Error('편집 사진의 파일이 변경되었습니다. 다시 확인해 주세요.');
    substitutions.push(replacement);continue;
   }
   if(record?.role==='care-label'||(draft.careLabels||[]).some(r=>r.sourceName===photo.name&&r.sourceHash===digest))continue;
   if(record?.color&&record.role!=='provided'&&product.colors.includes(record.color)){await attach(record.color,photo.file,path.dirname(photo.file));continue;}
   const id=createHash('sha256').update(photo.name+'|'+digest).digest('hex').slice(0,24),src='/smartstore-photo/'+id,name='smartstore-photo-'+id+'.jpg';
   await writeFile(path.join(folder,name),await readFile(await workingProductPhoto(photo,product,{dataRoot})));prepared.photoFiles[src]=name;prepared.providedImages.push(src);prepared.photoCount++;
  }
  for(const replacement of substitutions)await attach(replacement.color,replacement.file,path.dirname(replacement.file));
 }else if(draft?.photos){
  if(!Array.isArray(draft.photos))throw Error('마네킨 컷 연결 자료를 확인해 주세요.');
  for(const group of draft.photos){if(!Array.isArray(group.files))throw Error('색상별 사진 목록이 필요합니다.');for(const relative of group.files){
   if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('마네킨 컷은 준비 자료 폴더 안의 파일만 연결합니다.');
   await attach(group.color,path.resolve(draftRoot,relative),draftRoot);
  }}
  if(imported)for(const [color,hashes] of imported){
   const actual=prepared.storeColorPhotoHashes[color]||[],urls=prepared.colorImages[color]||[];
   const order=hashes.map(hash=>actual.indexOf(hash)).filter(i=>i>=0);
   prepared.colorImages[color]=order.map(i=>urls[i]);prepared.storeColorPhotoHashes[color]=order.map(i=>actual[i]);
  }
 }else{
  if(!mannequinRoots){const desktop=path.dirname(await imageDownloadFolder());mannequinRoots=[path.join(desktop,'상품등록기사진폴더')];}
  for(const productRoot of await configuredPhotoRoots()){
   let entries;
   try{entries=await readdir(productRoot,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
   // Unlabelled loose files are left for the assistant's visual mapping; never infer a product from a date filename.
   for(const color of product.colors||[]){
    const label=normalize(color).replace(/^\d+/,''),matches=[];
    for(const e of entries){
     if(e.isDirectory()&&[normalize(color),label].includes(normalize(e.name))){for(const file of (await readdir(path.join(productRoot,e.name))).sort())if(imageExtension.test(file))matches.push(path.join(productRoot,e.name,file));}
     else if(e.isFile()&&imageExtension.test(e.name)&&label&&normalize(e.name).includes(label))matches.push(path.join(productRoot,e.name));
    }
    for(const file of matches)await attach(color,file,productRoot);
   }
   if(prepared.photoCount)break;
  }
 }
 // The current style folder is authoritative; unknown colors are shown without color claims.
 if(draft?.trustedFolder&&!draft.acceptAllFolderPhotos&&draft.sourceUrl===product.sourceUrl){
  const current=new Set((await findPhotos(product,{photoRoots:await configuredPhotoRoots()})).map(p=>createHash('sha256').update(p.bytes).digest('hex')));
  const labels=new Set((draft.careLabels||[]).map(p=>p.sourceHash));
  const canonicalRoot=await realpath(draftRoot);
  for(const relative of draft.unmatchedPhotos||draft.providedPhotos||[]){
   if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('마네킨 사진 연결 경로를 확인해 주세요.');
   const file=await realpath(path.join(draftRoot,relative));if(!inside(canonicalRoot,file))throw Error('마네킨 사진이 자료 폴더 밖에 있습니다.');
   const bytes=await readFile(file),digest=createHash('sha256').update(bytes).digest('hex');
   if(!current.has(digest)||labels.has(digest))continue;
   const id=createHash('sha256').update(digest).update(draft.acceptAllFolderPhotos?relative:'').digest('hex').slice(0,24),src='/smartstore-photo/'+id,name='smartstore-photo-'+id+'.jpg';
   if(prepared.photoFiles[src])continue;
   await writeFile(path.join(folder,name),await readFile(await workingProductPhoto({bytes},product,{dataRoot})));
   prepared.photoFiles[src]=name;prepared.providedImages.push(src);prepared.photoCount++;
  }
 }
 prepared.acceptAllFolderPhotos=!!draft?.acceptAllFolderPhotos;
 prepared.pendingPhotoCount=draft?.acceptAllFolderPhotos?0:prepared.providedImages.length;
 prepared.unclassifiedPhotoCount=prepared.providedImages.length;
 // The product folder's selected 1번 mannequin photo is shared by both templates.
 prepared.heroImage=Object.entries(prepared.colorImages).find(([color,urls])=>prepared.colorSources[color]!=='official'&&urls.length)?.[1][0]||null;
 try{
  const main=await originalListingMain(product,{dataRoot,photoRoots:await configuredPhotoRoots()});
  const bytes=await readFile(main),id=createHash('sha256').update(bytes).digest('hex').slice(0,24);
  const name='smartstore-photo-'+id+'.jpg',src='/smartstore-photo/'+id;
  await writeFile(path.join(folder,name),bytes);prepared.photoFiles[src]=name;prepared.heroImage=src;
 }catch(error){
  if(!/1.jpg 또는 1번.jpg 한 장/.test(error.message))throw error;
 }
 prepared.heroSource='store-mannequin';
 prepared.storeColorPhotoCounts=Object.fromEntries(Object.entries(prepared.colorImages).map(([color,urls])=>[color,urls.length]));
 // Official fallback photos are separate from seller options and store mannequin claims.
 if(draft?.officialPhotos?.length){
  const detailHash=createHash('sha256').update(await readFile(path.join(folder,'detail.jpg'))).digest('hex');
  for(const group of draft.officialPhotos){
   if(prepared.colorImages[group.color]?.length)continue;
   if(!/^\d{2}\S+/.test(group.color)||group.sourceUrl!==product.sourceUrl||group.sourceImageUrl!==product.images.detail||group.sourceImageHash!==detailHash)throw Error('공식 보완 사진의 품번·색상·출처를 다시 확인해 주세요.');
   if(group.files?.length!==2||group.files[0].role!=='front')throw Error('공식 보완 사진은 정면을 첫 번째로 2장 준비해 주세요.');
   prepared.displayColors.push(group.color);prepared.displayColors=[...new Set(prepared.displayColors)].sort();
   for(const entry of group.files){
    if(typeof entry.file!=='string'||path.isAbsolute(entry.file)||entry.file.split(/[\\/]/).includes('..'))throw Error('공식 사진 파일 경로를 확인해 주세요.');
    const file=await realpath(path.join(draftRoot,entry.file)),canonicalRoot=await realpath(draftRoot);
    if(!inside(canonicalRoot,file))throw Error('공식 사진이 자료 폴더 밖에 있습니다.');
    const bytes=await readFile(file),hash=createHash('sha256').update(bytes).digest('hex');if(hash!==entry.sha256)throw Error('확인된 공식 사진 원본과 다릅니다.');
    const id=hash.slice(0,24),name='smartstore-photo-'+id+'.jpg',src='/smartstore-photo/'+id;
    await writeFile(path.join(folder,name),bytes);prepared.photoFiles[src]=name;prepared.colorImages[group.color]||=[];prepared.colorImages[group.color].push(src);
   }
   prepared.colorSources[group.color]='official';
  }
 }
 prepared.captionTones=await collectCaptionTones(product,folder);
 prepared.embeddedOfficialSections=await embeddedOfficialSections(product,folder);
 const p={...product,smartstoreDetail:prepared};
 return p;
}

export function localSmartstorePreview(p){
 const map=new Map(Object.entries(p.images).map(([key,src])=>[src,'/image/'+key]));
 if(p.images.main)map.set(p.images.main,'/image/main-original');
 return smartstoreDetailDocument(p,{assetBase:'/smartstore-template/',fontUrl:'/smartstore-template/GowunDodum-Regular.ttf',imageUrl:src=>map.get(src)||src});
}

export async function saveSmartstoreDetail(product,folder,output,{signal,...options}={}){
 const videoOptions={...productVideoOptions(product),...options.videoOptions};
 await requireBrandVideo(options.dataRoot,videoOptions);
 const p=await prepareSmartstoreDetail(product,folder,options);const data=new Map();
 if(!p.smartstoreDetail.sellingPoints.length)throw Error('공식 상세 원문에 근거한 소구점 확인이 필요합니다. 임의 문구로 상세이미지를 제작하지 않았습니다.');
 const check=()=>{if(signal?.aborted)throw Error('상세페이지 만들기를 중단했습니다.');};check();
 for(const name of TEMPLATE_ASSET_NAMES.filter(n=>!n.endsWith('.ttf')))data.set(TEMPLATE_ASSET_BASE+name,'data:image/'+(name.endsWith('.png')?'png':'jpeg')+';base64,'+(await readFile(path.join(assetsRoot,name))).toString('base64'));
 for(const [key,src] of Object.entries(p.images)){
  if(!/^(detail|size|check|info|main|extra[12]|color[1-9]\d*_[123])$/.test(key))continue;
  try{const bytes=await readFile(path.join(folder,key+'.jpg'));data.set(src,'data:image/jpeg;base64,'+(await sharp(bytes).rotate().resize({width:860,withoutEnlargement:true}).jpeg({quality:96}).toBuffer()).toString('base64'));}catch(e){if(e.code==='ENOENT')throw Error('현재 상품의 '+key+' 원본 파일을 확인해 주세요.');throw e;}
 }
 for(const [src,file] of Object.entries(p.smartstoreDetail.photoFiles))data.set(src,'data:image/jpeg;base64,'+(await readFile(path.join(folder,file))).toString('base64'));
 const imageUrl=src=>{if(!data.has(src))throw Error('현재 상품에 연결되지 않은 상세 이미지: '+src);return data.get(src);};
 const fontUrl='data:font/ttf;base64,'+(await readFile(path.join(assetsRoot,'GowunDodum-Regular.ttf'))).toString('base64');
 const document=smartstoreDetailDocument(p,{imageUrl,fontUrl,includeVideo:false,includeNavigation:false});
 const cacheRoot=path.join(options.dataRoot||path.join(appRoot,'data'),'smartstore-render-cache','template-'+document.templateVariant);
 const cacheKey=await renderCacheKey(document.html);let height,brandIntroHeight,videoAfterTop,footerTop,bannerTop,officialTop,photoRegions,renderCacheHit=false;
 let browser;const close=()=>browser?.close().catch(()=>{});signal?.addEventListener('abort',close,{once:true});
 const partial=output+'.partial';
 try{
  const cached=await restoreRenderedDetail(cacheRoot,p.style,cacheKey,output);check();
  if(cached&&Array.isArray(cached.photoRegions)&&Number.isFinite(cached.brandIntroHeight)&&Number.isInteger(cached.videoAfterTop)&&Number.isInteger(cached.footerTop)&&Number.isInteger(cached.bannerTop)&&Number.isInteger(cached.officialTop)){height=cached.height;photoRegions=cached.photoRegions;brandIntroHeight=cached.brandIntroHeight;videoAfterTop=cached.videoAfterTop;footerTop=cached.footerTop;bannerTop=cached.bannerTop;officialTop=cached.officialTop;renderCacheHit=true;options.log?.('사진·문구·템플릿 일치 · 상세이미지 재사용');}
  else{
  browser=await chromium.launch({headless:true});check();
  const page=await browser.newPage({viewport:{width:860,height:1200},deviceScaleFactor:1});
  await page.setContent(document.html);await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));check();
  height=await page.evaluate(()=>document.documentElement.scrollHeight);photoRegions=await page.evaluate(mannequinPhotoRegions);
  brandIntroHeight=await page.locator('[data-brand-intro]').evaluate(n=>Math.ceil(n.getBoundingClientRect().height));
  videoAfterTop=await page.locator('[data-brand-video-heading]').evaluate(n=>Math.floor(n.getBoundingClientRect().bottom+scrollY));
  officialTop=await page.locator('[data-official-detail]').evaluate(n=>Math.floor(n.getBoundingClientRect().top+scrollY));
  bannerTop=await page.locator('[data-store-banner]').evaluate(n=>Math.floor(n.getBoundingClientRect().top+scrollY));
  footerTop=await page.locator('[data-store-footer]').evaluate(n=>Math.floor(n.getBoundingClientRect().top+scrollY));
  if(height>150000)throw Error('상세페이지가 너무 깁니다. 사진 개수와 원본 길이를 확인해 주세요.');
  const layers=[];for(let top=0;top<height;top+=4096){check();layers.push({input:await page.screenshot({type:'png',fullPage:true,clip:{x:0,y:top,width:860,height:Math.min(4096,height-top)}}),left:0,top});}
  await sharp({create:{width:860,height,channels:3,background:'#fff'},limitInputPixels:false}).composite(layers).png().toFile(partial);check();
  const {rename}=await import('node:fs/promises');await rename(partial,output);
  await cacheRenderedDetail(cacheRoot,p.style,cacheKey,output,height,{brandIntroHeight,videoAfterTop,footerTop,bannerTop,officialTop,photoRegions});
  }
  await registerLongPhotoLayout(await readFile(output),{style:p.style,regions:photoRegions,brandIntroHeight,videoAfterTop,officialTop,dataRoot:options.dataRoot||path.join(appRoot,'data')});
  const stem=output.replace(/\.[^.]+$/,'');
  const video=await exportBrandVideo(stem,options.dataRoot,videoOptions);check();
  await writeFile(stem+'.html',smartstoreDetailDocument(p,{imageUrl,fontUrl,videoUrl:encodeURIComponent(video.filename)}).html);
  const bannerPath=stem+'_스토어배너.png';
  await sharp(output,{limitInputPixels:false}).extract({left:0,top:bannerTop,width:860,height:footerTop-bannerTop}).png({compressionLevel:9}).toFile(bannerPath);
  await writeFile(stem+'_배너연결주소.txt','https://shopping.naver.com/window/department/store/101731950\n자동 업로드 마지막 단계에서 ONE 편집기의 사진 링크로 연결하고 재진입 검증합니다.\n');
  const footerPath=stem+'_구매혜택부터하단.png';
  await sharp(output,{limitInputPixels:false}).extract({left:0,top:footerTop,width:860,height:height-footerTop}).png({compressionLevel:9}).toFile(footerPath);
  const videoGuidePath=stem+'_영상안내.txt';
  await writeFile(videoGuidePath,'공통 MP4: '+video.filename+'\n선택한 템플릿의 브랜드 소개와 영상 제목 뒤에 SmartEditor ONE 동영상 첨부로 넣습니다.\n긴 PNG에는 동영상이 들어가지 않습니다. HTML은 로컬 미리보기용이며 판매자센터 동영상 업로드를 대신하지 않습니다.\n로컬 미리보기: 무음 자동재생·반복. 네이버 판매페이지 자동재생: 미검증.\n');
  const result={width:860,height,brandIntroHeight,videoAfterTop,footerTop,bannerTop,officialTop,bannerPath,footerPath,template:document.template,templateVariant:document.templateVariant,templateLabel:document.templateLabel,photoCount:p.smartstoreDetail.photoCount,points:document.points,htmlPath:stem+'.html',includeVideo:true,videoOptions,videoPath:video.path,videoSha256:video.sha256,videoGuidePath,previewVideoPlayback:video.previewPlayback,storeVideoPlayback:video.storePlayback,renderCacheHit};
  await writeFile(stem+'_제작정보.json',JSON.stringify({style:p.style,sourceUrl:p.sourceUrl,...result},null,2));return result;
 }finally{signal?.removeEventListener('abort',close);await close();await unlink(partial).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
