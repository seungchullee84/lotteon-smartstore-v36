import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {officialSellingPoints,usableSellingPoints} from './smartstore-selling-points.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
export async function saveOfficialImagePointReview(product,folder,{text,points,dataRoot=path.resolve('data')}={}){
 if(!/^\d{6}$/.test(product.style)||new URL(product.sourceUrl).origin!=='https://www.giordano.co.kr'||!text?.trim()||!Array.isArray(points)||points.length>4||!usableSellingPoints(points,text))throw Error('공식 상세 이미지의 원문과 소구점 근거를 확인해 주세요.');
 const detailHash=digest(await readFile(path.join(folder,'detail.jpg')));
 const record={version:1,method:'visual-official-detail',style:product.style,sourceUrl:product.sourceUrl,detailHash,text,points,reviewedAt:new Date().toISOString()};
 const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(root,{recursive:true});await writeFile(path.join(root,'selling-point-image-review.json'),JSON.stringify(record,null,2));return record;
}
export async function reviewSellingPoints(product,source,{dataRoot,detailHash=null,signal}={}){
 signal?.throwIfAborted();
 const identity={version:4,method:'local-official-text',style:product.style,sourceUrl:product.sourceUrl,textHash:digest(source),detailHash};
 const root=path.join(dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-review.json');
 let imageReview;try{imageReview=JSON.parse(await readFile(path.join(root,'selling-point-image-review.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(detailHash&&imageReview?.version===1&&imageReview.style===product.style&&imageReview.sourceUrl===product.sourceUrl&&imageReview.detailHash===detailHash&&imageReview.points?.length<=4&&usableSellingPoints(imageReview.points,imageReview.text)){
  const record={...identity,method:'visual-official-detail',points:imageReview.points,status:'ready',message:'공식 상세 이미지 원문 대조 완료',reviewedAt:imageReview.reviewedAt};await writeFile(file,JSON.stringify(record,null,2));return record;
 }
 if(!source.trim())return {...identity,points:[],status:'needs-review',message:'공식 상세 원문을 확인해야 합니다.'};
 let cached;try{cached=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(Object.entries(identity).every(([key,value])=>cached?.[key]===value)&&usableSellingPoints(cached.points,source))return {...cached,status:'ready'};
 const points=officialSellingPoints(source),ready=usableSellingPoints(points,source);
 const record={...identity,points:ready?points:[],status:ready?'ready':'needs-review',message:ready?'':'공식 설명에서 구체적인 특징 문장을 확인해야 합니다. 품목명·혼용률·색상 수만으로 소구점을 만들지 않습니다.',reviewedAt:new Date().toISOString()};
 await mkdir(root,{recursive:true});await writeFile(file,JSON.stringify(record,null,2));return record;
}
