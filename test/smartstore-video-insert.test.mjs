import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {insertSmartstoreVideo,openSmartstoreEditor} from '../smartstore-detail-upload.mjs';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {prepareVideo,fixtureVideo} from './helpers/brand-video.mjs';
import {nativeVideoIdentity} from '../smartstore-native-video.mjs';

test('동영상 툴바가 첨부창 없이 파일 선택기를 직접 열어도 MP4를 영상 입력에만 첨부한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'direct-native-video-')),browser=await chromium.launch({headless:true});try{
 const options=await prepareVideo(root),page=await browser.newPage();
 await page.setContent(`<button data-name=video data-group=documentToolbar onclick="document.querySelector('#video').click()">동영상</button><input id=photo type=file hidden><input id=video type=file hidden onchange="const n=document.createElement('div');n.className='se-component se-video';n.dataset.videoId='direct-picker-video';document.body.append(n)"><button onclick="window.saved=true">등록</button>`);
 const result=await insertSmartstoreVideo(page,{...options,timeout:3000});assert.deepEqual(result.identity,['direct-picker-video']);
 assert.equal(await page.locator('#photo').evaluate(n=>n.files.length),0);assert.equal(await page.locator('#video').evaluate(n=>n.files.length),1);assert.equal(await page.evaluate(()=>window.saved),undefined);
 assert.equal(page.listenerCount('filechooser'),0,'첨부 후 수집기를 해제한다');
 }finally{await browser.close();await rm(root,{recursive:true,force:true});}
});
test('네이버 변환 대기 섬네일이 바뀌어도 같은 문서 영상 요소를 재확인한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.route('https://phinf.pstatic.net/**',r=>r.abort());
  await page.setContent('<div class="se-component se-video" data-compid="SE-98bb2cab-3434-48be-bdaa-84ba88bfe976"><img class="se-video-thumbnail-resource" src="data:image/svg+xml,test"></div>');
  const before=await nativeVideoIdentity(page.locator('.se-video'));
  await page.locator('img').evaluate(n=>n.src='https://phinf.pstatic.net/image.nmv/encoded.jpg');
  assert.deepEqual(await nativeVideoIdentity(page.locator('.se-video')),before);assert.deepEqual(before,['component:SE-98bb2cab-3434-48be-bdaa-84ba88bfe976']);
 }finally{await browser.close();}
});
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
test('실제 ONE 버튼 이름·파일 선택기·업로드 완료 상태·네이티브 섬네일 구조를 처리한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'native-video-'));const browser=await chromium.launch({headless:true});
 try{
  const options=await prepareVideo(root),page=await browser.newPage();await page.route('https://phinf.pstatic.net/**',r=>r.abort());
  await page.setContent(`<button data-name=video data-group=documentToolbar onclick="document.querySelector('#video-uploader-wrap').hidden=false">동영상<span>동영상 추가</span></button><div id=video-uploader-wrap hidden><button onclick="document.querySelector('input').click()">동영상 추가</button><input type=file hidden onchange="setTimeout(()=>{document.querySelector('#status').textContent='업로드 완료'},500)"><p id=status>대기중</p><button onclick="if(document.querySelector('#status').textContent!=='업로드 완료')window.early=true;const n=document.createElement('div');n.className='se-component se-video';n.innerHTML='<img class=se-video-thumbnail-resource src=https://phinf.pstatic.net/image.nmv/new-native-video.jpg>';document.body.append(n);document.querySelector('#video-uploader-wrap').hidden=true">완료</button></div>`);
  const result=await insertSmartstoreVideo(page,options);assert.deepEqual(result.identity,['thumbnail:https://phinf.pstatic.net/image.nmv/new-native-video.jpg']);assert.equal(await page.evaluate(()=>window.early),undefined);
 }finally{await browser.close();await rm(root,{recursive:true,force:true});}
});
test('ONE reentry waits for the asynchronously rebuilt launch button instead of the old eight-second timeout',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();page.setDefaultTimeout(8000);
  await page.setContent(`<script>setTimeout(()=>{const b=document.createElement('button');b.dataset.nclicksCode='descrip.sebtn';b.textContent='스마트 에디터 ONE 으로 수정';b.onclick=()=>window.open('about:blank');document.body.append(b)},8500)</script>`);
  const editor=await openSmartstoreEditor(page);assert.notEqual(editor,page);await editor.close();
 }finally{await browser.close();}
});

test('동영상 버튼 첫 클릭이 반응하지 않으면 다시 누르고 한 번만 업로드한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'retry-native-video-')),browser=await chromium.launch({headless:true});
 try{
  const options=await prepareVideo(root),page=await browser.newPage();
  await page.setContent(`<button data-name=video data-group=documentToolbar onclick="window.clicks=(window.clicks||0)+1;if(window.clicks===2)document.querySelector('[role=dialog]').hidden=false">동영상</button><div role=dialog hidden><input type=file accept="video/mp4" onchange="window.uploads=(window.uploads||0)+1;setTimeout(()=>{const n=document.createElement('div');n.className='se-component se-video';n.dataset.videoId='retried-video';document.body.append(n)},1800)"></div><button onclick="window.saved=true">등록</button>`);
  const result=await insertSmartstoreVideo(page,{...options,timeout:8000});
  assert.deepEqual(result.identity,['retried-video']);
  assert.equal(await page.evaluate(()=>window.clicks),2);
  assert.equal(await page.evaluate(()=>window.uploads),1);
  assert.equal(await page.evaluate(()=>window.saved),undefined);
  assert.equal(page.listenerCount('filechooser'),0);
 }finally{await browser.close();await rm(root,{recursive:true,force:true});}
});
