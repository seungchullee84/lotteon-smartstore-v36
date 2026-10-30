import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {waitForSmartstoreEditorInput,focusSmartstoreEditorInput,attachSmartstorePhoto} from '../smartstore-detail-upload.mjs';

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

test('문단 위 ONE 커서 레이어를 클릭하고 입력 버퍼 초점을 확인한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const editor=await browser.newPage();
  await editor.setContent('<iframe id="input_buffer1" tabindex="-1"></iframe><div class="se-component se-text" style="position:relative;width:500px;height:80px"><p class="se-text-paragraph" style="width:500px;height:80px">유지할 본문</p><div class="se-selection" style="position:absolute;inset:0" onclick="document.querySelector(\'iframe\').focus()"><svg class="se-caret" style="width:100%;height:100%"></svg></div></div><div class="se-component se-text" hidden><p class="se-text-paragraph">숨겨진 마지막 문단</p></div>');
  await focusSmartstoreEditorInput(editor);
  assert.equal(await editor.evaluate(()=>document.activeElement?.id),'input_buffer1');
  assert.equal(await editor.locator('.se-text-paragraph').first().textContent(),'유지할 본문');
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

test('사진 첨부 뒤 커서 클릭이 body에 초점을 남겨도 기존 입력 버퍼로 연결한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const editor=await browser.newPage();
  await editor.setContent('<iframe id="input_buffer1" tabindex="-1"></iframe><div class="se-component se-image">기존 사진</div><div class="se-component se-text"><p class="se-text-paragraph">사진 뒤 입력 문단</p></div>');
  assert.equal(await editor.evaluate(()=>document.activeElement.tagName),'BODY');
  await focusSmartstoreEditorInput(editor);
  assert.equal(await editor.evaluate(()=>document.activeElement.id),'input_buffer1');
  assert.equal(await editor.locator('.se-component.se-image').textContent(),'기존 사진');
 }finally{await browser.close();}
});

for(const alreadyOpen of [false,true])test('사진 선택 창의 내 사진 버튼을 사용하고 과거 파일 입력은 건드리지 않는다 · '+(alreadyOpen?'열린 창':'새 창'),async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const editor=await browser.newPage();
  await editor.setContent(`<button data-group="documentToolbar" data-name="image" onclick="window.toolbarClicks=(window.toolbarClicks||0)+1;document.querySelector('[role=dialog]').hidden=false">사진</button><input id="stale" type="file" hidden onchange="window.staleUploads=(window.staleUploads||0)+1"><div role="dialog" ${alreadyOpen?'':'hidden'}><h4>내 사진 불러오기</h4><button onclick="document.querySelector('#current').click()">내 사진</button><input id="current" type="file" accept="image/png" hidden onchange="window.photoUploads=(window.photoUploads||0)+1;document.querySelector('[role=dialog]').hidden=true"></div><button onclick="window.registered=true">등록</button>`);
  const bytes=Buffer.from('current photo fixture');
  await attachSmartstorePhoto(editor,{name:'current.png',mimeType:'image/png',buffer:bytes});
  assert.equal(await editor.evaluate(()=>window.staleUploads||0),0);
  assert.equal(await editor.evaluate(()=>window.photoUploads),1);
  assert.equal(await editor.evaluate(()=>window.toolbarClicks||0),alreadyOpen?0:1);
  assert.equal(await editor.locator('#current').evaluate(n=>n.files[0].name),'current.png');
  assert.equal(await editor.evaluate(()=>window.registered),undefined);
  assert.equal(editor.listenerCount('filechooser'),0);
 }finally{await browser.close();}
});

test('사진 툴바가 파일 선택기를 바로 여는 경우에도 한 번만 첨부한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const editor=await browser.newPage();
  await editor.setContent('<button data-group="documentToolbar" data-name="image" onclick="document.querySelector(\'input\').click()">사진</button><input type="file" hidden onchange="window.uploads=(window.uploads||0)+1">');
  await attachSmartstorePhoto(editor,{name:'direct.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
  assert.equal(await editor.evaluate(()=>window.uploads),1);
  assert.equal(editor.listenerCount('filechooser'),0);
 }finally{await browser.close();}
});
