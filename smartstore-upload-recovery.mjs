import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {findPhotos} from './smartstore-photo-files.mjs';
import {readPhotoBytes} from './smartstore-photo-byte-cache.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const changed=()=>Object.assign(Error('작업하던 판매자센터 화면이 바뀌었습니다. 남아 있는 입력을 먼저 확인해 주세요.'),{code:'SMARTSTORE_RESUME_CHANGED'});
const retryable=error=>error?.name==='TimeoutError'||error?.code==='SMARTSTORE_UI_DELAY';
const retryLabels={basic:'상품명·가격',options:'옵션·재고',mainImage:'대표사진',extraImages:'추가사진',productInfo:'상품정보·고시',careLabels:'택·케어라벨',editor:'상세 편집기',detailVideo:'상세 영상',detailFinish:'상세 배치'};

// One retry per affected step, at most three during this user-initiated run.
// A validation, login or identity error must never restart the form.
export function createSmartstoreRecovery({check,verify,log=()=>{},limit=3}){
 let remaining=limit;
 return async (name,run)=>{
  try{return await run();}
  catch(error){
   check();
   const label=retryLabels[name]||(/^detailImage\d+$/.test(name)?'상세이미지 '+name.slice(11)+'장째':null);
   if(!label||!remaining||!retryable(error))throw error;
   remaining--;
   log(label+' 응답 지연 · 현재 반영을 확인한 뒤 이 구간만 자동 재시도');
   await verify();
   check();
   const result=await run();
   check();
   log(label+' 자동 복구 완료');
   return result;
  }
 };
}

// Bind to this tab and this mounted form/document, not just the URL of a copy.
export async function bindSmartstoreDraft(page,selector){
 const node=await page.locator(selector).elementHandle({timeout:5000}),url=page.url();
 let navigated=false;
 const onNavigation=frame=>{if(frame===page.mainFrame())navigated=true;};
 page.on('framenavigated',onNavigation);
 const check=()=>{if(navigated||page.isClosed()||page.url()!==url)throw changed();};
 return {page,url,check,async verify(){check();if(!await node.evaluate((element,query)=>element.isConnected&&document.querySelector(query)===element,selector).catch(()=>false))throw changed();check();},
  dispose(){page.off('framenavigated',onNavigation);void node.dispose().catch(()=>{});}};
}

// The checkpoint is valid for the exact local originals and reviewed choices.
// Source-photo IDs already cover canonical path and byte hash, including duplicates.
export async function smartstoreSourceStamp(product,folder,{dataRoot}){
 const draft=path.join(dataRoot,'smartstore-details',product.style);
 const sources=[path.join(folder,'smartstore-official.html'),path.join(folder,'detail.jpg'),path.join(folder,'main.jpg'),
  path.join(dataRoot,'product-edits',product.style+'.json'),path.join(dataRoot,'smartstore-photo-mappings',product.style+'.json'),
  ...['draft.json','photo-file-selection.json','main-selection.json','selling-point-selection.json','garment-review.json'].map(name=>path.join(draft,name))];
 const [photos,hashes]=await Promise.all([findPhotos(product,{dataRoot,includeExcluded:true}),Promise.all(sources.map(async file=>{
  try{return sha(await readPhotoBytes(file));}catch(error){if(error.code!=='ENOENT')throw error;return null;}
 }))]);
 return sha(JSON.stringify([product.style,product.sourceUrl,folder,hashes,photos.map(p=>p.id)]));
}

export async function smartstoreAssetStamp(files){
 const hash=createHash('sha256');
 for(const file of files){
  const digest=createHash('sha256');
  for await(const bytes of createReadStream(file))digest.update(bytes);
  hash.update(JSON.stringify([path.basename(file),digest.digest('hex')]));
 }
 return hash.digest('hex');
}
