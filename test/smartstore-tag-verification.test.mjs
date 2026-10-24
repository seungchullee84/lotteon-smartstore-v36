import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openTagVerification} from '../smartstore-learned.mjs';

test('tag check closes a delayed autocomplete and avoids fixed header and footer interception',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:900,height:700}});page.setDefaultTimeout(2500);
  await page.setContent(`<style>body{height:3000px;margin:0}header,footer{position:fixed;left:0;right:0;background:#ccc;z-index:20}header{top:0;height:170px}footer{bottom:0;height:190px}.section{position:relative;top:1000px;padding:15px}input{display:block}#menu{position:absolute;top:40px;width:650px;height:400px;background:#afa;z-index:10}a{display:block;margin-top:150px;width:250px;height:30px}</style><header>고정 메뉴</header><div class=section><input placeholder="태그를 입력해주세요." value="남성패딩"><div id=menu>자동완성 후보</div><a onclick="window.verified=(window.verified||0)+1">검색에 적용되는 태그 확인</a><input placeholder="Page Title"></div><footer>고정 저장 메뉴</footer><script>const f=document.querySelector('input'),m=document.querySelector('#menu');f.addEventListener('keydown',e=>{if(e.key==='Escape')m.hidden=true;if(e.key==='End')setTimeout(()=>{if(document.activeElement===f)m.hidden=false},30)});f.addEventListener('blur',()=>m.hidden=true);</script>`);
  const field=page.getByPlaceholder('태그를 입력해주세요.');await field.focus();
  await openTagVerification(page,field);
  assert.equal(await page.evaluate(()=>window.verified),1);
  assert.equal(await field.inputValue(),'');assert.equal(await page.locator('#menu').isVisible(),false);
  const bounds=await page.getByText('검색에 적용되는 태그 확인',{exact:true}).boundingBox();assert.ok(bounds.y>170&&bounds.y+bounds.height<510);
 }finally{await browser.close();}
});
