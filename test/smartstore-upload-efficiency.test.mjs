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
 await page.route('https://example.com/editor',r=>r.fulfill({contentType:'text/html',body:'<div class="se-component se-image"><div class=se-component-content-extend><img width=50 height=50 src="https://phinf.pstatic.net/a.png"></div></div><div class="se-component se-video" id="'+videoId+'"></div><div class="se-component se-image"><div class=se-component-content-extend><img width=50 height=50 src="https://phinf.pstatic.net/b.png"></div></div>'}));
 await page.goto('https://sell.smartstore.naver.com/#/products/copy/1');
 const parts={files:[path.join(root,'a.png'),path.join(root,'b.png')],includeVideo:true,videoIdentity:{identity:['component:'+videoId]}};
 assert.equal((await verifySmartstoreDetail(page,parts)).detailUploaded,true);
 videoId='SE-00000000-3434-48be-bdaa-84ba88bfe976';await assert.rejects(()=>verifySmartstoreDetail(page,parts),/MP4 영상 식별자/);
 const report=JSON.parse(await readFile(path.join(root,'detail-verification.json'),'utf8'));assert.deepEqual(report.mismatch,['MP4 영상 식별자']);assert.deepEqual(report.names,['a.png','b.png']);
 }finally{await rm(root,{recursive:true,force:true});}
}));
