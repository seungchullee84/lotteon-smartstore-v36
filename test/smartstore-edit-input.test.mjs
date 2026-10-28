import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {SmartstoreAutomation} from '../smartstore-automation.mjs';
import {fillSmartstoreSellerCode,waitSmartstoreOptionGrid,prependSmartstoreSellerStyle} from '../smartstore-form.mjs';

for(const style of ['115928','056930','134600'])test(style+' 수정·복사등록에서 전체 입력 대상을 선택하고 수정 상품코드는 보존한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const context=await browser.newContext();
  await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><input name="product.name" value="상품"><input id="seller-code1" value="'+style+' 기존 상품코드">'}));
  for(const mode of ['edit','copy']){
   const page=await context.newPage();await page.goto('https://sell.smartstore.naver.com/#/products/'+mode+'/12345');
   const bot=new SmartstoreAutomation('unused-fixture-root',()=>{});bot.context=context;bot.connectChrome=async()=>{};
   await bot.preflight({style});assert.equal(bot.formMode,mode);assert.equal(bot.page,page);
   const before=await page.locator('#seller-code1').inputValue();const result=await fillSmartstoreSellerCode(page,{style,name:'상품',gender:'남성'});
   if(mode==='edit'){
    assert.equal(result,before);assert.equal(await page.locator('#seller-code1').inputValue(),before);
    await assert.rejects(bot.preflight({style:''}),/품번/);
    assert.equal(await page.locator('#seller-code1').inputValue(),before);
    await bot.preflight({style:'999999'});
    const changed=await fillSmartstoreSellerCode(page,{style:'999999',name:'상품',gender:'남성'});assert.equal(changed,'999999 '+before);assert.equal(await page.locator('#seller-code1').inputValue(),changed);
   }else assert(result.includes(style));
   await page.close();
  }
 }finally{await browser.close();}
});

test('수정 화면의 옵션 목록과 일괄수정 버튼이 늦게 복원되어도 갱신 완료 후 입력한다',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent(`<div role="grid" aria-rowcount="37"></div><button hidden>선택목록 일괄수정</button><script>setTimeout(()=>{document.querySelector('[role="grid"]').setAttribute('aria-rowcount','30');document.querySelector('button').hidden=false;},150);</script>`);await waitSmartstoreOptionGrid(page,28);assert.equal(await page.getByRole('button').isVisible(),true);assert.equal(await page.getByRole('grid').getAttribute('aria-rowcount'),'30');}finally{await browser.close();}
});

test('기존 판매자코드는 전체 보존하고 현재 품번만 앞에 추가하며 재실행해도 중복하지 않는다',()=>{
 const old='◆◆116523 울트라치노 신규코드';const next=prependSmartstoreSellerStyle('115928',old);assert.equal(next,'115928 '+old);assert.equal(prependSmartstoreSellerStyle('115928',next),next);assert.equal(prependSmartstoreSellerStyle('115928','다른 설명 115928'),'115928 다른 설명 115928');assert.equal(prependSmartstoreSellerStyle('115928',''),'115928');
});
