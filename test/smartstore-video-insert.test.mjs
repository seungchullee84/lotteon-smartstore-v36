import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {insertSmartstoreVideo,openSmartstoreEditor} from '../smartstore-detail-upload.mjs';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {prepareVideo,fixtureVideo} from './helpers/brand-video.mjs';
test('MP4 원본 첨부·네이티브 식별자 확인, HTML 변환·판매자 저장 버튼은 사용하지 않음',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'native-video-'));const browser=await chromium.launch({headless:true});
 try{
  const options=await prepareVideo(root),page=await browser.newPage();
  await page.setContent(`<button onclick="document.querySelector('[role=dialog]').hidden=false">동영상</button><button onclick="window.wrong=true">등록</button><div role=dialog hidden><input type=file accept="video/mp4" onchange="document.querySelector('#done').disabled=false"><button id=done disabled onclick="const n=document.createElement('div');n.className='se-component se-video';n.dataset.videoId='new-native-video';document.body.append(n);document.querySelector('[role=dialog]').hidden=true">완료</button></div>`);
  const result=await insertSmartstoreVideo(page,options);
  assert.deepEqual(result.identity,['new-native-video']);assert.equal(result.storePlayback,'unverified');
  assert.equal(await page.evaluate(()=>window.wrong),undefined);
  const transport=await page.locator('input').evaluate(async n=>[...new Uint8Array(await n.files[0].arrayBuffer())]);
  assert.deepEqual(Buffer.from(transport),fixtureVideo);
  await page.setContent('<div class="se-component se-text">원래 상세</div>');
  await assert.rejects(insertSmartstoreVideo(page,options),/동영상 첨부 버튼/);
  assert.equal(await page.locator('.se-text').innerText(),'원래 상세');
 }finally{await browser.close();await rm(root,{recursive:true,force:true});}
});
test('식별자가 없는 영상 요소를 업로드 완료나 자동재생 확인으로 처리하지 않음',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'native-video-'));const browser=await chromium.launch({headless:true});
 try{const options=await prepareVideo(root),page=await browser.newPage();await page.setContent(`<button>동영상</button><input type=file accept="video/mp4" onchange="const n=document.createElement('div');n.className='se-component se-video';document.body.append(n)">`);await assert.rejects(insertSmartstoreVideo(page,{...options,timeout:800}),/식별자/);}
 finally{await browser.close();await rm(root,{recursive:true,force:true});}
});
test('ONE reentry waits for the asynchronously rebuilt launch button instead of the old eight-second timeout',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();page.setDefaultTimeout(8000);
  await page.setContent(`<script>setTimeout(()=>{const b=document.createElement('button');b.dataset.nclicksCode='descrip.sebtn';b.textContent='스마트 에디터 ONE 으로 수정';b.onclick=()=>window.open('about:blank');document.body.append(b)},8500)</script>`);
  const editor=await openSmartstoreEditor(page);assert.notEqual(editor,page);await editor.close();
 }finally{await browser.close();}
});
