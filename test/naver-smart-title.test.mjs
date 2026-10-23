import test from 'node:test';
import assert from 'node:assert/strict';
import {expandedTitleCandidates,composePopularTitle,createExpandedTitleOptimizer} from '../naver-smart-title.mjs';
import {assertSmartstoreTitleLength,smartstoreTitle} from '../smartstore-title.mjs';
const product={style:'376922',name:'여성 후드 숏 푸퍼 자켓 376922',gender:'여성'};
const credentials={clientId:'dummy-id',clientSecret:'dummy-secret'};
test('동의어·실제 특성 조합을 확장하고 없는 롱·경량·반대 성별은 제외',()=>{
 const candidates=expandedTitleCandidates(product);
 assert(candidates.length>5);assert(candidates.includes('숏패딩'));assert(candidates.includes('푸퍼'));assert(candidates.includes('여성후드패딩'));
 assert(!candidates.some(k=>/남성|남자|경량|롱/.test(k)));
});
test('공통 기준으로 실제 관심도를 비교하고 32~39자·품번·롯데ON 원문을 보존',async()=>{
 const values={패딩:100,여성패딩:25,여자패딩:12,아우터:23,숏패딩:18,후드패딩:2,푸퍼:1};
 let calls=0;const requests=[];
 const optimize=createExpandedTitleOptimizer({fetchImpl:async(url,config)=>{
  calls++;assert.match(url,/naverapihub/);assert.equal(config.headers['X-NCP-APIGW-API-KEY-ID'],credentials.clientId);
  const request=JSON.parse(config.body);requests.push(request);assert(request.keywordGroups.length<=5);
  const max=Math.max(...request.keywordGroups.map(g=>values[g.groupName]||0.1));
  return Response.json({...request,results:request.keywordGroups.map(g=>({title:g.groupName,data:[{period:request.endDate,ratio:(values[g.groupName]||0.1)/max*100}]}))});
 }});
 const before=structuredClone(product),r=await optimize(product,credentials);
 assert(calls>1);assert(r.length>=32&&r.length<=39);assert(r.title.endsWith('376922'));assert(r.title.includes('후드'));assert(r.title.includes('숏'));assert(r.title.includes('패딩 자켓'));
 assert(r.selectedTerms.includes('여성패딩'));assert(!r.title.includes('롱'));assert.deepEqual(product,before);
 assert.equal(smartstoreTitle({...product,smartstoreName:r.title}),r.title,'실제 입력 시 인기어와 길이를 그대로 보존');
 const prior=calls,r2=await optimize({...product,style:'000000'},credentials);assert.equal(calls,prior);assert(r2.title.endsWith('000000'));assert(r2.fromCache);
});
test('32자 미달·39자 초과를 차단하고 글자수 맞춤용 상품 특성을 발명하지 않음',()=>{
 assert.throws(()=>assertSmartstoreTitleLength('가'.repeat(31)),/32~39/);
 assert.throws(()=>assertSmartstoreTitleLength('가'.repeat(40)),/32~39/);
 assert.equal(assertSmartstoreTitleLength('가'.repeat(32)).length,32);
 assert.equal(assertSmartstoreTitleLength('가'.repeat(39)).length,39);
 assert.throws(()=>composePopularTitle(product,[]),/32~39/);
});
test('API 실패와 검색 자료 없음은 인기어를 꾸며내지 않고 오류 반환',async()=>{
 await assert.rejects(createExpandedTitleOptimizer({fetchImpl:async()=>new Response('',{status:401})})(product,credentials),/인증 실패/);
 const optimize=createExpandedTitleOptimizer({fetchImpl:async(_,config)=>{const request=JSON.parse(config.body);return Response.json({...request,results:request.keywordGroups.map(g=>({title:g.groupName,data:[]}))});}});
 await assert.rejects(optimize(product,credentials),/검색 자료가 없어/);
});
