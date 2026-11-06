import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {findPhotos} from './smartstore-photo-files.mjs';
import {readPhotoBytes} from './smartstore-photo-byte-cache.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const changed=()=>Object.assign(Error('작업하던 판매자센터 화면이 바뀌었습니다. 남아 있는 입력을 먼저 확인해 주세요.'),{code:'SMARTSTORE_RESUME_CHANGED'});

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
