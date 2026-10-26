import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {officialSellingPoints,usableSellingPoints} from './smartstore-selling-points.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
export async function reviewSellingPoints(product,source,{dataRoot,detailHash=null,signal}={}){
 signal?.throwIfAborted();
 const identity={version:2,method:'local-official-text',style:product.style,sourceUrl:product.sourceUrl,textHash:digest(source),detailHash};
 if(!source.trim())return {...identity,points:[],status:'needs-review',message:'공식 상세 원문을 확인해야 합니다.'};
 const root=path.join(dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-review.json');
 let cached;try{cached=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(Object.entries(identity).every(([key,value])=>cached?.[key]===value)&&usableSellingPoints(cached.points,source))return {...cached,status:'ready'};
 const points=officialSellingPoints(source),ready=usableSellingPoints(points,source);
 const record={...identity,points:ready?points:[],status:ready?'ready':'needs-review',message:ready?'':'공식 설명에서 구체적인 특징 문장을 확인해야 합니다. 품목명·혼용률·색상 수만으로 소구점을 만들지 않습니다.',reviewedAt:new Date().toISOString()};
 await mkdir(root,{recursive:true});await writeFile(file,JSON.stringify(record,null,2));return record;
}
