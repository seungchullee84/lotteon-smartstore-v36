import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('5번 진행 표시는 즉시 시작하고 재진입 시 복원되며 실패와 중단을 완료로 표시하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();
  await page.setContent('<div class="register-actions"><button id="smartstoreStart">시작</button></div>');
  await page.addScriptTag({content:await readFile(new URL('../public/smartstore-progress.js',import.meta.url),'utf8')});
  const box=page.locator('#smartstoreUploadProgress');assert.equal(await box.isVisible(),false);
  await page.evaluate(()=>{window.clock=100000;Date.now=()=>window.clock;document.dispatchEvent(new CustomEvent('smartstore-auto-request',{detail:{status:'starting'}}));});
  assert.match(await box.innerText(),/시작 요청 중.*전체 0초/s);
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('register-state',{detail:{autoProgress:{id:'old',startedAt:1000,finishedAt:8000,status:'done'}}})));
  assert.match(await box.innerText(),/시작 요청 중/);
  await page.evaluate(()=>{window.clock=112000;document.dispatchEvent(new CustomEvent('register-state',{detail:{autoProgress:{id:'new',startedAt:100100,stepStartedAt:110000,step:'detail',status:'running',message:'원본 일치 재사용'}}}));});
  assert.match(await box.innerText(),/상세이미지 준비.*전체 11초 · 현재 단계 2초.*원본 일치 재사용/s);
  await page.evaluate(()=>window.clock=115000);await page.waitForFunction(()=>document.querySelector('.upload-progress-clock').textContent.includes('14초'));
  for(const status of ['error','stopped','done']){
   await page.evaluate(status=>document.dispatchEvent(new CustomEvent('register-state',{detail:{autoProgress:{id:'new',startedAt:100100,finishedAt:120100,status,message:status==='error'?'업로드 실패':'종료'}}})),status);
   assert.match(await box.innerText(),new RegExp(({error:'확인 필요',stopped:'중단됨',done:'편집기 준비 완료'})[status]));
   assert.match(await box.innerText(),/전체 20초/);assert.equal(await box.getAttribute('aria-busy'),'false');
  }
  // Freshly loading the component restores server timing instead of resetting it.
  await page.reload();await page.setContent('<div class="register-actions"><button id="smartstoreStart">시작</button></div>');
  await page.addScriptTag({content:await readFile(new URL('../public/smartstore-progress.js',import.meta.url),'utf8')});
  await page.evaluate(()=>{Date.now=()=>200000;document.dispatchEvent(new CustomEvent('register-state',{detail:{autoProgress:{id:'restored',startedAt:125000,stepStartedAt:190000,step:'upload',status:'running',message:'사진 첨부'}}}));});
  assert.match(await page.locator('#smartstoreUploadProgress').innerText(),/상품정보 입력·사진 업로드.*전체 1분 15초 · 현재 단계 10초/s);
 }finally{await browser.close();}
});
