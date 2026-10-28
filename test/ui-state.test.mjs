import test from 'node:test';
import assert from 'node:assert/strict';
import {benefitResearchView} from '../ui-state.mjs';
import '../public/website-daily.js';

test('화면 상태에서 비교용 상품 해시만 제외하고 최근 3일 누적 기록은 그대로 유지한다',()=>{
 const research={imageComplete:1284,website:{checkedAt:'2026-10-28T07:00:00Z',products:{abc:{detailHash:'x'.repeat(64)}},batches:[{checkedAt:'2026-10-28T07:00:00Z',events:[{type:'new',style:'123456',name:'테스트',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=abc'}]}]}};
 const view=benefitResearchView(research);
 assert.equal(view.website.products,undefined);assert.equal(research.website.products.abc.detailHash.length,64);
 assert.deepEqual(view.website.batches,research.website.batches);
 assert.deepEqual(globalThis.websiteDailySummary(view.website,new Date('2026-10-28T08:00:00Z')),globalThis.websiteDailySummary(research.website,new Date('2026-10-28T08:00:00Z')));
});
