import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {applySmartstoreImageLayout,selectSmartstoreImage} from '../smartstore-detail-upload.mjs';
test('긴 PNG는 고정 툴바 아래에서 실제 이미지를 선택하고 각 이미지의 옆트임을 확인한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();
  await page.setContent(`<style>body{margin:0}.toolbar{position:fixed;top:0;height:250px;width:100%;background:white;z-index:10}.se-component{width:700px;margin:auto}img{display:block;width:700px}</style><div class=toolbar><button data-name=content-mode-without-pagefull data-value=extend class=se-is-selected onclick="const n=document.querySelector('.se-is-selected.se-section-image');n.parentElement.className='se-component-content se-component-content-extend'">옆트임</button></div><div class="se-component se-image" id=first><div class="se-component-content se-component-content-extend"><div class="se-section-image se-is-selected"><img height=300></div></div></div><div class="se-component se-image" id=second><div class="se-component-content se-component-content-fit"><div class=se-section-image><img height=6000 onclick="setTimeout(()=>{document.querySelector('.se-section-image.se-is-selected').classList.remove('se-is-selected');this.parentElement.classList.add('se-is-selected')},20)"></div></div></div>`);
  await applySmartstoreImageLayout(page,page.locator('#second img'));
  assert.equal(await page.locator('#second .se-component-content-extend').count(),1);assert.equal(await page.locator('#first .se-component-content-extend').count(),1);
 }finally{await browser.close();}
});

test('확대 배율과 내부 스크롤·고정 도구막대 아래에서도 가리지 않은 이미지 영역을 선택한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:900,height:600}});
  await page.setContent(`<style>body{margin:0;zoom:.8}#pane{height:600px;overflow:auto}.toolbar{position:fixed;top:0;left:0;height:220px;width:100%;background:white;z-index:10}img{display:block;width:500px;height:80px}</style><div id=pane><div style="height:600px"></div><img onclick="this.dataset.clicked='yes'"><div style="height:1500px"></div></div><div class=toolbar>도구막대</div>`);
  await page.locator('#pane').evaluate(n=>n.scrollTop=550);
  await selectSmartstoreImage(page,page.locator('img'));
  assert.equal(await page.locator('img').getAttribute('data-clicked'),'yes');
 }finally{await browser.close();}
});


test('작은 배너가 160px 위에 있어도 실제 노출된 이미지를 선택한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:900,height:500}});
 await page.setContent(`<style>body{margin:0}img{display:block;width:500px;height:90px;margin:20px auto}</style><div class="se-component se-image" id=short><div class="se-component-content"><div class=se-section-image><img onclick="this.parentElement.classList.add('se-is-selected')"></div></div></div><button data-name=content-mode-without-pagefull data-value=extend onclick="document.querySelector('.se-component-content').classList.add('se-component-content-extend')">옆트임</button>`);
 await applySmartstoreImageLayout(page,page.locator('img'));
 assert.equal(await page.locator('#short .se-component-content-extend').count(),1);
 }finally{await browser.close();}
});

for(const mode of ['selection-overlay','pointer-events-none'])test('ONE '+mode+' 위에서도 해당 이미지 선택과 옆트임을 확인한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:900,height:600}});
  await page.setContent(`<style>body{margin:0}.se-component{width:600px;margin:auto}.se-section-image{position:relative}img{display:block;width:600px;height:300px;${mode==='pointer-events-none'?'pointer-events:none':''}}.selection-layer{position:absolute;inset:0}</style><div class="se-component se-image" id=target><div class=se-component-content><div class=se-section-image onclick="this.classList.add('se-is-selected')"><img>${mode==='selection-overlay'?'<div class=selection-layer></div>':''}</div></div></div><div class="se-component se-image" id=other><img style="height:50px"></div><button data-name=content-mode-without-pagefull data-value=extend onclick="document.querySelector('#target .se-section-image.se-is-selected').parentElement.classList.add('se-component-content-extend')">옆트임</button>`);
  await applySmartstoreImageLayout(page,page.locator('#target img'));
  assert.equal(await page.locator('#target .se-component-content-extend').count(),1);
  assert.equal(await page.locator('#other .se-is-selected').count(),0);
 }finally{await browser.close();}
});

test('다른 이미지가 타깃을 완전히 가리면 클릭하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:900,height:600}});
  await page.setContent(`<style>body{margin:0}.se-component{position:absolute;inset:0;background:white}img{width:600px;height:300px}</style><div class="se-component se-image" id=target><img></div><div class="se-component se-image" id=other onclick="this.dataset.clicked='yes'"><img></div>`);
  await assert.rejects(selectSmartstoreImage(page,page.locator('#target img')),/가려져/);
  assert.equal(await page.locator('#other').getAttribute('data-clicked'),null);
 }finally{await browser.close();}
});

test('선택 표시가 이미지 section 대신 component에 있어도 실제 옆트임 결과로 확인한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();
  await page.setContent(`<style>img{display:block;width:600px;height:400px}.toolbar{position:fixed;top:0}</style><div class="se-component se-image" id=component><div class=se-component-content><div class=se-section-image><img onclick="this.closest('.se-component').classList.add('se-is-selected')"></div></div></div><div class=toolbar><button data-name=content-mode-without-pagefull data-value=extend onclick="document.querySelector('.se-component.se-is-selected .se-component-content').classList.add('se-component-content-extend')">옆트임</button></div>`);
  await applySmartstoreImageLayout(page,page.locator('img'));
  assert.equal(await page.locator('.se-section-image.se-is-selected').count(),0);
  assert.equal(await page.locator('#component .se-component-content-extend').count(),1);
 }finally{await browser.close();}
});
