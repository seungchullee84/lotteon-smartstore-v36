import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ensureSmartstoreOptionMode} from '../smartstore-form.mjs';

test('hidden styled radios do not cause an already open option panel to close on repeated runs',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(2000);
  await page.setContent(`<ui-view name="option"><button onclick="const p=document.querySelector('#panel');p.hidden=!p.hidden;window.toggles=(window.toggles||0)+1">옵션 도움말</button><section id=panel><input id=option_choice_type_true type=radio checked style="display:none"><label for=option_choice_type_true>설정함</label><label><input type=radio name=mode checked>직접 입력하기</label><label><input type=radio name=type checked>조합형</label></section></ui-view>`);
  assert.equal(await page.locator('#option_choice_type_true').isVisible(),false);
  await ensureSmartstoreOptionMode(page);await ensureSmartstoreOptionMode(page);
  assert.equal(await page.evaluate(()=>window.toggles||0),0);assert.equal(await page.locator('#panel').isVisible(),true);
  await page.getByRole('button',{name:'옵션 도움말'}).click();
  await ensureSmartstoreOptionMode(page);assert.equal(await page.locator('#panel').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.toggles),2);
 }finally{await browser.close();}
});
