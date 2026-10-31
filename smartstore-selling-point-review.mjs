import {catalogImageSource} from './official-benefit-catalog.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {officialSellingPoints,usableSellingPoints,officialImageBenefitText,completeSellingPoints} from './smartstore-selling-points.mjs';
import {enrichOfficialProductFacts} from './apparel-product-facts.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
const sourceJobs=new Map();
// Legacy omission flags no longer skip official-source analysis.
export async function sellingPointsOmitted(){return false;}
export async function officialPointSource(product,folder,pageText,{dataRoot=path.resolve('data'),signal,log,recognize}={}){
 if(!product.images?.detail)return {text:pageText,imageChecked:false,detailHash:null};
 let bytes;try{bytes=await readFile(path.join(folder,'detail.jpg'));}catch(e){if(e.code==='ENOENT')return {text:pageText,imageChecked:false,detailHash:null};throw e;}
 const detailHash=digest(bytes);
 // A visual review already checked this exact official image, including its captions.
 for(const name of ['selling-point-candidates-reviewed.json','selling-point-image-review.json'])try{const manual=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,name),'utf8'));if(manual.version===1&&manual.style===product.style&&manual.sourceUrl===product.sourceUrl&&manual.detailHash===detailHash&&usableSellingPoints(manual.points,manual.text))return {text:manual.text+'\n•\n'+pageText,imageChecked:true,detailHash,method:'visual-official-detail'};}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 const catalog=await catalogImageSource(product,detailHash,{dataRoot});
 if(catalog)return {text:[officialImageBenefitText(catalog.imageText),pageText].filter(Boolean).join('\n•\n'),imageChecked:true,detailHash,method:'official-catalog-image-cache'};
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
 const identity={version:12,method:'local-official-text',style:product.style,sourceUrl:product.sourceUrl,textHash:digest(source),detailHash};
 const root=path.join(dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-review.json');
 const finish=async(record,text=source)=>{
  const points=record.points?.length>=2?record.points.slice(0,4):completeSellingPoints(record.points,text);
  const ready=usableSellingPoints(points,text)&&points.length>=2&&points.length<=4;
  const result={...record,points,omitted:false,status:ready?'ready':'needs-review',message:ready?'공식 근거 구매 장점 '+points.length+'개 적용':'공식 상품 설명·상세이미지에서 서로 다른 구매 장점 2~4개 확인 필요'};
  await mkdir(root,{recursive:true});await writeFile(file,JSON.stringify(result,null,2));return result;
 };
 let selection;try{selection=JSON.parse(await readFile(path.join(root,'selling-point-selection.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(selection?.sourceUrl===product.sourceUrl&&selection.detailHash===detailHash&&(detailHash||selection.textHash===digest(source))&&selection.points?.length>=1&&selection.points.length<=4&&usableSellingPoints(selection.points,source)){
  return finish({...identity,method:'user-selected-official-points',points:selection.points,reviewedAt:selection.selectedAt});
 }
 let imageReview;try{imageReview=JSON.parse(await readFile(path.join(root,'selling-point-image-review.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(detailHash&&imageReview?.version===1&&imageReview.style===product.style&&imageReview.sourceUrl===product.sourceUrl&&imageReview.detailHash===detailHash&&imageReview.points?.length<=4&&usableSellingPoints(imageReview.points,imageReview.text)){
  const text=[imageReview.text,source].join('\n');
  const points=completeSellingPoints(imageReview.points,text);
  return finish({...identity,method:'visual-official-detail',points,reviewedAt:imageReview.reviewedAt},text);
 }
 let cached;try{cached=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(Object.entries(identity).every(([key,value])=>cached?.[key]===value)&&cached.points?.length>=2&&usableSellingPoints(cached.points,source))return finish(cached);
 return finish({...identity,points:completeSellingPoints([],source),reviewedAt:new Date().toISOString()});
}
