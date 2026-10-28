import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {createBrowserLoginStore} from '../browser-login-store.mjs';
import {tryLotteLogin,selectLottePage} from '../browser-login.mjs';
import {publishable} from '../github-sync.mjs';

test('계정은 Windows 사용자 암호화로만 저장하고 상태 응답·공유에서 제외한다',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'registrar-login-')),store=createBrowserLoginStore(root),username='fixture-user-한글',password='fixture-pass-!한글';
 try{
  assert.equal((await store.status()).configured,false);
  await assert.rejects(store.update({action:'save',enabled:true,username}),/모두/);
  const status=await store.update({action:'save',enabled:true,username,password});
  assert.equal(status.enabled,true);assert.ok(!JSON.stringify(status).includes(password));assert.ok(!JSON.stringify(status).includes(username));
  const file=await readFile(path.join(root,'browser-login-settings.json'),'utf8');assert.ok(!file.includes(username));assert.ok(!file.includes(password));
  const loaded=await createBrowserLoginStore(root).load();assert.equal(loaded.username,username);assert.equal(loaded.password,password);
  await store.update({action:'save',enabled:false});assert.equal(await store.load(),null);
  await store.update({action:'save',enabled:true});assert.equal((await store.load()).password,password);
  assert.equal(publishable('data/browser-login-settings.json'),false);assert.equal(publishable('browser-login-store.mjs'),true);
  const saved=JSON.parse(file);saved.encryptedLogin='invalid';await writeFile(path.join(root,'browser-login-settings.json'),JSON.stringify(saved));
  await assert.rejects(store.load(),error=>!error.message.includes(username)&&!error.message.includes(password));
  await store.update({action:'delete'});assert.deepEqual(await store.status(),{supported:true,configured:false,enabled:false,accountHint:''});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('공식 로그인 화면에서만 한 번 입력하고 성공·실패·수동 인증을 구분한다',async()=>{
 const browser=await chromium.launch({headless:true});
 const form=`<input id="app_LoginFrame_form_div_Login_edt_LoginId_input"><input type="password" id="app_LoginFrame_form_div_Login_edt_LoginPassword_input"><button id="app_LoginFrame_form_div_Login_btn_Login">로그인</button>`;
 let loads=0;const store={load:async()=>{loads++;return {username:'fixture-user',password:'fixture-pass',revision:'one'};}};
 try{
  const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:form}));
  await page.goto('https://example.com/EMDV3/index.html');assert.equal((await tryLotteLogin(page,{store})).status,'unrelated');assert.equal(loads,0);
  await page.goto('https://together.lotteshopping.com/EMDV3/index.html');
  await page.evaluate(()=>document.querySelector('button').onclick=()=>{document.body.innerHTML='<button>로그아웃</button>';});
  assert.equal((await tryLotteLogin(page,{store,timeout:1000})).status,'authenticated');
  const oldLoads=loads;assert.equal((await tryLotteLogin(page,{store})).status,'session');assert.equal(loads,oldLoads);
  // Rejected credentials leave the login screen visible: no automatic retry loop.
  await page.reload();let clicks=0;await page.exposeFunction('countClick',()=>clicks++);await page.evaluate(()=>document.querySelector('button').onclick=()=>window.countClick());
  const logs=[];assert.equal((await tryLotteLogin(page,{store,timeout:1,log:line=>logs.push(line)})).status,'manual');
  assert.equal((await tryLotteLogin(page,{store,timeout:1})).status,'manual');assert.equal(clicks,1);assert.ok(!logs.join().includes('fixture-pass'));assert.ok(!logs.join().includes('fixture-user'));
  const manual=await browser.newPage();await manual.route('**/*',route=>route.fulfill({contentType:'text/html',body:form+'<input id="captcha-code">'}));await manual.goto('https://together.lotteshopping.com/EMDV3/index.html');
  assert.equal((await tryLotteLogin(manual,{store})).status,'manual');assert.equal(await manual.locator('input[type=password]').inputValue(),'');
  await manual.locator('#captcha-code').evaluate(element=>element.remove());await manual.locator('input').first().fill('different-user');
  assert.equal((await tryLotteLogin(manual,{store})).status,'manual');assert.equal(await manual.locator('input').first().inputValue(),'different-user');
  assert.equal(await manual.locator('input[type=password]').inputValue(),'');
  // A still-loading Nexacro login form is eligible after it becomes visible.
  const delayed=await browser.newPage();await delayed.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<main></main>'}));await delayed.goto('https://together.lotteshopping.com/EMDV3/index.html');
  await delayed.evaluate(html=>setTimeout(()=>{document.body.innerHTML=html;document.querySelector('button').onclick=()=>{document.body.innerHTML='<button>로그아웃</button>';};},150),form);
  assert.equal((await tryLotteLogin(delayed,{store,waitForForm:true,timeout:1000})).status,'authenticated');
  const disabled=await browser.newPage();await disabled.route('**/*',route=>route.fulfill({contentType:'text/html',body:form}));await disabled.goto('https://together.lotteshopping.com/EMDV3/index.html');
  assert.equal((await tryLotteLogin(disabled,{store:{load:async()=>null}})).status,'unconfigured');assert.equal(await disabled.locator('input').first().inputValue(),'');
  assert.equal(await selectLottePage([page,delayed,disabled],null),delayed,'다시 연결할 때 남아 있는 로그인 화면보다 로그인된 창을 재사용');
  assert.equal(await selectLottePage([page,delayed,disabled],page),page,'이미 연결한 작업 창을 유지');
 }finally{await browser.close();}
});

test('롯데·스마트스토어 계정과 로그인 방식을 분리하고 한쪽 삭제가 다른 쪽에 영향을 주지 않는다',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'registrar-login-channels-')),lotte=createBrowserLoginStore(root),smart=createBrowserLoginStore(root,{channel:'smartstore'});
 try{
  await lotte.update({action:'save',enabled:true,username:'fixture-lotte',password:'fixture-lotte-pass'});
  await smart.update({action:'save',enabled:true,loginType:'seller',username:'fixture-smart',password:'fixture-smart-pass'});
  assert.equal((await lotte.load()).username,'fixture-lotte');assert.equal((await smart.load()).username,'fixture-smart');assert.equal((await smart.load()).loginType,'seller');
  assert.equal((await smart.status()).loginType,'seller');assert.equal(publishable('data/smartstore-browser-login-settings.json'),false);
  await assert.rejects(smart.update({action:'save',enabled:true,loginType:'naver'}),/다시 입력/);
  await smart.update({action:'delete'});assert.equal((await lotte.load()).username,'fixture-lotte');assert.equal(await smart.load(),null);
  assert.throws(()=>createBrowserLoginStore(root,{channel:'../other'}),/판매채널/);
 }finally{await rm(root,{recursive:true,force:true});}
});
