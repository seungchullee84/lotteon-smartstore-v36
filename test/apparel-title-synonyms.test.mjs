import test from 'node:test';
import assert from 'node:assert/strict';
import {expandedTitleCandidates,createExpandedTitleOptimizer,composePopularTitle,hasDuplicateTitleMeaning} from '../naver-smart-title.mjs';
import {titleFeatureGroups,featureQueryForms} from '../apparel-title-synonyms.mjs';

const credentials={clientId:'test-id',clientSecret:'test-secret'};
const product=(name,style='123456')=>({style,name:'여성 '+name,rawName:name,gender:'여성',material:'면 100%',noticeVerified:true,officialDescription:'레귤러 핏으로 제작했습니다.'});
function mockOptimizer(winner,requested){
 return createExpandedTitleOptimizer({researchProvider:()=>({candidates:[],titleTerms:[]}),fetchImpl:async(_,config)=>{
  const request=JSON.parse(config.body),value=word=>word===winner?90:1;
  const max=Math.max(...request.keywordGroups.map(g=>value(g.groupName)));
  return Response.json({...request,results:request.keywordGroups.map(g=>{requested.add(g.groupName);return {title:g.groupName,data:[{period:request.endDate,ratio:value(g.groupName)/max*100}]};})});
 }});
}

test('다양한 의류 품목 동의어는 API 순위가 바뀌면 선택도 바뀐다',async()=>{
 const cases=[['맨투맨','스웨트셔츠'],['가디건','카디건'],['니트','스웨터'],['자켓','재킷'],['바지','팬츠'],['스커트','치마'],['반바지','쇼츠'],['조끼','베스트'],['바람막이','윈드브레이커'],['셔츠','남방'],['후드티','후디'],['원피스','드레스'],['청바지','데님팬츠']];
 for(const [i,pair] of cases.entries())for(const winner of pair){
  const p=product(pair[0],String(300000+i)),before=structuredClone(p),requested=new Set();
  const result=await mockOptimizer('여성'+winner,requested)(p,credentials);
  for(const alias of pair)assert(requested.has('여성'+alias),alias);
  assert(result.title.split(' ').includes(winner),JSON.stringify({pair,winner,title:result.title}));
  assert(result.length>=27&&result.length<=39);assert(!hasDuplicateTitleMeaning(p,result.title));assert.deepEqual(p,before);
 }
});

test('가공·짜임·소매·네크라인·소재 동의어도 공통 API 비교를 사용한다',async()=>{
 const cases=[['플리스','후리스','자켓'],['기모','브러시드','맨투맨'],['케이블','꽈배기','니트'],['골지','리브드','니트'],['프렌치테리','쭈리','맨투맨'],['스트라이프','단가라','티셔츠'],['퀼팅','누빔','자켓'],['코듀로이','골덴','바지'],['긴팔','롱슬리브','티셔츠'],['반팔','반소매','티셔츠'],['민소매','슬리브리스','티셔츠'],['라운드넥','크루넥','티셔츠'],['브이넥','V넥','니트'],['터틀넥','목폴라','니트'],['모크넥','반목','니트'],['린넨','리넨','셔츠'],['스판','스트레치','바지'],['반집업','하프집업','니트']];
 for(const [i,[a,b,kind]] of cases.entries())for(const winner of [a,b]){
  const p=product(a+' '+kind,String(400000+i)),requested=new Set();
  const query='여성'+featureQueryForms(winner)[0]+kind;
  const result=await mockOptimizer(query,requested)(p,credentials);
  for(const alias of [a,b])assert(requested.has('여성'+featureQueryForms(alias)[0]+kind),alias);
  assert(result.title.split(' ').includes(winner),JSON.stringify({a,b,winner,title:result.title}));
  assert(result.length>=27&&result.length<=39);assert(!hasDuplicateTitleMeaning(p,result.title));
 }
});

