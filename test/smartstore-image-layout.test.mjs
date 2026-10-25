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
