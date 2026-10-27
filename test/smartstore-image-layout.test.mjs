import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {applySmartstoreImageLayout,selectSmartstoreImage} from '../smartstore-detail-upload.mjs';
test('긴 PNG는 고정 툴바 아래에서 실제 이미지를 선택하고 각 이미지의 문서 너비을 확인한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();
  await page.setContent(`<style>body{margin:0}.toolbar{position:fixed;top:0;height:250px;width:100%;background:white;z-index:10}.se-component{width:700px;margin:auto}img{display:block;width:700px}</style><div class=toolbar><button data-name=content-mode-without-pagefull data-value=fit class=se-is-selected onclick="const n=document.querySelector('.se-is-selected.se-section-image');n.parentElement.className='se-component-content se-component-content-fit'">문서 너비</button></div><div class="se-component se-image" id=first><div class="se-component-content se-component-content-fit"><div class="se-section-image se-is-selected"><img height=300></div></div></div><div class="se-component se-image" id=second><div class="se-component-content se-component-content-extend"><div class=se-section-image><img height=6000 onclick="setTimeout(()=>{document.querySelector('.se-section-image.se-is-selected').classList.remove('se-is-selected');this.parentElement.classList.add('se-is-selected')},20)"></div></div></div>`);
  await applySmartstoreImageLayout(page,page.locator('#second img'));
  assert.equal(await page.locator('#second .se-component-content-fit').count(),1);assert.equal(await page.locator('#first .se-component-content-fit').count(),1);
 }finally{await browser.close();}
});


test('상단 160px 안에 보이는 작은 이미지도 고정 제외 영역 없이 선택한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<div class="se-component se-image"><img style="width:300px;height:70px" onclick="this.dataset.clicked=1"></div>');
 await selectSmartstoreImage(page,page.locator('img'));assert.equal(await page.locator('img').getAttribute('data-clicked'),'1');
 }finally{await browser.close();}
});

test('축소 화면의 이미지 선택 레이어도 같은 이미지로 확인해 클릭한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent(`<style>body{zoom:.5}.se-component{position:relative;width:600px;height:300px;margin:300px 0}img{width:600px;height:300px;pointer-events:none}.overlay{position:absolute;inset:0}</style><div class="se-component se-image" onclick="this.dataset.clicked=1"><img><div class=overlay></div></div>`);
 await selectSmartstoreImage(page,page.locator('img'));assert.equal(await page.locator('.se-component').getAttribute('data-clicked'),'1');
 }finally{await browser.close();}
});

test('프레임 안 이미지의 로컬 좌표를 상위 페이지 클릭 좌표로 변환한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<iframe style="margin:120px 100px;width:500px;height:300px"></iframe>');
 const frame=page.frames()[1];await frame.setContent('<div class="se-component se-image"><img style="width:300px;height:120px" onclick="this.dataset.clicked=1"></div>');
 await selectSmartstoreImage(page,frame.locator('img'));assert.equal(await frame.locator('img').getAttribute('data-clicked'),'1');
 }finally{await browser.close();}
});
