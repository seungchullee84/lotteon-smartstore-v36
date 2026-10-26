import {auditItemscoutKeywords,eligibleItemscoutKeywords} from '../itemscout-categories.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {keywordCandidates,packKeywords,createKeywordOptimizer,verifyNaver} from '../naver-keywords.mjs';
const product={name:'여성 겨울 후드 숏 패딩',gender:'여성'};
const credentials={clientId:'dummy',clientSecret:'dummy'};

test('상위 검색어와 지오다노 첫 순서를 유지하며 단순 순차 조립의 빈칸을 줄인다',()=>{
 const ranked=['가'.repeat(9),'나'.repeat(14),'다'.repeat(11),'라'.repeat(11)];
 const result=packKeywords(ranked);
 assert.equal(result,'지오다노,'+ranked[0]+','+ranked[2]+','+ranked[3]);
 assert.equal(result.length,38);
 assert.equal(packKeywords(['니트']),'지오다노,니트');
});

test('태그사전은 상품 근거가 있는 원본 명칭만 후보로 추가한다',()=>{
 const researchIndex={tags:['남성슬랙스','기모슬랙스','와이드슬랙스','여성슬랙스','겨울슬랙스','기모슬랙스코디'].map((name,i)=>({id:String(i+1),name,decision:'include',kind:'garment'}))};
 const candidates=keywordCandidates({name:'남성 기모 슬랙스',gender:'남성'},{researchIndex});
 assert(candidates.includes('기모슬랙스'));assert(candidates.includes('남성슬랙스'));
 for(const name of ['와이드슬랙스','여성슬랙스','겨울슬랙스','기모슬랙스코디'])assert(!candidates.includes(name));
 assert(!candidates.includes('지오다노'));
});
test('관련 후보만 만들고 쉼표 포함 40자를 넘기거나 단어를 자르지 않는다',()=>{
 const candidates=keywordCandidates(product);
 assert(candidates.includes('후드패딩'));assert(candidates.includes('숏패딩'));assert(!candidates.includes('롱패딩'));
 const text=packKeywords(candidates);assert(text.length<=40);assert(text.startsWith('지오다노,'));
 for(const word of text.split(',').slice(1))assert(candidates.includes(word));
});
test('서로 다른 요청의 정규화 척도를 공통 기준으로 맞추고 캐시를 사용한다',async()=>{
 let calls=0;const values=Object.fromEntries(keywordCandidates(product).map((k,i)=>[k,i+1]));
 const optimize=createKeywordOptimizer({fetchImpl:async(_url,config)=>{
  calls++;const req=JSON.parse(config.body);assert(req.keywordGroups.length<=5);
  const max=Math.max(...req.keywordGroups.map(g=>values[g.groupName]));
  return Response.json({...req,results:req.keywordGroups.map(g=>({title:g.groupName,data:[{period:req.endDate,ratio:values[g.groupName]/max*100}]}))});
 }});
 const result=await optimize(product,credentials);assert(calls>1);assert(result.length<=40);
 assert.equal(result.ranking[0].keyword,keywordCandidates(product).at(-1));
 const before=calls;assert((await optimize(product,credentials)).fromCache);assert.equal(calls,before);
});
test('인증 오류와 기준 검색 자료가 없는 경우 인기 순위를 만들어내지 않는다',async()=>{
 await assert.rejects(verifyNaver(credentials,async()=>Response.json({error:{errorCode:'200'}},{status:401})),error=>error.httpStatus===401&&error.apiCode==='200');
 const optimize=createKeywordOptimizer({fetchImpl:async(_url,config)=>{const req=JSON.parse(config.body);return Response.json({...req,results:req.keywordGroups.map(g=>({title:g.groupName,data:[]}))});}});
 await assert.rejects(optimize(product,credentials),/검색 자료가 없어/);
});
test('비교 요청은 두 개씩 병렬 처리하고 같은 동시 조회는 한 번만 실행',async()=>{
 let active=0,maximum=0,calls=0;
 const p={name:'여성 겨울 경량 후드 숏 패딩',gender:'여성'};
 const optimize=createKeywordOptimizer({fetchImpl:async(_url,config)=>{
  calls++;maximum=Math.max(maximum,++active);await new Promise(resolve=>setTimeout(resolve,5));active--;
  const req=JSON.parse(config.body);return Response.json({...req,results:req.keywordGroups.map(g=>({title:g.groupName,data:[{period:req.endDate,ratio:10}]}))});
 }});
 const [first,second]=await Promise.all([optimize(p,credentials),optimize(p,credentials)]);
 assert.equal(maximum,2);assert.equal(calls,Math.ceil((eligibleItemscoutKeywords(auditItemscoutKeywords(p,keywordCandidates(p))).length-1)/4));assert.deepEqual(first.ranking,second.ranking);assert(second.fromCache);
});
