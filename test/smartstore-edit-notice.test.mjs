import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {confirmSmartstoreEditNotice,readDetailOnlySellerCode} from '../smartstore-detail-only.mjs';
test('수정 진입 안내창의 확인만 누르고 등록·저장 및 다른 확인창은 누르지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});try{const p=await browser.newPage();
 await p.setContent('<div role="dialog">판매상품이 <strong>안전기준 준수</strong> 대상 품목인 경우 안내<button onclick="window.confirmed=(window.confirmed||0)+1;this.parentElement.hidden=true">확인</button></div><input id="seller-code1" value="05326921 326922"><button onclick="window.registered=true">등록</button><button onclick="window.saved=true">저장하기</button>');
 assert.equal(await readDetailOnlySellerCode(p),'05326921 326922');assert.equal(await p.evaluate(()=>window.confirmed),1);assert.equal(await confirmSmartstoreEditNotice(p),false);assert.equal(await p.evaluate(()=>window.registered||window.saved),undefined);
 await p.setContent('<div role="dialog">상품 삭제를 확인해 주세요.<button onclick="window.wrong=true">확인</button></div>');assert.equal(await confirmSmartstoreEditNotice(p),false);assert.equal(await p.evaluate(()=>window.wrong),undefined);
 }finally{await browser.close();}
});
