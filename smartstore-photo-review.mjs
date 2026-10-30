import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {findPhotos} from './smartstore-photo-files.mjs';
import {readPhotoMappings,savePhotoMappings} from './smartstore-photo-mapping-cache.mjs';
import {saveCareLabelSelection} from './smartstore-care-label.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const roles=new Set(['front','back','side','detail','care-label']);
async function draftFor(dataRoot,p){try{const d=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json'),'utf8'));return d.sourceUrl===p.sourceUrl?d:{};}catch(e){if(e.code!=='ENOENT')throw e;return {};}}
export async function photoReview(product,{dataRoot,...options}){
 const photos=await findPhotos(product,options),draft=await draftFor(dataRoot,product),saved=await readPhotoMappings(dataRoot,product);
 const items=photos.map(p=>{const id=hash(p.bytes),mapping=saved.find(r=>r.hash===id&&r.reviewed)||draft.photoMapping?.files?.find(r=>r.hash===id);const care=draft.careLabels?.some(r=>r.sourceHash===id);return {id:p.id,hash:id,name:p.name,main:/^1(?:번)?\.(jpe?g|png|webp)$/i.test(p.name),color:mapping?.color||'',role:care?'care-label':roles.has(mapping?.role)?mapping.role:'',reviewed:!!mapping?.reviewed};});
 const revision=hash(JSON.stringify([product.style,product.sourceUrl,product.colors,items.map(p=>[p.id,p.name])]));
 return {style:product.style,sourceUrl:product.sourceUrl,colors:product.colors,revision,items};
}
export function validatePhotoReview(current,input){
 if(input.channel!=='smartstore'||input.style!==current.style||input.sourceUrl!==current.sourceUrl||input.revision!==current.revision)throw Error('상품 또는 사진 폴더가 변경됐습니다. 사진 목록을 다시 열어 주세요.');
 if(!Array.isArray(input.items)||input.items.length!==current.items.length)throw Error('모든 사진의 색상과 구도를 확인해 주세요.');
 const seen=new Set();for(const item of input.items){if(seen.has(item.id)||!current.items.some(p=>p.id===item.id)||!roles.has(item.role)||(item.role!=='care-label'&&!current.colors.includes(item.color)))throw Error('사진별 색상과 구도를 모두 선택해 주세요.');seen.add(item.id);}
 const duplicates=new Map();for(const item of input.items){const digest=current.items.find(p=>p.id===item.id).hash,selection=item.role+'|'+(item.role==='care-label'?'':item.color);if(duplicates.has(digest)&&duplicates.get(digest)!==selection)throw Error('동일한 원본 사진은 같은 색상·구도로 선택해 주세요.');duplicates.set(digest,selection);}
 if(input.items.filter(p=>p.role==='care-label').length>3)throw Error('케어라벨은 최대 3장입니다.');
 if(current.items.some(p=>p.main&&input.items.find(i=>i.id===p.id)?.role!=='front'))throw Error('1번 대표사진은 정면/다른 정면 구도로 지정해 주세요.');
 return input.items;
}
export async function savePhotoReview(product,input,{dataRoot,...options}){
 const current=await photoReview(product,{dataRoot,...options});const items=validatePhotoReview(current,input);
 const photos=await findPhotos(product,options);if(hash(JSON.stringify([product.style,product.sourceUrl,product.colors,photos.map(p=>[p.id,p.name])]))!==current.revision)throw Error('사진 폴더가 변경됐습니다. 다시 열어 주세요.');
 const reviewedAt=new Date().toISOString(),root=path.join(dataRoot,'smartstore-details',product.style),draft=await draftFor(dataRoot,product);
 await savePhotoMappings(dataRoot,product,items.map(p=>({hash:current.items.find(i=>i.id===p.id).hash,color:p.role==='care-label'?'':p.color,role:p.role,reviewed:true,reviewedAt,reviewedBy:'사용자 사진 선택',reviewBasis:'등록기 사진별 색상·구도 직접 선택'})));
 await mkdir(path.join(dataRoot,'smartstore-photo-label-cache'),{recursive:true});
 for(const p of items)await writeFile(path.join(dataRoot,'smartstore-photo-label-cache',current.items.find(i=>i.id===p.id).hash+'.json'),JSON.stringify({version:1,label:p.role==='care-label',reviewed:true}));
 draft.careLabels=await saveCareLabelSelection(root,photos.filter(p=>items.find(i=>i.id===p.id)?.role==='care-label'));
 await mkdir(root,{recursive:true});await writeFile(path.join(root,'draft.json'),JSON.stringify({...draft,style:product.style,sourceUrl:product.sourceUrl},null,2));
 return {count:items.length};
}
