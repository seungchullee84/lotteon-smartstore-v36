import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

test('롯데ON 입력 버튼은 응답 전부터 움직이고 접수 후에도 실제 완료까지 유지한다',async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const feedback=source.slice(source.indexOf('let feedbackTimer'),source.indexOf('async function copyProgress('));
 const buttons=source.slice(source.indexOf('function syncButtons()'),source.indexOf("action('open',"));
 const paint=source.slice(source.indexOf('function paintSmartstoreStart()'),source.indexOf("$('smartstoreStart').onclick="));
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:780,height:600}});
  await page.setContent(`<body data-channel="lotte"><main style="display:block;padding-top:175px;max-width:700px"><section class="card"><p>동작 확인용 화면 · 판매자 화면에 전송하지 않음</p><h2>롯데ON 상품 입력</h2><form id="form"><input value="026952" aria-label="품번"></form><p>검토한 상품정보와 사진으로 입력을 진행합니다.</p><div class="register-actions"><button id="run">검토한 내용으로 입력 시작</button></div><p id="error"></p></section></main><div id="clickFeedback" role="status"></div><div hidden><button id="open"></button><button id="collect"></button></div></body>`);
  await page.addStyleTag({content:await readFile(new URL('../public/style.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:`const $=id=>document.getElementById(id),feedback=$('clickFeedback');
   let requestLock=false,serverBusy=false,serverPhase='idle',lotteRequestEpoch=0;
   const buttonLabels={open:'열기',collect:'수집',run:'검토한 내용으로 입력 시작'},busyLabels={run:'작업 중 · 롯데ON 입력 준비…'},activeChannel=()=>'lotte';
   window.requests=0;window.observedState={busy:true,phase:'register'};
   window.fetch=async()=>({ok:true,json:async()=>window.observedState});
   ${feedback}\n${buttons}\n${paint}
   action('run',async()=>{window.requests++;return await new Promise((resolve,reject)=>{window.accept=resolve;window.rejectRequest=reject;});});`});
  await page.locator('#run').click();await page.waitForFunction(()=>window.requests===1);
  assert.equal(await page.locator('.upload-motion-body strong').innerText(),'작업 중');
  assert.equal(await page.locator('#run').getAttribute('aria-busy'),'true');
  assert.equal(await page.locator('#run').evaluate(e=>getComputedStyle(e).opacity),'1');
  const first=await page.locator('.upload-motion-scene').evaluate(e=>getComputedStyle(e,'::before').transform);
  await page.waitForFunction(first=>getComputedStyle(document.querySelector('.upload-motion-scene'),'::before').transform!==first,first);
  await page.waitForFunction(()=>document.querySelector('.upload-motion-clock').textContent!=='전체 0초');
  if(process.env.LOTTE_MOTION_PROOF){await mkdir(process.env.LOTTE_MOTION_PROOF,{recursive:true});await page.screenshot({path:process.env.LOTTE_MOTION_PROOF+'/lotte-motion-test.png'});}
  await page.evaluate(()=>{document.getElementById('run').click();window.accept({ok:true});});
  await page.waitForFunction(()=>document.querySelector('.upload-motion-stage').textContent.includes('롯데ON 상품 입력 진행 중'));
  assert.equal(await page.evaluate(()=>window.requests),1);
  assert.match(await page.locator('#clickFeedback').getAttribute('class'),/working/);
  assert.equal(await page.locator('#run').isDisabled(),true);
  const clockBefore=await page.locator('.upload-motion-clock').innerText();
  await page.evaluate(()=>syncFeedbackWithState({busy:true,phase:'register'}));
  assert.equal(await page.locator('.upload-motion-clock').innerText(),clockBefore,'state polling must not reset elapsed time');
  for(const phase of ['done','error','stopped']){
   await page.evaluate(phase=>{syncFeedbackWithState({busy:true,phase:'register'});syncFeedbackWithState({busy:false,phase,error:phase==='error'?'테스트 오류':null});serverBusy=false;serverPhase=phase;syncButtons();},phase);
   assert.equal(await page.locator('.upload-motion').count(),0);
   assert.equal(await page.evaluate(()=>lotteMotionTimer),null);
   assert.equal(await page.locator('#run').getAttribute('aria-busy'),'false');
   assert.match(await page.locator('#clickFeedback').innerText(),new RegExp(({done:'입력 작업 완료',error:'테스트 오류',stopped:'중단'})[phase]));
  }
  await page.locator('#run').click();await page.waitForFunction(()=>window.requests===2);
  await page.evaluate(()=>window.rejectRequest(Error('요청 실패')));
  await page.waitForFunction(()=>!document.getElementById('run').disabled);
  assert.equal(await page.locator('.upload-motion').count(),0);
  assert.equal(await page.evaluate(()=>lotteMotionTimer),null);
  assert.match(await page.locator('#clickFeedback').innerText(),/요청 실패/);
 }finally{await browser.close();}
});
