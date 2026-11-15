import {readFile,writeFile,mkdir,rename,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';

const VERSION=1,FAILURE_TTL_MS=30000,MAX_BYTES=30*1024*1024;
const hosts=new Set(['www.giordano.co.kr','giordano.co.kr']);
const formats={jpeg:{extension:'jpg',mime:'image/jpeg'},png:{extension:'png',mime:'image/png'},webp:{extension:'webp',mime:'image/webp'}};
const pending=new Map();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const compact=value=>String(value||'').replace(/\s/g,'');
const message=error=>String(error?.message||error||'공식 사진을 확인하지 못했습니다.').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,240);
const abort=signal=>{if(signal?.aborted)throw signal.reason||new DOMException('공식 사진 보완을 중단했습니다.','AbortError');};
const collectDefault=(...args)=>import('./smartstore-official-color-source.mjs').then(module=>module.collectOfficialColorSources(...args));

function officialUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&hosts.has(url.hostname)&&!url.port&&!url.username&&!url.password?url:null;}catch{return null;}}
function productIdentity(product){
 const url=officialUrl(product.sourceUrl);
 return /^\d{6}$/.test(product.style||'')&&url?.pathname==='/shop/detail.php'&&/^[a-f\d]{32}$/i.test(url.searchParams.get('pno')||'')&&Array.isArray(product.colors)&&product.colors.every(color=>typeof color==='string'&&/^\d{2}\S+/.test(color))?{style:product.style,sourceUrl:product.sourceUrl,colors:[...product.colors],productHash:url.searchParams.get('pno')}:null;
}
function validImageUrl(value){const url=officialUrl(value);return !!url&&url.pathname.startsWith('/_data/attach/')&&/\.(?:jpe?g|png|webp)$/i.test(url.pathname);}
function associatedEntry(source,entry,identity,color){
 if(source?.style!==identity.style||source?.sourceUrl!==identity.sourceUrl||String(source.sourceProductHash).toLowerCase()!==identity.productHash.toLowerCase()||!(/^[a-f\d]{32}$/i.test(source.productHash||'')))return false;
 if(entry?.color!==color||compact(entry.label)!==compact(color)||!/^\d+$/.test(String(entry.optionNo))||!/^\d+$/.test(String(entry.optionId))||!validImageUrl(entry.mainImageUrl)||!entry.images?.some(image=>image.url===entry.mainImageUrl))return false;
 const request=officialUrl(entry.requestUrl);
 return request?.pathname==='/main/exec.php'&&request.searchParams.get('exec_file')==='shop/getAjaxData.php'&&request.searchParams.get('exec')==='getAddImgList'&&request.searchParams.get('hash')?.toLowerCase()===source.productHash.toLowerCase()&&request.searchParams.get('ino')===String(entry.optionId)&&request.searchParams.get('opt_no')===String(entry.optionNo);
}
async function imageFormat(bytes){
 if(!bytes.length||bytes.length>MAX_BYTES)throw Error('공식 사진 파일 크기를 확인해 주세요.');
 const meta=await sharp(bytes,{limitInputPixels:80000000}).metadata(),format=formats[meta.format];
 if(!format||!meta.width||!meta.height)throw Error('공식 사진 JPEG·PNG·WebP 원본을 확인해 주세요.');
 return format;
}
async function atomic(file,bytes){const temporary=file+'.'+randomUUID()+'.tmp';await mkdir(path.dirname(file),{recursive:true});await writeFile(temporary,bytes);await rename(temporary,file);}
async function writeOriginal(file,bytes){try{if(digest(await readFile(file))===digest(bytes))return;}catch(error){if(error.code!=='ENOENT')throw error;}await atomic(file,bytes);}
async function readCached(root,entry){
 if(!entry||!(/^[a-f\d]{64}\.(?:jpg|png|webp)$/.test(entry.file||''))||!(/^[a-f\d]{64}$/.test(entry.hash||''))||!entry.file.startsWith(entry.hash+'.'))return null;
 try{const file=path.join(root,entry.file),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)return null;const bytes=await readFile(file);if(digest(bytes)!==entry.hash)return null;const format=await imageFormat(bytes);return entry.file.endsWith('.'+format.extension)?{bytes,format}:null;}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return null;return null;}
}
async function serialized(key,operation){
 const previous=pending.get(key)||Promise.resolve(),run=previous.catch(()=>{}).then(operation);pending.set(key,run);
 try{return await run;}finally{if(pending.get(key)===run)pending.delete(key);}
}
async function downloadOriginal(url,{fetchImpl,signal,sourceUrl}){
 abort(signal);const timeout=AbortSignal.timeout(15000),response=await fetchImpl(url,{signal:signal?AbortSignal.any([signal,timeout]):timeout,redirect:'error',headers:{Referer:sourceUrl}});
 if(!response.ok)throw Error('공식 사진 다운로드 실패 ('+response.status+')');
 if(response.url&&response.url!==url)throw Error('공식 사진 응답 주소가 선택한 원본과 다릅니다.');
 if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('공식 사진 파일 크기를 확인해 주세요.');
 const bytes=Buffer.from(await response.arrayBuffer());return {bytes,format:await imageFormat(bytes)};
}

