import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {trySmartstoreLogin,selectSmartstorePage} from '../smartstore-login.mjs';
import {SmartstoreAutomation} from '../smartstore-automation.mjs';

const home='https://sell.smartstore.naver.com/',dashboard=home+'#/home/dashboard',copy=home+'#/products/copy/12345';
const commerce='https://accounts.commerce.naver.com/login?url='+encodeURIComponent(home+'#/login-callback');
const nid='https://nid.naver.com/nidlogin.login?mode=form';
async function fixture(browser,{fail=false,captcha=false}={}){
 const context=await browser.newContext(),reports=[];context.setDefaultTimeout(4000);
 await context.exposeFunction('reportLogin',data=>reports.push(data));
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());let body;
  if(url.origin==='https://sell.smartstore.naver.com')body=url.pathname==='/home'?`<a href="${commerce}">로그인하기</a>`:'<input name="product.name" value="fixture product"><button>로그아웃</button>';
  else if(url.origin==='https://accounts.commerce.naver.com')body=`<input placeholder="아이디 또는 이메일 주소"><input type="password" placeholder="비밀번호"><button onclick="window.open('${nid}','naver-login')">네이버 아이디로<span>로그인</span></button><button id="seller-submit">로그인</button><script>document.querySelector('#seller-submit').onclick=async()=>{await window.reportLogin({type:'seller',id:document.querySelector('input').value,password:document.querySelector('input[type=password]').value});${fail?'':`location.href='${dashboard}';`}};</script>`;
  else if(url.origin==='https://nid.naver.com')body=`<input id="id"><input id="pw" type="password"><label><input id="loginStay" type="checkbox">로그인 상태 유지</label><label><input id="switchIP" type="checkbox" checked>IP 보안</label>${captcha?'<input name="captcha_code">':''}<button id="loginBtn_row">로그인</button><script>document.querySelector('button').onclick=async()=>{await window.reportLogin({type:'naver',id:document.querySelector('#id').value,password:document.querySelector('#pw').value,keep:document.querySelector('#loginStay').checked,ip:document.querySelector('#switchIP').checked});${fail?'':`window.opener.location.href='${dashboard}';window.close();`}};</script>`;
  else body='<input id="id"><input id="pw" type="password"><button>로그인</button>';
  return route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8">'+body});
 });
 return {context,reports};
}
const settings=loginType=>({load:async()=>({username:'fixture-smart-user',password:'fixture-smart-pass',revision:'one',loginType})});

test('네이버 팝업 및 판매자 로그인을 완료하고 기존 상품 화면·보안 설정을 보존한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const type of ['naver','seller']){
   const {context,reports}=await fixture(browser),page=await context.newPage(),logs=[];
   await page.goto(home+'home');const result=await trySmartstoreLogin(page,{context,store:settings(type),log:message=>logs.push(message),timeout:2000,navigationTimeout:1500});
   assert.equal(result.status,'authenticated',JSON.stringify({type,logs,urls:context.pages().map(p=>p.url())}));assert.equal(result.page,page);assert.equal(reports.length,1);assert.equal(reports[0].type,type);assert.equal(reports[0].id,'fixture-smart-user');assert.equal(reports[0].password,'fixture-smart-pass');
   if(type==='naver'){assert.equal(reports[0].keep,true);assert.equal(reports[0].ip,true);}
   assert.ok(!logs.join().includes('fixture-smart-user'));assert.ok(!logs.join().includes('fixture-smart-pass'));
   let loads=0;await page.goto(copy);assert.equal((await trySmartstoreLogin(page,{context,store:{load:async()=>{loads++;return null;}}})).status,'session');assert.equal(loads,0);
   const bot=new SmartstoreAutomation('unused-fixture-root',()=>{});bot.context=context;bot.connectChrome=async()=>{};
   await bot.preflight();assert.equal(bot.copyFormUrl,copy);
   const other=await context.newPage();await other.goto(copy.replace('12345','67890'));
   await assert.rejects(bot.bindCopyForm(),/여러 개/);
   assert.equal(await selectSmartstorePage([page,other],page),page);await context.close();
  }
 }finally{await browser.close();}
});

test('실패는 한 번만 시도하고 CAPTCHA·다른 계정·외부 로그인은 입력하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {context,reports}=await fixture(browser,{fail:true}),page=await context.newPage();await page.goto(commerce);
  assert.equal((await trySmartstoreLogin(page,{context,store:settings('seller'),timeout:1})).status,'manual');
  assert.equal((await trySmartstoreLogin(page,{context,store:settings('seller'),timeout:1})).status,'manual');assert.equal(reports.length,1);
  const outsider=await context.newPage();await outsider.goto('https://example.com/login');let loads=0;const never={load:async()=>{loads++;return null;}};
  assert.equal((await trySmartstoreLogin(outsider,{context,store:never})).status,'unrelated');
  await outsider.goto('https://accounts.commerce.naver.com/login?url=https://example.com/');assert.equal((await trySmartstoreLogin(outsider,{context,store:never})).status,'unrelated');
  await outsider.goto(nid);assert.equal((await trySmartstoreLogin(outsider,{context,store:never})).status,'unrelated');assert.equal(loads,0);
  const manual=await context.newPage();await manual.goto(commerce);await manual.getByPlaceholder('아이디 또는 이메일 주소').fill('different-user');
  assert.equal((await trySmartstoreLogin(manual,{context,store:settings('seller')})).status,'manual');assert.equal(await manual.getByPlaceholder('아이디 또는 이메일 주소').inputValue(),'different-user');assert.equal(reports.length,1);
  await context.close();
  const failedNaver=await fixture(browser,{fail:true}),naverParent=await failedNaver.context.newPage();await naverParent.goto(commerce);
  assert.equal((await trySmartstoreLogin(naverParent,{context:failedNaver.context,store:settings('naver'),timeout:1,navigationTimeout:1500})).status,'manual');
  assert.equal((await trySmartstoreLogin(naverParent,{context:failedNaver.context,store:settings('naver'),timeout:1,navigationTimeout:1500})).status,'manual');assert.equal(failedNaver.reports.length,1);assert.equal(failedNaver.context.pages().length,2);await failedNaver.context.close();
  const gated=await fixture(browser,{captcha:true}),parent=await gated.context.newPage();await parent.goto(commerce);
  assert.equal((await trySmartstoreLogin(parent,{context:gated.context,store:settings('naver'),navigationTimeout:1500})).status,'manual');assert.equal(gated.reports.length,0);
  const popup=gated.context.pages().find(p=>p!==parent);assert.equal(await popup.locator('#id').inputValue(),'');assert.equal(await popup.locator('#pw').inputValue(),'');
  assert.equal((await trySmartstoreLogin(parent,{context:gated.context,store:settings('naver'),navigationTimeout:1500})).status,'manual');assert.equal(gated.context.pages().length,2);
  await gated.context.close();
 }finally{await browser.close();}
});
