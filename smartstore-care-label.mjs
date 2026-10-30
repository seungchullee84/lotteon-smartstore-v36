import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cachedPhotoWorkFile} from './smartstore-photo-work.mjs';
import {findPhotos} from './smartstore-photo-files.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function isCareLabelPhoto(photo,draft){
 return photo.role==='care-label'||/케어|라벨|care[ _-]?label|hang[ _-]?tag|^택(?:[ _.-]|\d|\.)/i.test(photo.name||'')||(draft?.careLabels||[]).some(r=>r.sourceHash===hash(photo.bytes));
}
export async function saveCareLabelSelection(root,photos){
 if(photos.length>3)throw Error('택/케어라벨 이미지는 최대 3장입니다. 품번 폴더를 정리해 주세요.');
 const labels=[];await mkdir(path.join(root,'care-labels'),{recursive:true});
 for(const photo of photos){const sourceHash=hash(photo.bytes),work=await cachedPhotoWorkFile(photo.bytes,path.join(root,'care-labels')),file=path.relative(root,work).split(path.sep).join('/');labels.push({file,sourceName:photo.name,sourceHash});}
 return labels;
}
export async function prepareCareLabelImages(product,folder,{dataRoot,...options}){
 const root=path.join(dataRoot,'smartstore-details',product.style);let draft;
 try{draft=JSON.parse(await readFile(path.join(root,'draft.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(draft&&(draft.style!==product.style||draft.sourceUrl!==product.sourceUrl))throw Error('택/케어라벨의 품번·출처를 확인해 주세요.');
 // Always inspect the current folder: a cached photo must not survive removal.
 const photos=(await findPhotos(product,{...options,dataRoot})).filter(p=>isCareLabelPhoto(p,draft));
 const selection=await saveCareLabelSelection(root,photos),files=[];
 for(const label of selection){const file=path.join(folder,'smartstore-carelabel-'+label.sourceHash.slice(0,24)+'.jpg');await writeFile(file,await readFile(path.join(root,label.file)));files.push(file);}
 return files;
}
