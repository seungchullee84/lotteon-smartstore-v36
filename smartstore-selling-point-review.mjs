import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {officialSellingPoints,usableSellingPoints} from './smartstore-selling-points.mjs';
import {enrichOfficialProductFacts} from './apparel-product-facts.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
const sourceJobs=new Map();
export async function officialPointSource(product,folder,pageText,{dataRoot=path.resolve('data'),signal,log,recognize}={}){
 if(!product.images?.detail)return {text:pageText,imageChecked:false,detailHash:null};
 let bytes;try{bytes=await readFile(path.join(folder,'detail.jpg'));}catch(e){if(e.code==='ENOENT')return {text:pageText,imageChecked:false,detailHash:null};throw e;}
 const detailHash=digest(bytes);
 // A visual review already checked this exact official image, including its captions.
 try{const manual=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'selling-point-image-review.json'),'utf8'));if(manual.version===1&&manual.style===product.style&&manual.sourceUrl===product.sourceUrl&&manual.detailHash===detailHash&&usableSellingPoints(manual.points,manual.text))return {text:manual.text+'\n•\n'+pageText,imageChecked:true,detailHash,method:'visual-official-detail'};}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 const key=JSON.stringify([dataRoot,product.style,product.sourceUrl,detailHash]);
 let job=sourceJobs.get(key);if(!job){job=enrichOfficialProductFacts(product,folder,{dataRoot,signal,log,recognize}).then(p=>p.researchFacts);sourceJobs.set(key,job);job.finally(()=>{if(sourceJobs.get(key)===job)sourceJobs.delete(key);}).catch(()=>{});}
 const facts=await job;signal?.throwIfAborted();
 if(!facts?.imageScanComplete||facts.style!==product.style||facts.sourceUrl!==product.sourceUrl||facts.detailHash!==detailHash)throw Error('현재 공식 상세이미지 전체 확인이 끝나지 않았습니다.');
 const imageText=String(facts.text||'').split(/(?:^|\n)\s*(?:DETAIL\s*SIZE|CHECK\s*UP|INFORMATION)\b/i)[0];
 return {text:[imageText,pageText].filter(Boolean).join('\n•\n'),imageChecked:true,detailHash,method:'local-official-image-and-page'};
}
export async function saveOfficialImagePointReview(product,folder,{text,points,dataRoot=path.resolve('data')}={}){
 if(!/^\d{6}$/.test(product.style)||new URL(product.sourceUrl).origin!=='https://www.giordano.co.kr'||!text?.trim()||!Array.isArray(points)||points.length>4||!usableSellingPoints(points,text))throw Error('공식 상세 이미지의 원문과 소구점 근거를 확인해 주세요.');
 const detailHash=digest(await readFile(path.join(folder,'detail.jpg')));
 const record={version:1,method:'visual-official-detail',style:product.style,sourceUrl:product.sourceUrl,detailHash,text,points,reviewedAt:new Date().toISOString()};
 const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(root,{recursive:true});await writeFile(path.join(root,'selling-point-image-review.json'),JSON.stringify(record,null,2));return record;
}
export async function reviewSellingPoints(product,source,{dataRoot,detailHash=null,signal}={}){
 signal?.throwIfAborted();
 const identity={version:5,method:'local-official-text',style:product.style,sourceUrl:product.sourceUrl,textHash:digest(source),detailHash};
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
