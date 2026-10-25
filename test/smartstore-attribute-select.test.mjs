import test from 'node:test';import assert from 'node:assert/strict';import{chromium}from'playwright';import{selectLearnedAttribute}from'../smartstore-learned.mjs';
for(const portal of [false,true])for(const open of [false,true])test(`속성 목록 ${portal?'외부 배치':'행 내부'}·${open?'이미 열림':'닫힘'}에서도 긴팔 선택`,async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();
 const dropdown=`<div class="selectize-dropdown-content" id="options" ${open?'':'hidden'}><div data-selectable data-value="long" onclick="document.querySelector('.item').textContent='긴팔';document.querySelector('.selectize-input').classList.remove('dropdown-active');this.parentElement.hidden=true">  긴팔  </div></div>`;
 await page.setContent(`<table aria-label="상품속성 선택 테이블"><tr><th>소매기장</th><td><div class="selectize-input ${open?'dropdown-active':''}" tabindex="0" onclick="const d=document.getElementById('options');d.hidden=!d.hidden;this.classList.toggle('dropdown-active',!d.hidden);window.toggles=(window.toggles||0)+1"><span class="item">반팔</span><input></div>${portal?'':dropdown}</td></tr></table>${portal?dropdown:''}`);
 const row=page.getByRole('table',{name:'상품속성 선택 테이블'}).getByRole('row');
 await selectLearnedAttribute(page,row,'소매기장','긴팔');assert.equal(await page.locator('.item').innerText(),'긴팔');assert.equal(await page.evaluate(()=>window.toggles||0),open?0:1);
 await selectLearnedAttribute(page,row,'소매기장','긴팔');assert.equal(await page.evaluate(()=>window.toggles||0),open?0:1,'동일 값은 다시 열지 않음');
 }finally{await browser.close();}
});
