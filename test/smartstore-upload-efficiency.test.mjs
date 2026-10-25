import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fillSmartstoreValue} from '../smartstore-form.mjs';
import {fillProductAttributes} from '../smartstore-attributes.mjs';
import {applySmartstoreImageLayout,verifySmartstoreDetail} from '../smartstore-detail-upload.mjs';
import {nativeVideoIdentity} from '../smartstore-native-video.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function browserTest(fn){const browser=await chromium.launch({headless:true});try{await fn(await browser.newPage());}finally{await browser.close();}}
test('동일한 입력값은 재입력·Tab 이벤트 없이 유지하고 변경값만 입력·재확인한다',()=>browserTest(async page=>{
 await page.setContent('<input value="현재 상품명" oninput="window.changed=(window.changed||0)+1">');
 const field=page.locator('input');assert.equal(await fillSmartstoreValue(field,'현재 상품명'),false);assert.equal(await page.evaluate(()=>window.changed||0),0);
 assert.equal(await fillSmartstoreValue(field,'수정한 상품명'),true);assert.equal(await field.inputValue(),'수정한 상품명');
 await field.evaluate(e=>e.addEventListener('blur',()=>e.value='서버가 거부한 값'));
 await assert.rejects(()=>fillSmartstoreValue(field,'다른 상품명'),/입력값 확인 실패/);
}));
test('전체 속성창이 있으면 기본·추가 속성을 중복 클릭하지 않고 한 번에 입력한다',()=>browserTest(async page=>{
 await page.setContent('<table aria-label="상품속성 선택 테이블"><tr><th>주요소재</th><td><input type=checkbox onclick="window.wrong=true"></td></tr></table><button onclick="window.opened=(window.opened||0)+1;document.querySelector(\'.modal-content\').hidden=false">속성 더 입력하기</button><div class="modal-content" hidden><h2>상품속성</h2><table><tr><th>주요소재</th><td><input type=checkbox aria-label="면" onclick="window.selected=(window.selected||0)+1"></td></tr></table><button onclick="this.parentElement.hidden=true">저장</button></div>');
 await fillProductAttributes(page,{materials:['면'],attributes:{}});
 assert.equal(await page.evaluate(()=>window.wrong),undefined);assert.equal(await page.evaluate(()=>window.opened),1);assert.equal(await page.evaluate(()=>window.selected),1);
}));
test('이미 옆트임인 이미지는 다시 선택하거나 편집기 창을 전환하지 않는다',()=>browserTest(async page=>{
 await page.setContent('<div class="se-component se-image"><div class="se-component-content-extend"><img width=50 height=50 onclick="window.wrong=true"></div></div>');
 await applySmartstoreImageLayout(page,page.locator('img'));assert.equal(await page.evaluate(()=>window.wrong),undefined);
}));
test('추가 속성창에 없는 기본 항목은 본문에서 입력하고 이미 처리한 소재는 다시 누르지 않는다',()=>browserTest(async page=>{
 await page.setContent('<table aria-label="상품속성 선택 테이블"><tr><th>주요소재</th><td><input type=checkbox onclick="window.wrong=true"></td></tr><tr><th>네크라인</th><td><div class=selectize-input onclick="this.nextElementSibling.hidden=false"><span class=item>선택</span></div><div class=selectize-dropdown-content hidden><div data-selectable onclick="this.parentElement.previousElementSibling.querySelector(\'.item\').textContent=this.textContent;this.parentElement.hidden=true">라운드넥</div></div></td></tr></table><button onclick="document.querySelector(\'.modal-content\').hidden=false">속성 더 입력하기</button><div class=modal-content hidden><h2>상품속성</h2><table><tr><th>주요소재</th><td><input type=checkbox aria-label="면"></td></tr></table><button onclick="this.parentElement.hidden=true">저장</button></div>');
 await fillProductAttributes(page,{materials:['면'],neckline:'라운드넥',attributes:{'네크라인':'라운드넥'}});
 assert.equal(await page.locator('.item').innerText(),'라운드넥');assert.equal(await page.evaluate(()=>window.wrong),undefined);
}));
test('ONE의 id 속성도 문서 영상 식별자로 사용해 썸네일 교체 후 같은 영상임을 확인한다',()=>browserTest(async page=>{
 await page.setContent('<div class="se-component se-video" id="SE-98bb2cab-3434-48be-bdaa-84ba88bfe976"><img class=se-video-thumbnail-resource src="data:image/png,temp"></div>');
 const expected=['component:SE-98bb2cab-3434-48be-bdaa-84ba88bfe976'];assert.deepEqual(await nativeVideoIdentity(page.locator('.se-video')),expected);
 await page.locator('img').evaluate(n=>n.src='https://phinf.pstatic.net/image.nmv/converted.jpg');assert.deepEqual(await nativeVideoIdentity(page.locator('.se-video')),expected);
}));
test('재진입 검증은 이미지 순서·영상·옆트임을 모두 대조하고 다른 영상은 성공 처리하지 않는다',()=>browserTest(async page=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-verify-'));
 try{
 let videoId='SE-98bb2cab-3434-48be-bdaa-84ba88bfe976';
 await page.route('https://sell.smartstore.naver.com/**',r=>r.fulfill({contentType:'text/html',body:'<button data-nclicks-code="descrip.sebtn" onclick="window.open(\'https://example.com/editor\')">편집기</button>'}));
 await page.context().route('https://phinf.pstatic.net/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=','base64')}));
 await page.context().route('https://example.com/editor',r=>r.fulfill({contentType:'text/html',body:'<div class="se-component se-image"><div class=se-component-content-extend><img width=50 height=50 src="https://phinf.pstatic.net/a.png"></div></div><div class="se-component se-video" id="'+videoId+'"></div><div class="se-component se-image"><div class=se-component-content-extend><img width=50 height=50 src="https://phinf.pstatic.net/b.png"></div></div>'}));
 await page.goto('https://sell.smartstore.naver.com/#/products/copy/1');
 const parts={files:[path.join(root,'a.png'),path.join(root,'b.png')],includeVideo:true,videoIdentity:{identity:['component:'+videoId]}};
 assert.equal((await verifySmartstoreDetail(page,parts)).detailUploaded,true);
 videoId='SE-00000000-3434-48be-bdaa-84ba88bfe976';await assert.rejects(()=>verifySmartstoreDetail(page,parts),/MP4 영상 식별자/);
 const report=JSON.parse(await readFile(path.join(root,'detail-verification.json'),'utf8'));assert.deepEqual(report.mismatch,['MP4 영상 식별자']);assert.deepEqual(report.names,['a.png','b.png']);
 }finally{await rm(root,{recursive:true,force:true});}
}));