test('후보가 많아도 상품에서 확인된 동의어 비교 쌍을 중간에서 자르지 않는다',()=>{
 const raw='폴로 풀집업 플리스 기모 긴팔 케이블 골지 프렌치테리 스트라이프 퀼팅 코듀로이 라운드넥 린넨 스판 숏 자켓';
 const p=product(raw),candidates=expandedTitleCandidates(p);
 assert(candidates.length>49);
 for(const group of titleFeatureGroups(raw,p).filter(g=>g.variants.length>1))for(const variant of group.variants)for(const form of featureQueryForms(variant))assert(candidates.includes('여성'+form+'자켓'),variant);
});

test('326903은 성별·소재를 붙인 API 지수도 품목 선택에 반영하고 혼합 무늬를 제외한다',()=>{
 const p={...product('퍼펙트 긴팔 티셔츠','326903'),officialDescription:'퍼펙트 여성 크루넥 긴팔 티셔츠입니다. 솔리드와 스트라이프를 포함한 총 17가지 컬러 구성입니다.'};
 const ranking=[{keyword:'코튼티셔츠',score:1.658},{keyword:'여성티셔츠',score:1},{keyword:'긴팔티셔츠',score:.837},{keyword:'티',score:.773},{keyword:'라운드티셔츠',score:.209},{keyword:'크루넥티셔츠',score:.008}];
 const r=composePopularTitle(p,ranking);
 assert(r.title.includes('코튼100%'));assert(r.title.includes('티셔츠'));assert(!r.title.split(' ').includes('티'));assert(r.selectedTerms.includes('코튼티셔츠'));assert(!r.selectedTerms.includes('티'));
 assert(!expandedTitleCandidates(p).some(word=>/스트라이프|단가라|줄무늬/.test(word)));
 assert(r.length>=27&&r.length<=39);
});

test('다른 품목·반대 의미와 미확인 특성을 동의어로 바꾸지 않는다',()=>{
 const p=product('정장 셔츠');
 assert(!expandedTitleCandidates(p).some(word=>/남방|기모|반팔|슬림핏/.test(word)));
 const plain=product('티셔츠');
 assert(!expandedTitleCandidates(plain).some(word=>/민소매|슬리브리스|목폴라|누빔|퀼팅/.test(word)));
});

test('면·코튼은 각 상품과 품목의 API 순위에 따라 자동 선택하고 면100% 사실을 보존한다',async()=>{
 for(const [i,kind] of ['티셔츠','맨투맨','니트','슬랙스'].entries())for(const winner of ['면','코튼']){
  const p=product('레귤러핏 '+kind,String(510000+i)),before=structuredClone(p),requested=new Set();
  const result=await mockOptimizer('여성'+winner+kind,requested)(p,credentials);
  for(const alias of ['면','코튼'])assert(requested.has('여성'+alias+kind),kind+' '+alias);
  assert(result.title.split(' ').includes(winner+'100%'),result.title);
  assert(!result.title.split(' ').includes((winner==='면'?'코튼':'면')+'100%'));
  assert(result.length>=27&&result.length<=39);assert.deepEqual(p,before);
 }
});

test('코튼 표기·전각 문자도 검증 소재를 보존하며 혼방과 미확인 소재를 면100%로 바꾸지 않는다',()=>{
 const p=product('레귤러핏 티셔츠');
 for(const material of ['면 100%','코튼 100%','COTTON 100%','면 １００％']){
  const cotton=titleFeatureGroups('',{...p,material}).find(g=>g.id==='cotton');
  assert.deepEqual(cotton.variants,['면100%','코튼100%']);
 }
 for(const material of ['면 60%, 폴리에스터 40%','코튼 60%, 폴리에스터 40%']){
  const cotton=titleFeatureGroups('',{...p,material}).find(g=>g.id==='cotton');
  assert.deepEqual(cotton.variants,['면','코튼']);
 }
 assert(!titleFeatureGroups('',{...p,noticeVerified:false}).some(g=>g.id==='cotton'));
 assert(!titleFeatureGroups('',{...p,material:'폴리에스터 100%'}).some(g=>g.id==='cotton'));
});
