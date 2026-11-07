import {readFile,writeFile,lstat,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {resolveDetailTemplate} from './smartstore-template-choice.mjs';
import {normalizeSmartstoreProductLink} from './smartstore-product-link.mjs';

const appRoot=path.dirname(fileURLToPath(import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashPattern=/^[a-f0-9]{64}$/;
const stylePattern=/^\d{6}$/;
const inside=(root,file)=>{const relative=path.relative(root,file);return !!relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
const fail=(message,cause)=>Object.assign(new Error('핏 비교 가이드 재확인이 필요합니다: '+message,cause?{cause}:undefined),{code:'FIT_GUIDE_REVERIFY'});
function requireGuide(condition,message){if(!condition)throw fail(message);}
function text(value,max,label){
 requireGuide(typeof value==='string'&&value.trim()&&value.length<=max&&!/[<>&\u0000-\u001f\u007f]/.test(value),label+' 문구를 확인해 주세요.');
 return value.trim();
}
function officialUrl(value){
 requireGuide(typeof value==='string'&&value.length<=1000,'공식 주소를 확인해 주세요.');
 let url;try{url=new URL(value);}catch{throw fail('공식 주소를 확인해 주세요.');}
 requireGuide(url.protocol==='https:'&&['giordano.co.kr','www.giordano.co.kr'].includes(url.hostname)&&!url.username&&!url.password&&!url.port&&!/[<>"'\s]/.test(value),'지오다노 공식 주소를 확인해 주세요.');
 return value;
}
function relativeFile(value){
 requireGuide(typeof value==='string'&&value.length>0&&value.length<=240&&!path.win32.isAbsolute(value)&&!path.posix.isAbsolute(value)&&!/[\u0000-\u001f\u007f:]/.test(value)&&value.split(/[\\/]/).every(part=>part&&part!=='.'&&part!=='..'),'자료 폴더 안의 파일만 사용할 수 있습니다.');
 return value;
}
function descriptor(value){
 requireGuide(value&&typeof value==='object'&&!Array.isArray(value)&&hashPattern.test(value.sha256),'원본 파일의 해시를 확인해 주세요.');
 return {file:relativeFile(value.file),sha256:value.sha256};
}
async function boundedFile(root,relative,maxBytes){
 const canonical=await realpath(path.resolve(root,relative));
 requireGuide(inside(root,canonical),'파일이 자료 폴더 밖으로 연결되어 있습니다.');
 const entry=await stat(canonical);
 requireGuide(entry.isFile()&&entry.size>0&&entry.size<=maxBytes,'자료 파일 크기 또는 형식을 확인해 주세요.');
 const bytes=await readFile(canonical);
 requireGuide(bytes.length>0&&bytes.length<=maxBytes,'자료 파일 크기를 확인해 주세요.');
 return bytes;
}
function managerRows(manager){
 requireGuide(manager?.source==='user'&&Array.isArray(manager.rows)&&manager.rows.length===4,'매니저 추천 네 행의 사용자 확인 자료가 필요합니다.');
 const rows=manager.rows.map(row=>{
  const waist=text(row?.waist,12,'허리 사이즈'),size=text(row?.size,4,'추천 사이즈');
  requireGuide(/^\d{2}(?:[~–-]\d{2})?$/.test(waist)&&['S','M','L','XL'].includes(size),'추천 사이즈 범위를 확인해 주세요.');
  const range=waist.split(/[~–-]/).map(Number);
  requireGuide(range.every(n=>n>=20&&n<=60)&&(range.length===1||range[0]<=range[1]),'허리 사이즈 범위를 확인해 주세요.');
  return {waist,size};
 });
 requireGuide(new Set(rows.map(row=>row.size)).size===4&&new Set(rows.map(row=>row.waist)).size===4,'추천 사이즈 행이 중복되었습니다.');
 return {storeName:text(manager.storeName,100,'매장명'),rows,source:'user'};
}

export async function prepareFitGuide(product,folder,{dataRoot=path.join(appRoot,'data')}={}){
 const detailTemplate=resolveDetailTemplate(product?.detailTemplate);
 const style=String(product?.style||'');
 requireGuide(/^\d{5,8}$/.test(style),'현재 품번을 확인해 주세요.');
 const pack=path.join(dataRoot,'smartstore-details',style,'fit-guide');
 try{await lstat(pack);}catch(error){if(error.code==='ENOENT')return null;throw fail('자료 폴더를 읽지 못했습니다.',error);}
 try{
  const root=await realpath(pack),parent=await realpath(path.dirname(pack));
  requireGuide(inside(parent,root),'자료 폴더가 다른 위치로 연결되어 있습니다.');
  const manifest=JSON.parse((await boundedFile(root,'manifest.json',128*1024)).toString('utf8'));
  requireGuide(manifest?.version===1&&[1,2].includes(manifest.detailTemplate)&&manifest.style===style,'품번 또는 템플릿 자료를 확인해 주세요.');
  if(manifest.detailTemplate!==detailTemplate)return null;
  requireGuide(officialUrl(manifest.sourceUrl)===product.sourceUrl,'공식 주소가 현재 상품과 다릅니다.');
  requireGuide(hashPattern.test(manifest.anchor?.detailSha256)&&hashPattern.test(manifest.anchor?.sizeSha256),'현재 공식 원본의 확인 해시가 없습니다.');
  const outputRoot=await realpath(folder);
  for(const [name,key] of [['detail.jpg','detailSha256'],['size.jpg','sizeSha256']]){
   const bytes=await boundedFile(outputRoot,name,32*1024*1024);
   requireGuide(digest(bytes)===manifest.anchor[key],'현재 공식 상세 또는 사이즈표가 변경되었습니다.');
  }
  requireGuide(Array.isArray(manifest.products)&&manifest.products.length===3&&manifest.products.every(p=>p&&typeof p.style==='string'&&stylePattern.test(p.style))&&new Set(manifest.products.map(p=>p.style)).size===3&&manifest.products.filter(p=>p.style===style).length===1,'서로 다른 세 품번과 현재 품번을 확인해 주세요.');
  const manager=managerRows(manifest.manager),products=[],photos=new Map();
  for(const item of manifest.products){
   const prepared={style:item.style,fit:text(item.fit,50,'핏'),color:text(item.color,80,'색상'),description:text(item.description,400,'상품 설명')};
   // The current product is never linked back to itself, even if an older pack
   // includes a link. Only explicit user links for a matching alternative remain.
   if(item.purchaseLink!==undefined&&item.style!==style){
    requireGuide(item.purchaseLink&&typeof item.purchaseLink==='object'&&!Array.isArray(item.purchaseLink)&&item.purchaseLink.style===item.style&&item.purchaseLink.source==='user','구매 링크의 사용자 확인 품번을 확인해 주세요.');
    prepared.purchaseLink={url:normalizeSmartstoreProductLink(item.purchaseLink.url),style:item.style,source:'user'};
   }
   requireGuide(Array.isArray(item.measurements)&&item.measurements.length===7&&item.measurements.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=300),'공식 L 사이즈의 일곱 치수를 확인해 주세요.');
   prepared.measurements=[...item.measurements];
   prepared.official={url:officialUrl(item.official?.url)};
   if(item.style===style)requireGuide(prepared.official.url===product.sourceUrl,'현재 품번의 공식 주소가 다릅니다.');
   for(const role of ['detail','size','info']){
    const asset=descriptor(item.official?.[role]),bytes=await boundedFile(root,asset.file,32*1024*1024);
    requireGuide(digest(bytes)===asset.sha256,'공식 원본 파일이 변경되었습니다: '+item.style+' '+role);
    if(item.style===style&&role!=='info')requireGuide(asset.sha256===manifest.anchor[role+'Sha256'],'현재 품번과 비교 자료의 공식 원본이 다릅니다.');
    prepared.official[role]=asset;
   }
   for(const role of ['front','side']){
    const asset=descriptor(item[role]),bytes=await boundedFile(root,asset.file,5*1024*1024);
    requireGuide(digest(bytes)===asset.sha256,'착용사진이 변경되었습니다: '+item.style+' '+role);
    const image=sharp(bytes,{limitInputPixels:750000,failOn:'warning'}),metadata=await image.metadata();
    requireGuide(metadata.format==='jpeg'&&metadata.width===750&&metadata.height===1000&&(!metadata.orientation||metadata.orientation===1)&&(!metadata.pages||metadata.pages===1),'착용사진은 750×1000 세로형 JPG여야 합니다.');
    await image.raw().toBuffer();
    const id=asset.sha256.slice(0,24),src='/smartstore-photo/'+id,name='smartstore-photo-'+id+'.jpg';
    requireGuide(!photos.has(src)||photos.get(src).sha256===asset.sha256,'착용사진 파일 식별자가 충돌합니다.');
    photos.set(src,{name,bytes,sha256:asset.sha256});prepared[role]=src;
   }
   products.push(prepared);
  }
  // Validate the complete pack before adding any serving copies. Main/gallery
  // selections and their photoCount are deliberately outside this return value.
  const photoFiles={};
  for(const [src,photo] of photos){
   const target=path.join(outputRoot,photo.name);
   try{const entry=await lstat(target);requireGuide(entry.isFile()&&!entry.isSymbolicLink(),'착용사진 출력 위치를 확인해 주세요.');}
   catch(error){if(error.code!=='ENOENT')throw error;}
   await writeFile(target,photo.bytes);photoFiles[src]=photo.name;
  }
  return {style,detailTemplate,products,manager,photoFiles};
 }catch(error){if(error.code==='FIT_GUIDE_REVERIFY')throw error;throw fail('자료 또는 이미지 파일을 다시 확인해 주세요.',error);}
}
