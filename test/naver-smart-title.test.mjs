import test from 'node:test';
import assert from 'node:assert/strict';
import {expandedTitleCandidates,composePopularTitle,createExpandedTitleOptimizer,hasDuplicateTitleMeaning} from '../naver-smart-title.mjs';
import {assertSmartstoreTitleLength,smartstoreTitle} from '../smartstore-title.mjs';
const product={style:'376922',name:'여성 후드 숏 푸퍼 자켓 376922',rawName:'NEW [문가영] CLOUD LIGHT 후드 숏 푸퍼 자켓',gender:'여성'};
const credentials={clientId:'dummy-id',clientSecret:'dummy-secret'};
test('울 폴로 풀 집 자켓의 글자 수보다 관심도 높은 동의어를 우선하고 남성 표기를 보존',()=>{
 const p={style:'076913',name:'남성 울 폴로 풀 집 자켓 076913',rawName:'NEW [변우석] 울 폴로 풀 집 자켓',gender:'남성',material:'캐시미어 5%',fieldStatus:{material:'원본 확인 필요'}};
 const before=structuredClone(p),candidates=expandedTitleCandidates(p);
 for(const keyword of ['울자켓','카라자켓','폴로카라자켓','집업자켓','풀집업자켓'])assert(candidates.includes(keyword),keyword);
 assert(!candidates.some(k=>/캐시미어|겨울|기모|오버핏/.test(k)));
 const ranking=[{keyword:'자켓',score:10},{keyword:'남자자켓',score:2},{keyword:'울자켓',score:1},{keyword:'카라자켓',score:0.3},{keyword:'집업자켓',score:0.4},{keyword:'풀집업자켓',score:0.01},{keyword:'남성용자켓',score:0.02}];
 const result=composePopularTitle(p,ranking);
 assert.equal(result.title,'지오다노 남성 울 카라 집업 자켓 076913');assert(result.length<27);assert.doesNotMatch(result.title,/남성용|남자|풀집업/);
 assert.equal(smartstoreTitle({...p,smartstoreName:result.title}),result.title);
 assert(!hasDuplicateTitleMeaning(p,result.title));assert.deepEqual(p,before);
 assert.equal(composePopularTitle(p,ranking.filter(e=>!['풀집업자켓','남성용자켓'].includes(e.keyword))).title,result.title,'낮은 관심도의 긴 표현이 없어도 결과 유지');
});
test('핏·짜임·플리스 후보도 원문 근거가 있을 때만 확장',()=>{
 const p={style:'123456',gender:'여성',name:'여성 케이블 레귤러핏 니트 123456',rawName:'여성 케이블 레귤러핏 니트'};
 const candidates=expandedTitleCandidates(p);
 for(const keyword of ['케이블니트','꽈배기니트','레귤러핏니트'])assert(candidates.includes(keyword));
 assert(!candidates.some(k=>/플리스|캐시미어|슬림핏|기모/.test(k)));
 const f=expandedTitleCandidates({...p,name:'여성 플리스 집업 자켓 123456',rawName:'플리스 집업 자켓'});
 assert(f.includes('후리스자켓'));assert(f.includes('집업자켓'));assert(!f.includes('풀집업자켓'));
});
test('미검증 수식어로 채우지 않고 의류 문맥 검색지수와 검증 소재만 반영',()=>{
 const p={style:'026952',name:'남성 퍼펙트 라운드 긴팔티 026952',rawName:'NEW 퍼펙트 크루넥 긴팔티',gender:'남성',material:'면 100%',noticeVerified:true};
 const before=structuredClone(p);
 const ranking=[{keyword:'티셔츠',score:10},{keyword:'크루넥',score:20},{keyword:'라운드티셔츠',score:3},{keyword:'크루넥티셔츠',score:1},{keyword:'면티셔츠',score:2}];
 const r=composePopularTitle(p,ranking);
 assert.match(r.title,/라운드넥/);assert.match(r.title,/긴팔 티셔츠/);assert.match(r.title,/면100%/);
 assert.doesNotMatch(r.title,/퍼펙트|크루넥|NEW/);assert.deepEqual(r.sourceTerms,[]);assert.deepEqual(p,before);
 assert.doesNotMatch(composePopularTitle({...p,noticeVerified:false},ranking).title,/면100%/);
 assert.doesNotMatch(composePopularTitle({...p,rawName:'퍼펙트 CLOUD LIGHT',name:'남성 티셔츠 026952'},[]).title,/퍼펙트|CLOUD|LIGHT/);
 const candidates=expandedTitleCandidates(p);assert(candidates.includes('크루넥티셔츠'));assert(candidates.includes('라운드티셔츠'));assert(!candidates.some(k=>k.includes('퍼펙트')));
});
test('동의어·실제 특성 조합을 확장하고 없는 롱·경량·반대 성별은 제외',()=>{
 const candidates=expandedTitleCandidates(product);
 assert(candidates.length>5);assert(candidates.includes('숏패딩'));assert(candidates.includes('푸퍼'));assert(candidates.includes('여성후드패딩'));
 assert(!candidates.some(k=>/남성|남자|경량|롱/.test(k)));
});
test('공통 기준으로 관심도를 비교하고 최대 39자·품번·롯데ON 원문을 보존',async()=>{
 const values={패딩:100,여성패딩:25,여자패딩:12,아우터:23,숏패딩:18,후드패딩:2,푸퍼:1};
 let calls=0;const requests=[];
 const optimize=createExpandedTitleOptimizer({fetchImpl:async(url,config)=>{
  calls++;assert.match(url,/naverapihub/);assert.equal(config.headers['X-NCP-APIGW-API-KEY-ID'],credentials.clientId);
  const request=JSON.parse(config.body);requests.push(request);assert(request.keywordGroups.length<=5);
  const max=Math.max(...request.keywordGroups.map(g=>values[g.groupName]||0.1));
  return Response.json({...request,results:request.keywordGroups.map(g=>({title:g.groupName,data:[{period:request.endDate,ratio:(values[g.groupName]||0.1)/max*100}]}))});
 }});
 const before=structuredClone(product),r=await optimize(product,credentials);
 assert(calls>1);assert(r.length>0&&r.length<=39);assert(r.title.endsWith('376922'));assert(r.title.includes('후드'));assert(r.title.includes('숏'));assert(!r.title.includes('CLOUD LIGHT'));assert(r.title.includes('점퍼'));assert.equal((r.title.match(/패딩/g)||[]).length,1);assert(!r.title.includes('아우터'));assert(!hasDuplicateTitleMeaning(product,r.title));
 assert(r.selectedTerms.includes('여성패딩'));assert(!r.title.includes('롱'));assert.deepEqual(product,before);
 assert.equal(smartstoreTitle({...product,smartstoreName:r.title}),r.title,'실제 입력 시 인기어와 길이를 그대로 보존');
 const prior=calls,r2=await optimize({...product,style:'000000'},credentials);assert.equal(calls,prior);assert(r2.title.endsWith('000000'));assert(r2.fromCache);
});
test('27자 미만도 허용하고 39자 초과를 차단하며 길이 맞춤용 특성을 발명하지 않음',()=>{
 assert.equal(assertSmartstoreTitleLength('가'.repeat(26)).length,26);
 assert.throws(()=>assertSmartstoreTitleLength('가'.repeat(40)),/최대 39/);
 assert.equal(assertSmartstoreTitleLength('가'.repeat(27)).length,27);
 assert.equal(assertSmartstoreTitleLength('가'.repeat(39)).length,39);
 assert.equal(composePopularTitle({...product,name:'여성 패딩',rawName:''},[]).title,'지오다노 여성 패딩 376922');
});
test('띄어쓰기와 합성어 안의 성별·의류 중복도 검출하며 동의어를 추가하지 않음',()=>{
 for(const title of ['지오다노 여성 패딩 여성패딩 376922','지오다노 여성 후드 패딩 후드패딩 376922','지오다노 여성 패딩 점퍼 아우터 376922','지오다노 여성 패딩 푸퍼 376922'])assert(hasDuplicateTitleMeaning(product,title),title);
 assert(!hasDuplicateTitleMeaning(product,'지오다노 여성 점퍼 숏기장 후드 패딩 376922'));
 const r=composePopularTitle(product,[{keyword:'여성패딩',score:1},{keyword:'아우터',score:1000},{keyword:'후드패딩',score:2000}]);
 assert(!hasDuplicateTitleMeaning(product,r.title));assert(!r.title.includes('아우터'));assert(!r.title.includes('문가영'));assert(!r.title.includes('NEW'));
});
test('점퍼와 패딩점퍼는 금지어가 아니며 관심도가 높으면 하나의 의류 표현으로 선택',()=>{
 assert(expandedTitleCandidates(product).includes('점퍼'));
 for(const keyword of ['점퍼','패딩점퍼']){
  const r=composePopularTitle(product,[{keyword,score:100},{keyword:'패딩',score:1}]);
  assert(r.title.includes('점퍼'));assert(r.title.includes('패딩'));assert(!hasDuplicateTitleMeaning(product,r.title));assert(r.length>0&&r.length<=39);
 }
 assert(!expandedTitleCandidates({...product,name:'여성 패딩 조끼',rawName:'여성 패딩 베스트'}).includes('점퍼'));
});
test('API 실패와 검색 자료 없음은 인기어를 꾸며내지 않고 오류 반환',async()=>{
 await assert.rejects(createExpandedTitleOptimizer({fetchImpl:async()=>new Response('',{status:401})})(product,credentials),/인증 실패/);
 const optimize=createExpandedTitleOptimizer({fetchImpl:async(_,config)=>{const request=JSON.parse(config.body);return Response.json({...request,results:request.keywordGroups.map(g=>({title:g.groupName,data:[]}))});}});
 await assert.rejects(optimize(product,credentials),/검색 자료가 없어/);
});
