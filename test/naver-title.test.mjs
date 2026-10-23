import test from 'node:test';
import assert from 'node:assert/strict';
import {smartstoreTitle} from '../smartstore-title.mjs';
import {smartstorePlan} from '../smartstore-form.mjs';
import {titleCandidates,trendPeriod,createNaverTitleOptimizer,NAVER_TREND_URL} from '../naver-title.mjs';
import {requireChannel} from '../channel-routing.mjs';
const product={style:'356956',name:'남성 아가일 브이넥 니트 356956',gender:'남성',rawName:'미검토 원본명',keywords:'지오다노,남성니트',country:'베트남',material:'면 100%',washing:'손세탁',manufactured:'2026-08',consumerPrice:59800,colors:['01블랙'],sizes:['M'],images:{detail:'https://www.giordano.co.kr/detail.jpg'}};
const credentials={clientId:'test-client-id',clientSecret:'test-client-secret'};
const now=()=>new Date('2026-10-22T16:00:00Z');
function fakePayload(request,{empty=false,ratios={}}={}){
 return {...request,results:request.keywordGroups.map(g=>({title:g.groupName,keywords:g.keywords,data:empty?[]:[{period:request.endDate,ratio:ratios[g.groupName]??10}]}))};
}
function fixture(options={}){
 let calls=0,lastRequest;
 const optimize=createNaverTitleOptimizer({clock:now,fetchImpl:async(url,config)=>{
  calls++;assert.equal(url,NAVER_TREND_URL);assert.equal(config.headers['X-Naver-Client-Id'],credentials.clientId);assert.equal(config.headers['X-Naver-Client-Secret'],credentials.clientSecret);assert.equal(config.redirect,'error');
  lastRequest=JSON.parse(config.body);return Response.json(fakePayload(lastRequest,options));
 }});
 return {optimize,get calls(){return calls;},get request(){return lastRequest;}};
}
test('스마트스토어 전용 상품명은 브랜드·성별·단어·품번을 중복하지 않고 수치와 전문용어 보존',()=>{
 const p={...product,smartstoreName:'GIORDANO 지오다노 남자 남성 아가일 니트 스웨터 356956 울 100% 7GG [무료배송]'};
 assert.equal(smartstoreTitle(p),'지오다노 남자 아가일 니트 울 100% 7GG 356956');
 assert.equal(smartstoreTitle({...p,smartstoreName:smartstoreTitle(p)}),smartstoreTitle(p));
 assert.equal(smartstoreTitle({...product,gender:'여성',smartstoreName:'여성 니트'}).includes('여성'),true);
});
test('성별 충돌·내용 없는 상품명·100자 초과는 잘라내지 않고 확인 요청',()=>{
 for(const smartstoreName of ['여성 니트','남성 여성 니트','지오다노 남성 356956','긴팔'.repeat(60)])assert.throws(()=>smartstoreTitle({...product,smartstoreName}));
 assert.equal(smartstoreTitle({...product,smartstoreName:'가'.repeat(85)}).length,100);
});
test('스마트스토어 이름과 API 제안이 롯데ON 상품명·35자 키워드를 변경하지 않음',async()=>{
 const p=structuredClone(product),before=structuredClone(p);
 const plan=smartstorePlan({...p,smartstoreName:'남자 브이넥 아가일 니트'},54800);
 assert.equal(plan.name,'지오다노 남자 브이넥 아가일 니트 356956');
 assert.equal(plan.keywords,false);assert.equal(plan.save,false);assert.deepEqual(p,before);
 await fixture().optimize(p,credentials);assert.deepEqual(p,before);
});
test('한국 날짜의 어제까지 28일 조회하고 연도 경계도 처리',()=>{
 assert.deepEqual(trendPeriod(now()),{startDate:'2026-09-25',endDate:'2026-10-22',timeUnit:'date'});
 assert.deepEqual(trendPeriod(new Date('2026-01-01T01:00:00Z')),{startDate:'2025-12-04',endDate:'2025-12-31',timeUnit:'date'});
});
test('상품 특성만 최대 5개 후보로 만들고 원피스·스커트 등 다른 의류도 관련 품목 유지',()=>{
 const cases=[['아가일 브이넥 니트','남성니트'],['후드 경량 패딩','남성패딩'],['데님 셔츠','남성셔츠'],['체크 셔츠 원피스','남성원피스'],['니트 스커트','남성스커트'],['밴딩 반바지','남성반바지'],['버튼 다운 셔츠','남성셔츠'],['트리코트 자켓','남성자켓']];
 for(const [name,expected] of cases){const {candidates}=titleCandidates({...product,name});assert.equal(candidates[0].keyword,expected);assert.ok(candidates.length<=5);}
 assert.deepEqual(titleCandidates({...product,name:'니트'}).candidates.map(c=>c.keyword),['남성니트','남자니트']);
 assert.throws(()=>titleCandidates({...product,name:'상품'}));
});
test('실제 API 요청 형식으로 조회하고 같은 요청 안의 상대지수로 성별 표현·기존 특성 순서만 제안',async()=>{
 const api=fixture({ratios:{남성니트:20,남자니트:80,브이넥니트:100,아가일니트:30}}),r=await api.optimize(product,credentials);
 assert.equal(api.calls,1);assert.equal(api.request.keywordGroups.length,4);assert.equal(api.request.gender,undefined);
 assert.equal(r.title,'지오다노 남자 브이넥 아가일 니트 356956');assert.equal(r.metric,'검색 상대지수');assert.equal(r.comparedDays,1);assert.equal(r.featureComparedDays,1);
 assert.match(r.note,/월간 검색횟수·판매량·전체 키워드 순위가 아닙니다/);
 assert.ok(!JSON.stringify(r).includes(credentials.clientId));assert.ok(!JSON.stringify(r).includes(credentials.clientSecret));
 assert.equal(smartstorePlan({...product,smartstoreName:r.title},54800).name,r.title);
});
test('같은 후보는 한 시간 캐시하되 상품명·품번은 현재 입력에서 생성',async()=>{
 const api=fixture();await api.optimize(product,credentials);
 const r=await api.optimize({...product,style:'000000',name:'남성 브이넥 아가일 니트 000000'},credentials);
 assert.equal(api.calls,1);assert.equal(r.fromCache,true);assert.match(r.title,/000000$/);
});
test('API 자료 없음은 0·예상 검색량으로 바꾸지 않고 정리된 기존 상품명 유지',async()=>{
 const r=await fixture({empty:true}).optimize(product,credentials);
 assert.equal(r.hasData,false);assert.equal(r.title,smartstoreTitle(product));assert.ok(r.candidates.every(c=>c.mean===null&&c.pointCount===0));
});
test('공통 날짜가 없는 성별 표현은 평균의 크기만 보고 교체하지 않음',async()=>{
 const optimize=createNaverTitleOptimizer({clock:now,fetchImpl:async(_,config)=>{
  const request=JSON.parse(config.body),payload=fakePayload(request);
  payload.results[0].data=[{period:request.startDate,ratio:1}];payload.results[1].data=[{period:request.endDate,ratio:100}];return Response.json(payload);
 }});
 const r=await optimize(product,credentials);assert.equal(r.comparedDays,0);assert.match(r.title,/^지오다노 남성 /);
});
test('인증·권한·한도·통신 실패는 가짜 제안 없이 오류 반환하고 인증값을 노출하지 않음',async()=>{
 for(const status of [401,403,429,500]){
  const optimize=createNaverTitleOptimizer({clock:now,fetchImpl:async()=>new Response(credentials.clientSecret,{status})});
  await assert.rejects(()=>optimize(product,credentials),e=>!e.message.includes(credentials.clientSecret));
 }
 const optimize=createNaverTitleOptimizer({clock:now,fetchImpl:async()=>{throw Error(credentials.clientSecret);}});
 await assert.rejects(()=>optimize(product,credentials),/연결하지 못했습니다/);
 await assert.rejects(()=>optimize(product,{}),/Client ID/);
});
test('API 응답 기간·그룹·지수 이상은 사용하지 않음',async()=>{
 for(const change of [p=>p.endDate='2026-01-01',p=>p.results.pop(),p=>p.results[0].data[0].ratio=101,p=>p.results[0].data.push(p.results[0].data[0])]){
  const optimize=createNaverTitleOptimizer({clock:now,fetchImpl:async(_,config)=>{const p=fakePayload(JSON.parse(config.body));change(p);return Response.json(p);}});
  await assert.rejects(()=>optimize(product,credentials));
 }
});
test('네이버 조회와 설정 경로는 롯데ON 채널에서 호출 불가',()=>{
 for(const endpoint of ['smartstore-optimize-title','naver-settings']){assert.equal(requireChannel(endpoint,'smartstore'),'smartstore');assert.throws(()=>requireChannel(endpoint,'lotte'));}
});
