import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {waitForSmartstoreEditorInput} from '../smartstore-detail-upload.mjs';

test('숨겨진 사진 캡션과 숨겨진 본문 앞에서도 실제 표시된 입력 문단으로 준비를 확인한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const editor=await browser.newPage();
  await editor.setContent('<iframe id="input_buffer1"></iframe><div class="se-component se-image"><p class="se-text-paragraph" hidden>숨겨진 캡션</p></div><div class="se-component se-text" hidden><p class="se-text-paragraph">숨겨진 본문</p></div><div class="se-component se-text"><p class="se-text-paragraph">현재 본문</p></div>');
  assert.equal(await editor.locator('.se-text-paragraph').first().isVisible(),false);
  let checks=0;
  await waitForSmartstoreEditorInput(editor,{check:()=>checks++});
  assert.equal(checks,2);
  assert.equal(await editor.locator('.se-component.se-image').count(),1,'준비 확인은 기존 사진을 변경하지 않는다');
  assert.equal(await editor.locator('.se-component.se-text').last().innerText(),'현재 본문');
 }finally{await browser.close();}
});

test('입력 버퍼만 준비된 상태에서는 보이는 본문 문단이 생성될 때까지 기다린다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const editor=await browser.newPage();
  await editor.setContent('<iframe id="input_buffer1"></iframe><div class="se-component se-image"><p class="se-text-paragraph" hidden>캡션</p></div>');
  let ready=false;
  const waiting=waitForSmartstoreEditorInput(editor).then(()=>{ready=true;});
  await editor.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(ready,false);
  await editor.evaluate(()=>{const text=document.createElement('div');text.className='se-component se-text';text.innerHTML='<p class="se-text-paragraph">입력 준비 완료</p>';document.body.append(text);});
  await waiting;
  assert.equal(ready,true);
  await assert.rejects(waitForSmartstoreEditorInput(editor,{check:()=>{throw Error('사용자 중단');}}),/사용자 중단/);
 }finally{await browser.close();}
});
