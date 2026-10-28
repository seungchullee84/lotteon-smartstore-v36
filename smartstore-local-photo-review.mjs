import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {findPhotos} from './smartstore-photo-files.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const roles=new Set(['provided','front','side','back','detail','care-label']);
export async function localPhotoReview(product,{dataRoot,...options}){
 if(!/^\d{6}$/.test(product?.style||''))throw Error('현재 품번을 확인해 주세요.');
 const folder=path.join(dataRoot,'smartstore-details',product.style);
 let draft;try{draft=JSON.parse(await readFile(path.join(folder,'draft.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(draft&&(draft.style!==product.style||draft.sourceUrl!==product.sourceUrl))throw Error('사진 연결 자료의 품번·공식 출처가 다릅니다.');
 return (await findPhotos(product,options)).map(photo=>{
  const hash=digest(photo.bytes),prior=draft?.photoMapping?.files?.find(r=>r.name===photo.name&&r.hash===hash);
  return {...photo,hash,id:digest(Buffer.from(photo.name+'|'+hash)).slice(0,24),color:product.colors.includes(prior?.color)?prior.color:'',role:roles.has(prior?.role)?prior.role:'provided'};
 });
}
export async function applyLocalPhotoReview(product,choices,options){
 const photos=await localPhotoReview(product,options);
 if(!Array.isArray(choices)||choices.length!==photos.length||new Set(choices.map(c=>c.id)).size!==photos.length)throw Error('폴더 사진이 변경됐습니다. 사진 확인 창을 다시 열어 주세요.');
 const records=choices.map(choice=>{
  const photo=photos.find(p=>p.id===choice.id);
  if(!photo||!roles.has(choice.role)||(!['provided','care-label'].includes(choice.role)&&!product.colors.includes(choice.color)))throw Error('사진의 색상·각도를 확인해 주세요.');
  return {name:photo.name,hash:photo.hash,color:['provided','care-label'].includes(choice.role)?'':choice.color,role:choice.role,source:'user-folder-review',evidence:'등록기 사진 확인 화면에서 사용자 선택'};
 });
 const folder=path.join(options.dataRoot,'smartstore-details',product.style),file=path.join(folder,'draft.json');
 let draft={style:product.style,sourceUrl:product.sourceUrl};try{draft=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 // Explicit folder choices replace the active selection; source files stay intact.
 delete draft.importedColorPhotos;
 draft.photoMapping={...draft.photoMapping,files:records,ignoredPhotos:(draft.photoMapping?.ignoredPhotos||[]).filter(r=>!records.some(p=>p.hash===r.hash))};
 await mkdir(folder,{recursive:true});await writeFile(file+'.local-review.tmp',JSON.stringify(draft,null,2));await rename(file+'.local-review.tmp',file);
 return records;
}
