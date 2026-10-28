import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {SmartstoreAutomation} from '../smartstore-automation.mjs';
import {fillSmartstoreSellerCode} from '../smartstore-form.mjs';

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
    const changed=await fillSmartstoreSellerCode(page,{style:'999999',name:'상품',gender:'남성'});assert(changed.includes('999999'));assert.equal(await page.locator('#seller-code1').inputValue(),changed);
   }else assert(result.includes(style));
   await page.close();
  }
 }finally{await browser.close();}
});
