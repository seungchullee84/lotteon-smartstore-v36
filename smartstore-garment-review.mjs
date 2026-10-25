import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {findPhotos} from './smartstore-photo-files.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const allowed={sleeve:['긴팔','반팔','민소매',''],neckline:['후드넥','라운드넥','V넥','칼라넥','터틀넥','스텐드/차이나칼라','']};
export function validateGarmentReview(values){
 for(const key of Object.keys(allowed))if(!allowed[key].includes(values?.[key]??''))throw Error('사진 대조 속성 값을 확인해 주세요: '+key);
 if(!values?.evidence?.trim())throw Error('사진 대조 근거가 필요합니다.');
 return {sleeve:values.sleeve||'',neckline:values.neckline||'',evidence:values.evidence};
}
async function context(product,folder,options){
 if(!/^\d{6}$/.test(product.style||'')||!product.sourceUrl)throw Error('사진 대조 대상 품번·공식 출처가 필요합니다.');
 const photos=await findPhotos(product,options);
 return {style:product.style,sourceUrl:product.sourceUrl,detailHash:product.images?.detail?digest(await readFile(path.join(folder,'detail.jpg'))):null,photoHashes:[...new Set(photos.map(p=>digest(p.bytes)))].sort()};
}
const location=(product,options)=>path.join(options.dataRoot,'smartstore-details',product.style,'garment-review.json');
export async function saveGarmentReview(product,folder,values,options){
 const record={...await context(product,folder,options),...validateGarmentReview(values),version:1};
 const file=location(product,options);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(record,null,2));return record;
}
export async function applyGarmentReview(product,folder,options){
 // Never retain a previous run's resolved fields without checking current image bytes.
 const clean={...product};delete clean.reviewedGarmentAttributes;
 let record;try{record=JSON.parse(await readFile(location(product,options),'utf8'));}catch(e){if(e.code==='ENOENT')return clean;throw e;}
 const current=await context(product,folder,options);
 if(record.version!==1||['style','sourceUrl','detailHash','photoHashes'].some(k=>JSON.stringify(record[k])!==JSON.stringify(current[k])))return clean;
 const values=validateGarmentReview(record);
 return {...clean,reviewedGarmentAttributes:{style:current.style,sourceUrl:current.sourceUrl,...values}};
}
