import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditItemscoutKeywords,eligibleItemscoutKeywords,itemscoutProductPath} from '../itemscout-categories.mjs';
import {createKeywordOptimizer} from '../naver-keywords.mjs';
test('조사 자료 411행·320키워드 및 출처·미확인 항목 보존',()=>{
 const {rows}=JSON.parse(readFileSync(new URL('../data/category-itemscout-verified.json',import.meta.url)));
 assert.equal(rows.length,411);assert.equal(new Set(rows.map(r=>r.keyword)).size,320);
 for(const row of rows){assert.match(row.source,/^https:\/\/itemscout.io\/keyword\//);assert(row.unknown);assert(Number(row.category_percent)<=100);}
});
test('같은 성별·종류·100%만 검증하고 분산·다른 종류·미조사를 구분',()=>{
 const p={gender:'남성',name:'남성 기모 팬츠'};
 const audit=auditItemscoutKeywords(p,['기모바지','바지','청바지','여성바지','남성 등산바지','자료없는키워드']);
 assert.deepEqual(audit.entries.map(e=>e.status),['verified','excluded','excluded','excluded','excluded','unverified']);
 assert.deepEqual(eligibleItemscoutKeywords(audit),['기모바지','자료없는키워드']);
 assert.equal(audit.entries[0].rows[0].monthly_searches,'6970');
 assert.equal(auditItemscoutKeywords({gender:'남성',name:'남성 니트'},['니트']).entries[0].status,'excluded');
 assert.equal(auditItemscoutKeywords({gender:'여성',name:'여성 니트'},['니트']).entries[0].status,'verified');
});
test('트레이닝·청바지·베스트·셔츠를 다른 경로로 구분하고 성별 불명은 검토',()=>{
 for(const [name,leaf] of [['데님 팬츠','청바지'],['트레이닝 바지','트레이닝복'],['니트 베스트','아우터 > 베스트'],['버튼다운 셔츠','셔츠/남방'],['트리코트 팬츠','바지']])assert.equal(itemscoutProductPath({gender:'남성',name}),'패션의류 > 남성의류 > '+leaf);
 assert.equal(auditItemscoutKeywords({name:'니트'},['니트']).entries[0].status,'product-review');
});
test('실제 최적화 API 요청과 결과에서 불일치 키워드를 제외, 절대 검색수와 추이지수 분리',async()=>{
 const requested=[];
 const optimize=createKeywordOptimizer({candidateFactory:()=>['바지','기모바지','여성바지'],fetchImpl:async(_,config)=>{
  const req=JSON.parse(config.body);requested.push(...req.keywordGroups.map(g=>g.groupName));
  return Response.json({...req,results:req.keywordGroups.map(g=>({title:g.groupName,data:[{period:req.endDate,ratio:10}]}))});
 }});
 const p={name:'남성 기모 팬츠',gender:'남성',category:{channelSmall:'기모팬츠'}},before=structuredClone(p);
 const result=await optimize(p,{clientId:'dummy',clientSecret:'dummy'});
 assert.deepEqual(requested,['기모바지']);assert.equal(result.keywords,'지오다노,기모바지');assert.equal(result.ranking[0].score,1);
 assert.equal(result.categoryAudit.entries[1].status,'verified');assert.deepEqual(p,before);
});
