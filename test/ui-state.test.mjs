import test from 'node:test';
import assert from 'node:assert/strict';
import {benefitResearchView} from '../ui-state.mjs';
import '../public/website-daily.js';
test('동일 공식 상품의 실제 저장 상태만 오늘 누적에 연결한다',()=>{
 const event={type:'new',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=ABC'},item={sourceUrl:event.sourceUrl,status:'complete',folder:'C:/research/ABC',finishedAt:'2026-11-03T13:00:00Z',pointCount:3};
 assert.match(folderResearchStatus(event,{items:[item]}).label,/폴더 저장 완료/);
 assert.equal(folderResearchStatus(event,{items:[item]}).folder,item.folder);
 for(const status of ['queued','running','failed']){const result=folderResearchStatus(event,{items:[{...item,status}]});assert.equal(result.folder,null);assert.doesNotMatch(result.label,/저장 완료/);}
 assert.match(folderResearchStatus(event,{items:[{...item,status:'needs-review',pointCount:2}]}).label,/추가 확인 필요/);
 assert.equal(folderResearchStatus({...event,sourceUrl:event.sourceUrl+'different'},{items:[item]}).folder,undefined);
});
test('신상품 누적과 폴더 조사 대기는 별도로 표시한다',()=>{
 const input={message:'홈페이지 신상품 목록 25분 간격 확인 · 소구점은 품번별 요청 시 조사',website:{batches:[]},folderResearch:{message:'신상품 폴더 조사 대기 · D드라이브 연결 필요'}};
 const view=benefitResearchView(input);assert.match(view.message,/D드라이브 연결 필요/);assert.doesNotMatch(view.message,/품번별 요청/);assert.deepEqual(view.website.batches,[]);
});

test('화면 상태에서 비교용 상품 해시만 제외하고 최근 3일 누적 기록은 그대로 유지한다',()=>{
 const research={imageComplete:1284,website:{checkedAt:'2026-10-28T07:00:00Z',products:{abc:{detailHash:'x'.repeat(64)}},batches:[{checkedAt:'2026-10-28T07:00:00Z',events:[{type:'new',style:'123456',name:'테스트',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=abc'}]}]}};
 const view=benefitResearchView(research);
 assert.equal(view.website.products,undefined);assert.equal(research.website.products.abc.detailHash.length,64);
 assert.deepEqual(view.website.batches,research.website.batches);
 assert.deepEqual(globalThis.websiteDailySummary(view.website,new Date('2026-10-28T08:00:00Z')),globalThis.websiteDailySummary(research.website,new Date('2026-10-28T08:00:00Z')));
});