test('마지막 이미지의 옆트임만 빠졌으면 파일을 다시 올리지 않고 해당 배치만 고쳐 재진입 확인한다',()=>browserTest(async page=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-layout-repair-'));
 try{
 let fixed=false,opened=0,applied=0,persist=true;
 const id='SE-98bb2cab-3434-48be-bdaa-84ba88bfe976';
 await page.context().route('https://example.com/applied',async r=>{applied++;fixed=persist;await r.fulfill({contentType:'text/html',body:'편집기 적용 완료'});await r.request().frame().page().close();});
 await page.route('https://sell.smartstore.naver.com/**',r=>r.fulfill({contentType:'text/html',body:'<textarea name="editorContent">true</textarea><button data-nclicks-code="descrip.sebtn" onclick="window.open(\'https://example.com/editor\')">편집기</button>'}));
 await page.context().route('https://phinf.pstatic.net/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=','base64')}));
 await page.context().route('https://example.com/editor',r=>{
  opened++;
  return r.fulfill({contentType:'text/html',body:`<style>body{margin:0}.se-component{margin:200px 0 0}img{width:300px;height:300px}</style><button data-name=content-mode-without-pagefull data-value=extend onclick="document.querySelector('.se-section-image.se-is-selected').parentElement.className='se-component-content-extend'">옆트임</button><div class="se-component se-image" id=first><div class=se-component-content-extend><div class=se-section-image><img src="https://phinf.pstatic.net/a.png"></div></div></div><div class="se-component se-video" id="${id}"></div><div class="se-component se-image" id=last><div class="${fixed?'se-component-content-extend':'se-component-content-fit'}"><div class=se-section-image><img src="https://phinf.pstatic.net/b.png" onclick="this.parentElement.classList.add('se-is-selected')"></div></div></div><button onclick="location.href='https://example.com/applied'">등록</button>`});
 });
 await page.goto('https://sell.smartstore.naver.com/#/products/copy/1');
 const parts={files:[path.join(root,'a.png'),path.join(root,'b.png')],includeVideo:true,videoIdentity:{identity:['component:'+id]}},logs=[];
 assert.equal((await verifySmartstoreDetail(page,parts,{log:x=>logs.push(x)})).detailUploaded,true);
 assert.equal(applied,1);assert.equal(opened,2);assert(logs.some(x=>x.includes('파일 재업로드 없음')));
 const report=JSON.parse(await readFile(path.join(root,'detail-verification.json'),'utf8'));assert.deepEqual(report.mismatch,[]);assert.equal(report.repairAttempt,1);
  fixed=false;persist=false;opened=0;applied=0;
  await assert.rejects(()=>verifySmartstoreDetail(page,parts),/옆트임 배치/);assert.equal(applied,1,'실패해도 배치 수정은 한 번만 시도');assert.equal(opened,2);
 }finally{await rm(root,{recursive:true,force:true});}
}));