export async function prepareOfficialPalette(product,prepared,options={}){
 const result=await preparePaletteOnly(product,prepared,options);
 if(options.includeGallery)result.gallery=await prepareOfficialGallery(product,prepared,options);
 return result;
}

// Official color-selection evidence supplies one original image per missing
// palette tile. It never changes seller options, store photos or listing images.
async function preparePaletteOnly(product,prepared,{folder,dataRoot,signal,log=()=>{},fetchImpl=fetch,collectSources=collectDefault}={}){
 const missing=(product.colors||[]).filter(color=>!prepared.paletteImages?.[color]&&(prepared.acceptAllFolderPhotos||!prepared.colorImages?.[color]?.length)),result={filled:[],reused:[],pending:[]};
 if(!missing.length)return result;
 prepared.palettePendingReasons||={};
 const defer=(color,reason)=>{const text=message(reason);prepared.palettePendingReasons[color]=text;const existing=result.pending.find(item=>item.color===color);if(existing)existing.message=text;else result.pending.push({color,message:text});};
 const identity=productIdentity(product);
 if(!identity){for(const color of missing)defer(color,'현재 품번의 공식 상품 주소와 색상 정보를 확인해 주세요.');return result;}
 abort(signal);
 let detailBytes;try{detailBytes=await readFile(path.join(folder,'detail.jpg'));}catch(error){if(error.code!=='ENOENT')throw error;for(const color of missing)defer(color,'현재 상품의 공식 상세 원본이 필요합니다.');return result;}
 const snapshot={version:VERSION,...identity,sourceDetailHash:digest(detailBytes)},identityKey=digest(JSON.stringify(snapshot));
 const cacheRoot=path.join(dataRoot,'smartstore-details',identity.style,'official-palette-auto',identityKey),manifestFile=path.join(cacheRoot,'manifest.json');
 const current=async()=>{
  abort(signal);const latest=productIdentity(product);
  if(JSON.stringify(latest)!==JSON.stringify(identity)||digest(await readFile(path.join(folder,'detail.jpg')))!==snapshot.sourceDetailHash)throw Object.assign(Error('공식 사진 보완 중 상품 또는 상세 원본이 변경됐습니다. 다시 확인해 주세요.'),{code:'OFFICIAL_PALETTE_SOURCE_CHANGED'});
 };
 return serialized(cacheRoot,async()=>{
  await current();let cache={identity:snapshot,entries:{},failures:{}};
  try{const saved=JSON.parse(await readFile(manifestFile,'utf8'));if(JSON.stringify(saved.identity)===JSON.stringify(snapshot)&&saved.entries&&saved.failures)cache=saved;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  const owners=new Map(),cachedImages=new Map(),attached=new Map(),blocked=new Set();
  const own=(hash,color)=>{if(!owners.has(hash))owners.set(hash,new Set());owners.get(hash).add(color);};
  for(const color of identity.colors){
   const entry=cache.entries[color],cached=entry&&associatedEntry(entry.source,entry.evidence,identity,color)?await readCached(cacheRoot,entry):null;
   if(cached){cachedImages.set(color,cached);own(entry.hash,color);}
   const src=prepared.paletteImages?.[color],file=prepared.photoFiles?.[src];
   if(src&&prepared.paletteSources?.[color]==='official'&&typeof file==='string'&&path.basename(file)===file){try{own(digest(await readFile(path.join(folder,file))),color);}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  const rejectShared=(color,hash)=>{
   const others=[...(owners.get(hash)||[])].filter(other=>other!==color);if(!others.length)return false;
   const reason='서로 다른 색상에 같은 공식 사진 원본이 연결되어 확인이 필요합니다.';
   for(const affected of [color,...others.filter(other=>missing.includes(other))]){
    blocked.add(affected);delete cache.entries[affected];cache.failures[affected]={at:Date.now(),message:reason};
    const previous=attached.get(affected);
    if(previous){
     delete prepared.paletteImages[affected];delete prepared.paletteSources[affected];
     if(previous.file===undefined)delete prepared.photoFiles[previous.src];else prepared.photoFiles[previous.src]=previous.file;
     if(previous.mime===undefined)delete prepared.photoMimeTypes[previous.src];else prepared.photoMimeTypes[previous.src]=previous.mime;
     attached.delete(affected);result.filled=result.filled.filter(value=>value!==affected);result.reused=result.reused.filter(value=>value!==affected);
    }
    defer(affected,reason);
   }
   return true;
  };
  const attach=async(color,bytes,format,reused)=>{
   await current();if(prepared.paletteImages?.[color])return;
   const hash=digest(bytes),src='/smartstore-photo/'+hash.slice(0,24),file='smartstore-photo-'+hash.slice(0,24)+'.'+format.extension;
   if(rejectShared(color,hash))return;
   await writeOriginal(path.join(folder,file),bytes);await current();
   prepared.paletteImages||={};prepared.paletteSources||={};prepared.photoFiles||={};prepared.photoMimeTypes||={};
   attached.set(color,{src,file:prepared.photoFiles[src],mime:prepared.photoMimeTypes[src]});own(hash,color);
   prepared.paletteImages[color]=src;prepared.paletteSources[color]='official';prepared.photoFiles[src]=file;prepared.photoMimeTypes[src]=format.mime;delete prepared.palettePendingReasons[color];
   result[reused?'reused':'filled'].push(color);
   return true;
  };
  const needed=[];
  for(const color of missing){
   if(prepared.paletteImages?.[color]||blocked.has(color))continue;
   const cached=cachedImages.get(color);
   if(cached){await attach(color,cached.bytes,cached.format,true);continue;}
   delete cache.entries[color];const failure=cache.failures[color];
   if(failure&&Number.isFinite(failure.at)&&Date.now()-failure.at>=0&&Date.now()-failure.at<FAILURE_TTL_MS){defer(color,failure.message);continue;}
   delete cache.failures[color];needed.push(color);
  }
  if(needed.length){
   let html;try{html=await readFile(path.join(folder,'smartstore-official.html'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
   let source;
   try{source=await collectSources(product,{html,colors:needed,fetchImpl,signal,timeoutMs:15000});await current();}
   catch(error){await current();for(const color of needed){defer(color,error);cache.failures[color]={at:Date.now(),message:message(error)};}}
   if(source)for(const color of needed){
    if(blocked.has(color))continue;
    try{
     const entries=source.colors?.filter(entry=>entry.color===color)||[],entry=entries.length===1?entries[0]:null;
     if(!entry)throw Error(source.failures?.find(failure=>failure.color===color)?.message||'공식 색상 사진을 확인하지 못했습니다.');
     if(!associatedEntry(source,entry,identity,color))throw Error('공식 사진의 품번·색상 선택 근거가 현재 상품과 일치하지 않습니다.');
     if(source.colors.some(other=>other.color!==color&&other.mainImageUrl===entry.mainImageUrl))throw Error('서로 다른 색상에 같은 공식 사진이 연결되어 확인이 필요합니다.');
     const {bytes,format}=await downloadOriginal(entry.mainImageUrl,{fetchImpl,signal,sourceUrl:identity.sourceUrl});await current();
     const hash=digest(bytes),file=hash+'.'+format.extension;await writeOriginal(path.join(cacheRoot,file),bytes);
     cache.entries[color]={file,hash,source:{style:source.style,sourceUrl:source.sourceUrl,sourceProductHash:source.sourceProductHash,productHash:source.productHash},evidence:entry};delete cache.failures[color];
     if(await attach(color,bytes,format,false))log('공식 팔레트 원본 보완: '+color+' 1장');
    }catch(error){await current();defer(color,error);cache.failures[color]={at:Date.now(),message:message(error)};}
   }
  }
  await current();await atomic(manifestFile,JSON.stringify(cache,null,2));return result;
 });
}

// Reuse the palette source evidence and main original for the lower gallery.
// Empty colors receive up to two distinct originals; a missing second image is
// informational, and existing store/official groups are never replaced.
export async function prepareOfficialGallery(product,prepared,{folder,dataRoot,signal,log=()=>{},fetchImpl=fetch,collectSources=collectDefault}={}){
 const missing=(product.colors||[]).filter(color=>!prepared.colorImages?.[color]?.length),result={filled:[],reused:[],pending:[]};
 if(!missing.length)return result;
 prepared.galleryPendingReasons||={};
 const defer=(color,reason)=>{const text=message(reason);prepared.galleryPendingReasons[color]=text;result.pending.push({color,message:text});};
 const identity=productIdentity(product);if(!identity){for(const color of missing)defer(color,'현재 품번의 공식 상품 주소와 색상 정보를 확인해 주세요.');return result;}
 abort(signal);let detail;
 try{detail=await readFile(path.join(folder,'detail.jpg'));}catch(error){if(error.code!=='ENOENT')throw error;for(const color of missing)defer(color,'현재 상품의 공식 상세 원본이 필요합니다.');return result;}
 const snapshot={version:VERSION,...identity,sourceDetailHash:digest(detail)},cacheRoot=path.join(dataRoot,'smartstore-details',identity.style,'official-palette-auto',digest(JSON.stringify(snapshot))),manifestFile=path.join(cacheRoot,'manifest.json');
 const current=async()=>{abort(signal);if(JSON.stringify(productIdentity(product))!==JSON.stringify(identity)||digest(await readFile(path.join(folder,'detail.jpg')))!==snapshot.sourceDetailHash)throw Object.assign(Error('공식 사진 보완 중 상품 또는 상세 원본이 변경됐습니다. 다시 확인해 주세요.'),{code:'OFFICIAL_PALETTE_SOURCE_CHANGED'});};
 const temporary={...prepared,acceptAllFolderPhotos:true,paletteImages:{...prepared.paletteImages},paletteSources:{...prepared.paletteSources},photoFiles:{...prepared.photoFiles},photoMimeTypes:{...prepared.photoMimeTypes},palettePendingReasons:{}};
 for(const color of missing)delete temporary.paletteImages[color];
 // Mark non-target colors satisfied only inside this temporary palette view.
 for(const color of identity.colors)if(!missing.includes(color)&&!temporary.paletteImages[color])temporary.paletteImages[color]='/smartstore-photo/existing-gallery';
 const mains=await preparePaletteOnly(product,temporary,{folder,dataRoot,signal,fetchImpl,collectSources});await current();
 return serialized(cacheRoot,async()=>{
  await current();let cache;
  try{cache=JSON.parse(await readFile(manifestFile,'utf8'));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  if(!cache||JSON.stringify(cache.identity)!==JSON.stringify(snapshot)){for(const color of missing)defer(color,temporary.palettePendingReasons[color]||'공식 색상 사진이 없어 건너뛰었습니다.');return result;}
  cache.galleryFailures||={};
  const owners=new Map(),urlOwners=new Map(),originals=new Map();
  const own=(map,key,color)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(color);};
  for(const color of identity.colors){
   const entry=cache.entries[color];if(!entry||!associatedEntry(entry.source,entry.evidence,identity,color))continue;
   const main=await readCached(cacheRoot,entry);if(!main)continue;originals.set(color,main);own(owners,entry.hash,color);
   for(const image of entry.evidence.images)if(validImageUrl(image.url))own(urlOwners,image.url,color);
   for(const image of entry.gallery||[]){if(!entry.evidence.images.some(item=>item.url===image.url))continue;const cached=await readCached(cacheRoot,image);if(cached)own(owners,image.hash,color);}
  }
  for(const color of identity.colors){
   const urls=[...(prepared.colorSources?.[color]==='official'?prepared.colorImages?.[color]||[]:[]),...(prepared.paletteSources?.[color]==='official'?[prepared.paletteImages?.[color]]:[])];
   for(const src of urls){const file=prepared.photoFiles?.[src];if(typeof file!=='string'||path.basename(file)!==file)continue;try{own(owners,digest(await readFile(path.join(folder,file))),color);}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  for(const color of missing){
   await current();if(prepared.colorImages?.[color]?.length)continue;
   const entry=cache.entries[color],main=originals.get(color);
   if(!entry||!main){defer(color,temporary.palettePendingReasons[color]||'공식 색상 사진이 없어 건너뛰었습니다.');continue;}
   if([...(owners.get(entry.hash)||[])].some(other=>other!==color)){defer(color,'다른 색상과 같은 공식 사진 원본이어서 건너뛰었습니다.');continue;}
   const chosen=[{...main,file:entry.file,hash:entry.hash,url:entry.evidence.mainImageUrl}],candidates=[...new Set(entry.evidence.images.map(image=>image.url))].filter(url=>url!==entry.evidence.mainImageUrl&&validImageUrl(url));
   let downloaded=mains.filled.includes(color),reason='',failed=false;
   const recent=cache.galleryFailures[color],waiting=recent&&Date.now()-recent.at>=0&&Date.now()-recent.at<FAILURE_TTL_MS;
   for(const url of candidates){
    if(chosen.length>=2)break;
    if([...(urlOwners.get(url)||[])].some(other=>other!==color)){reason='다른 색상과 공유된 추가 사진은 제외했습니다.';continue;}
    try{
     const record=entry.gallery?.find(image=>image.url===url),stored=record?await readCached(cacheRoot,record):null;
     if(!stored&&waiting){reason=recent.message;continue;}
     const image=stored||await downloadOriginal(url,{fetchImpl,signal,sourceUrl:identity.sourceUrl});await current();
     const hash=digest(image.bytes);if(chosen.some(item=>item.hash===hash)){reason='중복 원본을 제외하여 공식 사진 한 장만 사용했습니다.';continue;}
     if([...(owners.get(hash)||[])].some(other=>other!==color)){reason='다른 색상과 같은 추가 원본은 제외했습니다.';continue;}
     const file=hash+'.'+image.format.extension;if(!stored){await writeOriginal(path.join(cacheRoot,file),image.bytes);downloaded=true;}
     chosen.push({...image,file,hash,url});own(owners,hash,color);
    }catch(error){await current();failed=true;reason=message(error);}
   }
   if(chosen.length<2)reason||='공식 원본이 한 장만 확인되어 한 장으로 진행합니다.';
   entry.gallery=chosen.map(({file,hash,url})=>({file,hash,url}));
   if(chosen.length<2&&(failed||waiting))cache.galleryFailures[color]={at:waiting?recent.at:Date.now(),message:reason};else delete cache.galleryFailures[color];
   const files=[];
   for(const image of chosen){const src='/smartstore-photo/'+image.hash.slice(0,24),file='smartstore-photo-'+image.hash.slice(0,24)+'.'+image.format.extension;await writeOriginal(path.join(folder,file),image.bytes);files.push({src,file,mime:image.format.mime});}
   await current();if(prepared.colorImages?.[color]?.length)continue;
   prepared.colorImages||={};prepared.colorSources||={};prepared.photoFiles||={};prepared.photoMimeTypes||={};
   for(const image of files){prepared.photoFiles[image.src]=image.file;prepared.photoMimeTypes[image.src]=image.mime;}
   prepared.colorImages[color]=files.map(image=>image.src);prepared.colorSources[color]='official';delete prepared.galleryPendingReasons[color];
   result[downloaded?'filled':'reused'].push(color);if(reason&&chosen.length<2)defer(color,reason);log('공식 색상 사진 보완: '+color+' '+chosen.length+'장');
  }
  await current();await atomic(manifestFile,JSON.stringify(cache,null,2));return result;
 });
}
