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
 const paragraphs=input.source.split(/\n\s*\n|[•●]/);
 const conditional=/(?:제공|적용|차단|지원|유지|방지|가능)(?:하|되)?(?:지\s*않|지\s*못|지\s*안|\s*여부|\s*불가)|(?:일부|특정)\s*(?:색상|컬러|사이즈)|(?:대상|적용)\s*제외/;
 for(const quote of response.quotes.slice(0,8)){
  if(typeof quote!=='string'||quote.length<8||quote.length>240||
     !paragraphs.some(paragraph=>paragraph.includes(quote)&&!conditional.test(paragraph)))continue;
  // Construct the wording locally from the exact quote.
  const pilling=/보풀\s*방지\s*(?:기능|가공)(?:을|를)?\s*(?:제공|적용|더했)/.test(quote);
  const point=pilling?{title:'보풀을 줄이는 가공',description:'보풀 방지 기능을 더한 소재.',evidence:quote}
   :officialSellingPoints(quote,{limit:1})[0];
  if(point&&usableSellingPoints([point],quote)&&!points.some(existing=>existing.evidence.split(/\s+\/\s+https?:\/\//)[0].trim()===quote.trim()))additions.push({...point,evidence:quote});
 }
 return appendDistinctSellingPoints(points,additions,source);
}

const prompt=[
 '기존 소구점과 겹치지 않는 구매 장점의 공식 원문 구절만 최대 8개 골라라. 문장 또는 독립된 구절을 줄바꿈까지 정확하게 복사하라.',
 '부정, 조건 생략, 다른 상품, 안내 문구, 색상 수, 깨진 OCR은 제외한다. 한 구절에는 독립된 장점 하나만 담아라.',
 'JSON 형식은 {"style":"입력값","sourceUrl":"입력값","detailHash":"입력값","quotes":["정확한 공식 구절"]}이다.',
].join('\n');
let active=null,retryAfter=0;

export async function supplementSellingPoints(product,points,source,{dataRoot,detailHash,signal,log}){
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
 if(active||retryAfter>Date.now()||signal?.aborted)return points;
 const cli=openMausCli(dataRoot);
 try{await access(cli);}catch{return points;}
 if(active||signal?.aborted)return points;
 log?.('OpenMausBot 공식 근거 검토를 백그라운드에서 시작');
 active=runOpenMausReview(cli,input,prompt,{signal}).then(async response=>{
  if(response?.style!==input.style||response.sourceUrl!==input.sourceUrl||response.detailHash!==input.detailHash||!Array.isArray(response.quotes))return;
  await atomicWrite(cache,JSON.stringify(response));
 }).catch(()=>{if(!signal?.aborted)retryAfter=Date.now()+60000;}).finally(()=>{active=null;});
 return points;
}
