import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {findPhotos} from './smartstore-photo-files.mjs';
import {workingProductPhoto,PHOTO_WORK_VERSION} from './smartstore-photo-work.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function withOfficialMain(product,manifest){
 if(!Array.isArray(manifest.extras))throw Error('추가이미지 선택 자료를 확인해 주세요.');
 const provided=manifest.extras.filter(p=>product.colors?.includes(p.color)&&((p.role==='side'||p.role==='alternate')&&p.color===manifest.main?.color||p.role==='front'&&p.color!==manifest.main?.color)&&(!p.sourceHash||p.sourceHash!==manifest.main?.sourceHash));
 if(!product.images?.main)return {...manifest,extras:provided.slice(0,9)};
 const source=new URL(product.images.main);if(source.origin!=='https://www.giordano.co.kr')throw Error('현재 상품의 공식몰 대표사진 주소를 확인해 주세요.');
 return {...manifest,extras:[{role:'official-main',color:'공식몰 대표사진',sourceName:'공식몰 대표사진',sourceUrl:source.href},...provided.slice(0,8)],detailRevision:hash(Buffer.from((manifest.detailRevision||'')+'|official-main-first-v1|'+source.href))};
}
export function chooseListingPhotos(photos,product){
 const main=photos.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name||''));
 if(main.length!==1)throw Error('품번 폴더에서 대표로 사용할 사진 한 장의 파일명을 1.jpg 또는 1번.jpg로 지정해 주세요.');
 const selected=main[0],same=p=>hash(p.bytes)===hash(selected.bytes);
 if(selected.role==='care-label'||!product.colors.includes(selected.color))throw Error('1번 대표사진의 상품·색상을 확인해 주세요. 케어라벨은 대표로 사용하지 않습니다.');
 const side=photos.find(p=>p.color===selected.color&&p.role==='side'&&!same(p));
 // Only a visually verified full front of the same color can substitute for an absent side.
 const alternative=side?null:photos.find(p=>p.color===selected.color&&p.role==='front'&&(p.reviewed===true||p.autoValidated===true)&&!same(p));
 const extras=side?[side]:alternative?[{...alternative,role:'alternate'}]:[];
 for(const color of product.colors.filter(color=>color!==selected.color&&photos.some(p=>p.color===color))){const front=photos.find(p=>p.color===color&&p.role==='front'&&!same(p));if(!front)throw Error(color+' 정면 사진이 필요합니다.');extras.push(front);}
 return {main:selected,extras:extras.slice(0,9)};
}
export async function saveListingSelection(root,selection){
 await mkdir(path.join(root,'listing'),{recursive:true});
 const save=async(p,name)=>{const file='listing/'+name+path.extname(p.name).toLowerCase();await writeFile(path.join(root,file),p.bytes);return {file,color:p.color,role:p.role,sourceName:p.name,sourceHash:hash(p.bytes)};};
 return {main:await save(selection.main,'main'),extras:await Promise.all(selection.extras.map((p,i)=>save(p,'extra-'+(i+1))))};
}
export async function listingManifest(product,{dataRoot}){
 let draft;try{draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(String(draft.style)!==String(product.style)||draft.sourceUrl!==product.sourceUrl)return null;
 if(!draft.listingImages)return null;
 const records=draft.photoMapping?.files||[],unclassified=records.filter(r=>r.role!=='care-label'&&(!product.colors?.includes(r.color)||r.role==='provided')).length;
 const mainColor=draft.listingImages.main?.color;
 const missingFrontColors=(product.colors||[]).filter(color=>color!==mainColor&&records.some(r=>r.color===color)&&!records.some(r=>r.color===color&&r.role==='front'));
 const automatic=records.filter(r=>r.automatic===true&&r.reviewed!==true&&r.autoValidated!==true).length;
 const needsReview=unclassified>0||missingFrontColors.length>0||automatic>0;
 const photoReview={status:needsReview?'needs-review':'ready',unclassified,missingFrontColors,automatic,message:needsReview?'폴더 사진은 모두 상세에 보존했습니다. 색상·정면·옆면 연결 확인 필요'+(unclassified?' · 미분류 '+unclassified+'장':'')+(missingFrontColors.length?' · 정면 미확인 '+missingFrontColors.join(', '):'')+(automatic?' · 자동 판별 확인 필요 '+automatic+'장':''):''};
 return withOfficialMain(product,{...draft.listingImages,photoReview,detailRevision:hash(Buffer.from(JSON.stringify(draft)+'|'+PHOTO_WORK_VERSION))});
}
export async function listingPreview(product,options){
 const manifest=await listingManifest(product,options);if(manifest)return manifest;
 const photos=await findPhotos(product,options),main=photos.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name));
 if(main.length!==1)return null;
 return {main:{sourceName:main[0].name,color:'색상 대조 전'},extras:[],previewOnly:true};
}
export async function originalListingMain(product,options){
 const originals=(await findPhotos(product,options)).filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name));
 if(originals.length!==1)throw Error('바탕화면 상품등록기사진폴더의 해당 품번 폴더에서 1.jpg 또는 1번.jpg 한 장을 확인해 주세요.');
 return workingProductPhoto(originals[0],product,options);
}
export async function prepareListingImages(product,folder,{dataRoot,...photoOptions}){
 const manifest=await listingManifest(product,{dataRoot});if(!manifest)throw Error('대표·추가이미지 사진 선택을 먼저 준비해 주세요.');
 if(!manifest.main||!Array.isArray(manifest.extras)||manifest.extras.length>9)throw Error('스마트스토어 이미지 선택 자료를 확인해 주세요.');
 const photos=await findPhotos(product,{...photoOptions,dataRoot});
 const originals=photos.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name||''));
 if(originals.length!==1)throw Error('품번 폴더의 원본 1.jpg 또는 1번.jpg 한 장을 확인해 주세요.');
 const main=await workingProductPhoto(originals[0],product,{dataRoot}),extras=[];
 for(const entry of manifest.extras){
  if(entry.role==='official-main'){
   const collected=JSON.parse(await readFile(path.join(folder,'product.json'),'utf8'));
   if(collected.style!==product.style||collected.sourceUrl!==product.sourceUrl||collected.images?.main!==product.images.main||entry.sourceUrl!==product.images.main)throw Error('현재 품번의 공식몰 대표사진을 다시 수집해 주세요.');
   const official=path.join(folder,'main.jpg');extras.push(await workingProductPhoto({file:official},product,{dataRoot}));continue;
  }
  if(!product.colors.includes(entry.color)&&!(manifest.trustedFolder&&entry.role==='provided'))throw Error('추가사진의 색상을 확인해 주세요.');
  const exact=photos.filter(p=>p.name===entry.sourceName&&(!entry.sourceHash||hash(p.bytes)===entry.sourceHash));
  const matches=exact.length?exact:photos.filter(p=>entry.sourceHash?hash(p.bytes)===entry.sourceHash:p.name===entry.sourceName);
  if(matches.length!==1)throw Error('품번 폴더에서 추가사진 원본을 확인해 주세요: '+entry.sourceName);
  extras.push(await workingProductPhoto(matches[0],product,{dataRoot}));
 }
 return {main,extras,manifest};
}
