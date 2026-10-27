import test from 'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{chromium}from'playwright';
test('진행 알림은 실제 결과로 바뀌고 완료 후 반복 조회에도 자동으로 사라진다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<div id=clickFeedback></div>');
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),logic=source.slice(source.indexOf('let feedbackTimer'),source.indexOf('async function copyProgress('));
  await page.addScriptTag({content:"const feedback=document.getElementById('clickFeedback');let requestLock=false,serverBusy=false,serverPhase='idle';"+logic});
  await page.evaluate(()=>{announce('상세설명 교체 중');syncFeedbackWithState({busy:true,phase:'smartstore-detail-only'});syncFeedbackWithState({busy:false,phase:'done'});});
  assert.match(await page.locator('#clickFeedback').innerText(),/상세설명 교체 완료/);
  assert.match(await page.locator('#clickFeedback').getAttribute('class'),/success/);
  await page.evaluate(()=>{window.poll=setInterval(()=>syncFeedbackWithState({busy:false,phase:'done'}),300);});
  await page.waitForFunction(()=>document.getElementById('clickFeedback').className==='',{},{timeout:6000});
  await page.evaluate(()=>{clearInterval(window.poll);announce('진행 중');syncFeedbackWithState({busy:true,phase:'smartstore-auto'});syncFeedbackWithState({busy:false,phase:'error',error:'업로드 실패'});});
  assert.match(await page.locator('#clickFeedback').innerText(),/업로드 실패/);assert.match(await page.locator('#clickFeedback').getAttribute('class'),/failed/);
  await page.evaluate(()=>{announce('진행 중');serverBusy=true;serverPhase='smartstore-detail-only';syncFeedbackWithState({busy:false,phase:'done'});});
  assert.match(await page.locator('#clickFeedback').innerText(),/교체 완료/);
 }finally{await browser.close();}
});
