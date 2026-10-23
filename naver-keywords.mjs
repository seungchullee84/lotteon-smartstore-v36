import {buildKeywords,SEARCH_KEYWORDS_MAX_LENGTH} from './product.mjs';
import {NAVER_TREND_URL,trendPeriod,interpretTrend} from './naver-title.mjs';

export function keywordCandidates(product){
 const base=buildKeywords(product,Infinity).split(',').filter(k=>k&&k!=='지오다노');
 const kind=base[0]?.replace(/^(남성|여성)/,'');
 const alias=({남성:'남자',여성:'여자'})[product.gender];
 if(kind&&alias)base.push(alias+kind);
 if(kind)base.push(kind);
 const name=String(product.name||product.rawName||'');
 if(kind==='패딩'&&!/베스트|조끼/.test(name))base.push('패딩점퍼','패딩자켓');
 if(['남성','여성'].includes(product.gender)){
  for(const keyword of [...base])if(kind&&keyword.endsWith(kind)&&keyword!==kind&&!/^(남성|여성|남자|여자)/.test(keyword))base.push(product.gender+keyword);
 }
 if(/패딩|코트|자켓|점퍼|바람막이/.test(kind||''))base.push('아우터');
 if(/겨울|동절기/.test(name)&&/패딩|점퍼|자켓|코트/.test(kind||''))base.push('겨울점퍼','겨울아우터');
 return [...new Set(base)].slice(0,16);
}
export function packKeywords(ranked,max=SEARCH_KEYWORDS_MAX_LENGTH){
 const words=['지오다노'];
 for(const keyword of ranked){if(keyword&&!words.includes(keyword)&&[...words,keyword].join(',').length<=max)words.push(keyword);}
 return words.join(',');
}
export async function queryNaver(credentials,request,fetchImpl=fetch){
 if(!credentials?.clientId||!credentials?.clientSecret)throw Error('NAVER API HUB의 Client ID와 Client Secret을 설정해 주세요.');
 let response;
 try{response=await fetchImpl(NAVER_TREND_URL,{method:'POST',headers:{'Content-Type':'application/json','X-NCP-APIGW-API-KEY-ID':credentials.clientId,'X-NCP-APIGW-API-KEY':credentials.clientSecret},body:JSON.stringify(request),signal:AbortSignal.timeout(8000),redirect:'error'});}catch{throw Error('네이버 API 연결 실패. 네트워크를 확인해 주세요.');}
 if(!response.ok){
  let code='';try{const body=await response.json();const raw=body.error?.errorCode??body.errorCode;if(/^[A-Za-z0-9_-]{1,20}$/.test(String(raw||'')))code=String(raw);}catch{}
  const message=({401:'NAVER API HUB 인증 실패. 클라우드 콘솔의 NAVER API HUB에서 발급한 Client ID·Client Secret과 검색어 트렌드 사용 권한을 확인하세요. 기존 개발자센터 키는 사용할 수 없습니다.',403:'NAVER API HUB의 검색어 트렌드 사용 권한을 확인하세요.',429:'네이버 API 호출 한도를 초과했습니다. 나중에 다시 시도하세요.'})[response.status]||'네이버 API 조회 실패.';
  const error=Error(message+' (HTTP '+response.status+(code?', 코드 '+code:'')+')');
  error.httpStatus=response.status;error.apiCode=code;throw error;
 }
 const payload=await response.json();
 interpretTrend(payload,request,request.keywordGroups.map(g=>({keyword:g.groupName})));
 return payload;
}
export async function verifyNaver(credentials,fetchImpl=fetch){
 await queryNaver(credentials,{...trendPeriod(),keywordGroups:[{groupName:'의류',keywords:['의류']}]},fetchImpl);
 return {verified:true,verifiedAt:new Date().toISOString()};
}
export function createKeywordOptimizer({fetchImpl=fetch,clock=()=>new Date(),candidateFactory=keywordCandidates}={}){
 const cache=new Map(),inFlight=new Map();
 return async(product,credentials)=>{
  const candidates=candidateFactory(product),period=trendPeriod(clock());
  if(!candidates.length)throw Error('상품 종류를 확인한 뒤 키워드를 조회해 주세요.');
  const cacheKey=JSON.stringify([credentials?.clientId,credentials?.clientSecret,period,candidates]);
  const saved=cache.get(cacheKey);if(saved&&clock().getTime()-saved.time<3600000)return {...saved.result,fromCache:true};
  if(inFlight.has(cacheKey))return {...await inFlight.get(cacheKey),fromCache:true};
  const pending=(async()=>{
  // Every batch shares one anchor and the same period. Normalize against its
  // summed index so separately normalized API responses remain comparable.
  const anchor=candidates[0],scores=new Map();
  const batches=[];
  for(let i=1;i<candidates.length||i===1;i+=4)batches.push([anchor,...candidates.slice(i,i+4)]);
  const responses=new Array(batches.length);let next=0;
  const workers=await Promise.allSettled(Array.from({length:Math.min(2,batches.length)},async()=>{
   while(next<batches.length){
    const index=next++,keywords=batches[index];
    const request={...period,keywordGroups:keywords.map(keyword=>({groupName:keyword,keywords:[keyword]}))};
    const payload=await queryNaver(credentials,request,fetchImpl);
    responses[index]=interpretTrend(payload,request,keywords.map(keyword=>({keyword})));
   }
  }));
  const failed=workers.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  for(const entries of responses){
   const anchorTotal=entries[0].points.reduce((n,p)=>n+p.ratio,0);
   if(!anchorTotal)throw Error('비교 기준 키워드의 검색 자료가 없어 인기도를 비교할 수 없습니다. 기존 키워드를 유지합니다.');
   for(const entry of entries)scores.set(entry.keyword,entry.points.reduce((n,p)=>n+p.ratio,0)/anchorTotal);
  }
  const ranked=[...scores].filter(([,score])=>score>0).sort((a,b)=>b[1]-a[1]);
  const result={keywords:packKeywords(ranked.map(([k])=>k)),length:0,period,source:'네이버 데이터랩 검색 상대지수',ranking:ranked.map(([keyword,score])=>({keyword,score})),fromCache:false};
  result.length=result.keywords.length;
  if(cache.size>=100)cache.delete(cache.keys().next().value);
  cache.set(cacheKey,{time:clock().getTime(),result});return result;
  })();
  inFlight.set(cacheKey,pending);
  try{return await pending;}finally{inFlight.delete(cacheKey);}
 };
}
