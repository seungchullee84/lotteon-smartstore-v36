import {readFile,writeFile,mkdir,stat,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {findPhotos} from './smartstore-photo-files.mjs';
import {readPhotoMappings,savePhotoMappings} from './smartstore-photo-mapping-cache.mjs';
import {saveCareLabelSelection} from './smartstore-care-label.mjs';
import sharp from 'sharp';
import {readMainSelection,saveMainSelection} from './smartstore-main-selection.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inventories=new Map(),thumbnails=new Map();
const inventoryKey=(p,{dataRoot,photoRoots,desktop})=>JSON.stringify([path.resolve(dataRoot),p.style,p.sourceUrl,p.colors,photoRoots,desktop]);
const stamp=s=>s.size+':'+s.mtimeMs+':'+s.ctimeMs;
const roles=new Set(['front','back','side','detail','care-label','excluded']);
export function numberedPhotoColors(colors){const number=c=>{const n=Number(String(c).match(/^\s*(\d{1,2})(?!\d)/)?.[1]);return n>=1&&n<=99?n:100;};return [...colors].sort((a,b)=>number(a)-number(b));}
const selectionFile=(dataRoot,p)=>{if(!/^\d{6}$/.test(p.style))throw Error('사진 품번을 확인해 주세요.');return path.join(dataRoot,'smartstore-photo-review-drafts',p.style+'.json');};
async function draftFor(dataRoot,p){try{const d=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json'),'utf8'));return d.sourceUrl===p.sourceUrl?d:{};}catch(e){if(e.code!=='ENOENT')throw e;return {};}}
export async function photoReview(product,{dataRoot,...options}){
 const photos=await findPhotos(product,{...options,dataRoot,includeExcluded:true}),draft=await draftFor(dataRoot,product),saved=await readPhotoMappings(dataRoot,product);
 const key=inventoryKey(product,{...options,dataRoot}),inventory=new Map(await Promise.all(photos.map(async p=>[p.id,{file:p.file,stamp:stamp(await stat(p.file))}])));
 inventories.delete(key);inventories.set(key,inventory);while(inventories.size>3)inventories.delete(inventories.keys().next().value);
 const items=photos.map(p=>{const id=hash(p.bytes),mapping=saved.find(r=>r.hash===id&&r.reviewed)||draft.photoMapping?.files?.find(r=>r.hash===id);const care=draft.careLabels?.some(r=>r.sourceHash===id);return {id:p.id,hash:id,name:p.name,main:/^1(?:번)?\.(jpe?g|png|webp)$/i.test(p.name),color:mapping?.color||'',role:care?'care-label':roles.has(mapping?.role)?mapping.role:'',reviewed:!!mapping?.reviewed};});
 const mainSelection=await readMainSelection(product,dataRoot);let mainId=mainSelection?items.find(p=>p.hash===mainSelection.sourceHash&&p.name===mainSelection.sourceName)?.id:items.filter(p=>p.main).length===1?items.find(p=>p.main).id:null;
 const revision=hash(JSON.stringify([product.style,product.sourceUrl,product.colors,items.map(p=>[p.id,p.name])]));
 let automatic;try{automatic=JSON.parse(await readFile(path.join(dataRoot,'smartstore-photo-color-drafts',product.style+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(automatic?.sourceUrl===product.sourceUrl&&JSON.stringify(automatic.colors)===JSON.stringify(product.colors))for(const item of items){const suggested=automatic.files.find(p=>p.hash===item.hash);if(suggested&&!item.reviewed){if(!item.color&&product.colors.includes(suggested.color)){item.color=suggested.color;item.colorSuggested=true;}if(!item.role&&suggested.careLabel)item.role='care-label';}}
 let selection;try{selection=JSON.parse(await readFile(selectionFile(dataRoot,product),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const match=selection?.sourceUrl===product.sourceUrl&&selection.revision===revision;
 if(match)for(const item of items){const saved=selection.items.find(i=>i.id===item.id);if(saved&&(saved.color===''||product.colors.includes(saved.color))&&(saved.role===''||roles.has(saved.role))){if(saved.color||saved.colorOverride){item.color=saved.color;item.colorSuggested=false;}if(saved.role)item.role=saved.role;item.colorOverride=!!saved.colorOverride;}}
 if(match&&selection.mainId&&items.some(p=>p.id===selection.mainId))mainId=selection.mainId;for(const item of items)item.main=item.id===mainId;
 const result={mainId,style:product.style,sourceUrl:product.sourceUrl,colors:numberedPhotoColors(product.colors),revision,items,selectionSavedAt:match?selection.savedAt:null};inventory.review=result;return result;
}
export async function savePhotoReviewDraft(product,input,options){
 const current=inventories.get(inventoryKey(product,options))?.review||await photoReview(product,options);
 if(input.channel!=='smartstore'||input.style!==current.style||input.sourceUrl!==current.sourceUrl||input.revision!==current.revision)throw Error('상품 또는 사진 폴더가 변경됐습니다. 다시 열어 주세요.');
 if(!Array.isArray(input.items)||input.items.length!==current.items.length)throw Error('사진 선택 목록을 다시 확인해 주세요.');
 const ids=new Set();for(const i of input.items){if(ids.has(i.id)||!current.items.some(p=>p.id===i.id)||(i.color!==''&&!current.colors.includes(i.color))||(i.role!==''&&!roles.has(i.role)))throw Error('사진 선택 값을 확인해 주세요.');ids.add(i.id);}
 if(input.mainId&&!current.items.some(p=>p.id===input.mainId))throw Error('대표사진 선택을 확인해 주세요.');
 const file=selectionFile(options.dataRoot,product),temporary=file+'.'+randomUUID()+'.tmp',savedAt=new Date().toISOString();
 await mkdir(path.dirname(file),{recursive:true});await writeFile(temporary,JSON.stringify({style:product.style,sourceUrl:product.sourceUrl,revision:current.revision,savedAt,mainId:input.mainId||null,items:input.items.map(({id,color,role,colorOverride})=>({id,color,role,colorOverride:!!colorOverride}))},null,2));await rename(temporary,file);return {savedAt};
}
export async function photoReviewThumbnail(product,id,options){
 const key=inventoryKey(product,options);if(!inventories.has(key))await photoReview(product,options);
 const source=inventories.get(key)?.get(id);if(!source)return null;
 let current;try{current=stamp(await stat(source.file));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(current!==source.stamp)return null;
 const cacheKey=id+'|'+current;if(thumbnails.has(cacheKey))return thumbnails.get(cacheKey);
 const promise=(async()=>{const bytes=await readFile(source.file);if(hash(source.file+'|'+hash(bytes)).slice(0,20)!==id)return null;return sharp(bytes).rotate().resize({width:400,withoutEnlargement:true}).jpeg().toBuffer();})();
 thumbnails.set(cacheKey,promise);while(thumbnails.size>96)thumbnails.delete(thumbnails.keys().next().value);
 try{const result=await promise;if(!result)thumbnails.delete(cacheKey);return result;}catch(e){thumbnails.delete(cacheKey);throw e;}
}
export function validatePhotoReview(current,input){
 if(input.channel!=='smartstore'||input.style!==current.style||input.sourceUrl!==current.sourceUrl||input.revision!==current.revision)throw Error('상품 또는 사진 폴더가 변경됐습니다. 사진 목록을 다시 열어 주세요.');
 if(!Array.isArray(input.items)||input.items.length!==current.items.length)throw Error('모든 사진의 색상과 구도를 확인해 주세요.');
 const seen=new Set();for(const item of input.items){if(seen.has(item.id)||!current.items.some(p=>p.id===item.id)||!roles.has(item.role)||(!['care-label','excluded'].includes(item.role)&&!current.colors.includes(item.color)))throw Error('사진별 색상과 구도를 모두 선택해 주세요.');seen.add(item.id);}
 const duplicates=new Map();for(const item of input.items){const digest=current.items.find(p=>p.id===item.id).hash,selection=item.role+'|'+(['care-label','excluded'].includes(item.role)?'':item.color);if(duplicates.has(digest)&&duplicates.get(digest)!==selection)throw Error('동일한 원본 사진은 같은 색상·구도로 선택해 주세요.');duplicates.set(digest,selection);}
 if(input.items.filter(p=>p.role==='care-label').length>3)throw Error('케어라벨은 최대 3장입니다.');
 const mainId=input.mainId||current.mainId;const main=input.items.find(i=>i.id===mainId);if(!main||['care-label','excluded'].includes(main.role))throw Error('대표사진을 한 장 선택해 주세요. 케어라벨·사용 안 함 사진은 대표가 될 수 없습니다.');
 return input.items;
}
export async function savePhotoReview(product,input,{dataRoot,...options}){
 const current=await photoReview(product,{dataRoot,...options});const items=validatePhotoReview(current,input);
 const photos=await findPhotos(product,{...options,dataRoot,includeExcluded:true});if(hash(JSON.stringify([product.style,product.sourceUrl,product.colors,photos.map(p=>[p.id,p.name])]))!==current.revision)throw Error('사진 폴더가 변경됐습니다. 다시 열어 주세요.');
 await saveMainSelection(product,photos.find(p=>p.id===(input.mainId||current.mainId)),dataRoot);
 const reviewedAt=new Date().toISOString(),root=path.join(dataRoot,'smartstore-details',product.style),draft=await draftFor(dataRoot,product);
 await savePhotoMappings(dataRoot,product,items.map(p=>({hash:current.items.find(i=>i.id===p.id).hash,color:['care-label','excluded'].includes(p.role)?'':p.color,role:p.role,reviewed:true,reviewedAt,reviewedBy:'사용자 사진 선택',reviewBasis:'등록기 사진별 색상·구도·사용 여부 직접 선택'})));
 await mkdir(path.join(dataRoot,'smartstore-photo-label-cache'),{recursive:true});
 for(const p of items)await writeFile(path.join(dataRoot,'smartstore-photo-label-cache',current.items.find(i=>i.id===p.id).hash+'.json'),JSON.stringify({version:1,label:p.role==='care-label',reviewed:true}));
 draft.careLabels=await saveCareLabelSelection(root,photos.filter(p=>items.find(i=>i.id===p.id)?.role==='care-label'));
 await mkdir(root,{recursive:true});await writeFile(path.join(root,'draft.json'),JSON.stringify({...draft,style:product.style,sourceUrl:product.sourceUrl},null,2));
 return {count:items.length};
}
