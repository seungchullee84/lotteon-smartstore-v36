import {createHash} from 'node:crypto';
import {access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {openMausCli,runOpenMausReview} from './openmaus-research.mjs';
import {atomicWrite} from './atomic-file.mjs';
import {sameOfficialProduct} from './official-benefit-catalog.mjs';
import {appendDistinctSellingPoints,officialSellingPoints,usableSellingPoints} from './smartstore-selling-points.mjs';

export function verifiedOpenMausPoints(response,input,points,source){
 if(response?.style!==input.style||response.sourceUrl!==input.sourceUrl||response.detailHash!==input.detailHash||!Array.isArray(response.quotes))return points;
 const additions=[];
 for(const quote of response.quotes.slice(0,8)){
  if(typeof quote!=='string'||quote.length<8||quote.length>240||!input.source.includes(quote))continue;
  // Generate copy with the registrar's existing rules, from the verified quote alone.
  for(const point of officialSellingPoints(quote)){
   if(usableSellingPoints([point],quote))additions.push({...point,evidence:quote});
  }
 }
 return appendDistinctSellingPoints(points,additions,source);
}

const prompt=[
 '기존 소구점과 겹치지 않는 구매 장점의 공식 원문 구절만 최대 8개 골라라. 문장 또는 독립된 구절을 줄바꿈까지 정확하게 복사하라.',
 '부정, 조건 생략, 다른 상품, 안내 문구, 색상 수, 깨진 OCR은 제외한다. 한 구절에는 독립된 장점 하나만 담아라.',
 'JSON 형식은 {"style":"입력값","sourceUrl":"입력값","detailHash":"입력값","quotes":["정확한 공식 구절"]}이다.',
].join('\n');
let active=null;

export async function supplementSellingPoints(product,points,source,{dataRoot,detailHash,signal,log,start=true}){
 if(points.length>=3||!source.trim()||!/^\d{6}$/.test(product.style)||
    !/^[a-f0-9]{64}$/i.test(detailHash||'')||!sameOfficialProduct(product.sourceUrl,product.sourceUrl)||
    !/^[a-f0-9]{32}$/i.test(new URL(product.sourceUrl).searchParams.get('pno')||''))return points;
 const input={style:product.style,sourceUrl:product.sourceUrl,detailHash,source:source.slice(0,36000),
  existing:points.map(({title,description})=>({title,description}))};
 const key=createHash('sha256').update(JSON.stringify(['official-quotes-v2',input])).digest('hex');
 const cache=path.join(dataRoot,'openmausbot','quotes',key+'.json');
 let cached;
 try{cached=JSON.parse(await readFile(cache,'utf8'));}catch{}
 if(cached)return verifiedOpenMausPoints(cached,input,points,source);
 if(!start||active||signal?.aborted)return points;
 const cli=openMausCli(dataRoot);
 try{await access(cli);}catch{return points;}
 if(active||signal?.aborted)return points;
 log?.('OpenMausBot 공식 근거 검토를 백그라운드에서 시작');
 active=runOpenMausReview(cli,input,prompt,{signal}).then(async response=>{
  if(response?.style!==input.style||response.sourceUrl!==input.sourceUrl||response.detailHash!==input.detailHash||!Array.isArray(response.quotes))return;
  await atomicWrite(cache,JSON.stringify(response));
 }).catch(()=>{}).finally(()=>{active=null;});
 return points;
}
