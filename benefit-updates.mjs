import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const BENEFIT_CHECK_INTERVAL=20*60*1000;
const verifiedHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const digest=value=>createHash('sha256').update(value).digest('hex');
export function websiteCheckDue(state,now=Date.now()){return !state?.checkedAt||now-Date.parse(state.checkedAt)>=BENEFIT_CHECK_INTERVAL;}
export function officialProductFingerprint(product,pageText){
 return digest(JSON.stringify({style:product.style,rawName:product.rawName,gender:product.gender,category:product.sourceCategory,pageText,images:product.images,colors:product.colors,sizes:product.sizes,consumerPrice:product.consumerPrice}));
}
export async function fetchOfficialDetailVersion(url,previous,request,{localImageAvailable=false}={}){
 const reusable=previous?.detailUrl===url&&/^[a-f0-9]{64}$/i.test(previous.detailHash||'');
 const headers={};if(reusable&&(previous.imageScanComplete||localImageAvailable)){if(previous.detailValidators?.etag)headers['If-None-Match']=previous.detailValidators.etag;if(previous.detailValidators?.lastModified)headers['If-Modified-Since']=previous.detailValidators.lastModified;}
 const response=await request(url,headers);
 if(response.status===304){if(!reusable||!Object.keys(headers).length)throw Error('공식 이미지 변경 확인 응답을 검증하지 못했습니다.');return {bytes:null,detailHash:previous.detailHash,detailValidators:previous.detailValidators};}
 if(response.status!==200)throw Error('공식 이미지 응답 '+response.status);
 const bytes=response.bytes;if(!Buffer.isBuffer(bytes)||bytes.length>24000000)throw Error('공식 이미지 원본 용량을 확인해 주세요.');
 return {bytes,detailHash:digest(bytes),detailValidators:{etag:response.headers?.etag||null,lastModified:response.headers?.['last-modified']||null}};
}
export function changedOfficialProducts(previous,records){
 const events=[];for(const r of records){const id=new URL(r.sourceUrl).searchParams.get('pno');const old=previous[id];if(!old){events.push({type:'new',style:r.style,name:r.rawName,sourceUrl:r.sourceUrl,pageHash:r.pageHash,detailHash:r.detailHash,changes:['새로 발견한 성인 상품']});continue;}
 if(!old.pageHash&&!old.detailHash)continue;const changes=[];if(verifiedHash(old.pageHash)&&verifiedHash(r.pageHash)&&old.pageHash!==r.pageHash)changes.push('상품 원문·정보 변경');if(verifiedHash(old.detailHash)&&verifiedHash(r.detailHash)&&old.detailHash!==r.detailHash)changes.push('공식 상세이미지 변경');if(changes.length)events.push({type:'changed',style:r.style,name:r.rawName,sourceUrl:r.sourceUrl,pageHash:r.pageHash,detailHash:r.detailHash,changes});}
 return events;
}
export async function saveWebsiteCheck(catalogDir,records,{now=new Date().toISOString(),errors=0}={}){
 const file=path.join(catalogDir,'website-check.json');let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const baseline=previous?.products||{};const events=previous?changedOfficialProducts(baseline,records):[];
 if(!previous){let queue=[];try{queue=JSON.parse(await readFile(path.join(catalogDir,'queue.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}for(const item of queue)if(/^[a-f0-9]{16,64}$/i.test(item.pno||''))baseline[item.pno]={pageHash:null,detailHash:null};}
 const products={...baseline};for(const r of records){const id=new URL(r.sourceUrl).searchParams.get('pno');products[id]={pageHash:verifiedHash(r.pageHash)?r.pageHash:baseline[id]?.pageHash||null,detailHash:verifiedHash(r.detailHash)?r.detailHash:baseline[id]?.detailHash||null};}
 const batch={id:digest(now).slice(0,20),checkedAt:now,events};
 const state={version:1,checkedAt:now,nextCheckAt:new Date(Date.parse(now)+BENEFIT_CHECK_INTERVAL).toISOString(),baselineAt:previous?.baselineAt||now,baselineReady:true,errors,products,batches:[...(previous?.batches||[]),batch].slice(-168)};
 await writeFile(file+'.tmp',JSON.stringify(state,null,2));await rename(file+'.tmp',file);return state;
}
