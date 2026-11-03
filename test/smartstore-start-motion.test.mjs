import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

test('실제 시작 핸들러는 응답 대기 중에도 즉시 움직이며 중복 요청과 실패 후 애니메이션을 막는다',async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const feedback=source.slice(source.indexOf('let feedbackTimer'),source.indexOf('async function copyProgress('));
 const buttons=source.slice(source.indexOf('function syncButtons()'),source.indexOf('function action('));
 const start=source.slice(source.indexOf('function paintSmartstoreStart()'),source.indexOf("$('smartstoreDetailOnly').onclick="));
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:780,height:640}});
  await page.setContent(`<body data-channel="smartstore"><main style="display:block;padding-top:175px;max-width:700px"><section class="card"><p>동작 확인용 화면 · 판매자 화면에 전송하지 않음</p><h2>5. 입력·업로드 시작</h2><input id="style" value="026952"><p>확인한 상품정보와 사진으로 업로드를 준비합니다.</p><div class="register-actions"><button id="smartstoreStart">입력·업로드 시작</button></div><p id="error"></p></section></main><div id="clickFeedback" role="status"></div><div hidden><button id="open"></button><button id="collect"></button><button id="run"></button></div></body>`);
  await page.addStyleTag({content:await readFile(new URL('../public/style.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:`const $=id=>document.getElementById(id),feedback=$('clickFeedback');
   let requestLock=false,serverBusy=false,serverPhase='idle',smartstoreStarting=false,smartstoreRequestAt=0,product=null;
   const buttonLabels={},busyLabels={};window.requests=0;
   const flushManualTagSelection=async()=>{},currentProductEdits=()=>({}),currentManualTags=()=>[],refresh=()=>{};
   const post=async()=>{window.requests++;await new Promise((resolve,reject)=>{window.rejectRequest=reject;});};
   ${feedback}\n${buttons}\n${start}`});
  await page.addScriptTag({content:await readFile(new URL('../public/smartstore-progress.js',import.meta.url),'utf8')});
  await page.locator('#smartstoreStart').click();
  await page.waitForFunction(()=>window.requests===1);
  assert.equal(await page.locator('#smartstoreStart').isDisabled(),true);
  assert.equal(await page.locator('#smartstoreStart').getAttribute('aria-busy'),'true');
  assert.match(await page.locator('#smartstoreStart').innerText(),/작업 중/);
  assert.equal(await page.locator('.upload-motion-body strong').innerText(),'작업 중');
  assert.equal(await page.locator('.upload-motion-rocket').isVisible(),true);
  assert.equal(await page.locator('#smartstoreStart').evaluate(e=>getComputedStyle(e).opacity),'1');
  const first=await page.locator('.upload-motion-scene').evaluate(e=>getComputedStyle(e,'::before').transform);
  await page.waitForFunction(first=>getComputedStyle(document.querySelector('.upload-motion-scene'),'::before').transform!==first,first);
  await page.waitForFunction(()=>document.querySelector('.upload-motion-clock').textContent!=='전체 0초');
  await page.evaluate(()=>document.getElementById('smartstoreStart').click());
  assert.equal(await page.evaluate(()=>window.requests),1,'disabled button must not queue another upload');
  if(process.env.SMARTSTORE_MOTION_PROOF){
   await mkdir(process.env.SMARTSTORE_MOTION_PROOF,{recursive:true});
   await page.screenshot({path:process.env.SMARTSTORE_MOTION_PROOF+'/start-motion-test.png'});
  }
  await page.setViewportSize({width:375,height:680});
  const bounds=await page.locator('#clickFeedback').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=375);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.upload-motion-scene').evaluate(e=>getComputedStyle(e,'::before').animationName),'none');
  assert.equal(await page.locator('#smartstoreStart').evaluate(e=>getComputedStyle(e,'::after').display),'none');
  assert.equal(await page.locator('.upload-motion-body strong').innerText(),'작업 중');
  await page.evaluate(()=>window.rejectRequest(Error('연결 응답 실패')));
  await page.waitForFunction(()=>document.querySelector('#smartstoreStart').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.upload-motion').count(),0);
  assert.match(await page.locator('#clickFeedback').innerText(),/연결 응답 실패/);
  assert.match(await page.locator('#smartstoreUploadProgress').innerText(),/확인 필요/);
  assert.equal(await page.locator('.upload-progress-activity').isVisible(),false);
 }finally{await browser.close();}
});
