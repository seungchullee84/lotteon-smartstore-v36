import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {commitSmartstoreEditor,applySmartstoreBannerLink} from '../smartstore-detail-upload.mjs';
import {STORE_BANNER_URL} from '../smartstore-store-banner.mjs';
test('최종 반영 전에 업로드 완료와 옆트임 누락 보정을 나누고 해당 이미지 배치만 고친다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent(`<textarea name=editorContent>true</textarea><button onclick="window.open('about:blank')">편집기</button>`);
  const [editor]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button').click()]);
  let registered=false;await editor.exposeFunction('recordReady',()=>{registered=true;});
  await editor.setContent(`<style>img{display:block;width:500px;height:200px}.se-component{margin-top:100px}</style><button data-name=content-mode-without-pagefull data-value=extend onclick="document.querySelector('.se-section-image.se-is-selected').parentElement.classList.add('se-component-content-extend')">옆트임</button><div class="se-component se-image" id=first><div class="se-component-content se-component-content-extend"><div class=se-section-image><img src="https://example.com/a.png"></div></div></div><div class="se-component se-image" id=last><div class=se-component-content><div class=se-section-image><img src="https://example.com/b.png" onclick="this.parentElement.classList.add('se-is-selected')"></div></div></div><button onclick="if(document.querySelectorAll('.se-component-content-extend').length!==2)throw Error('누락');recordReady().then(()=>window.close())">등록</button>`);
  const logs=[];await commitSmartstoreEditor(page,editor,2,{log:x=>logs.push(x)});
  assert.equal(registered,true);assert.ok(logs.some(x=>x.includes('누락 1장만 보정')));
 }finally{await browser.close();}
});
test('배너 파일을 대조한 뒤 그 이미지 하나에만 스토어 링크를 입력한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();
  await page.setContent(`<style>img{display:block;width:300px;height:100px}</style><div class="se-component se-image"><a href="https://example.com/keep"><img src="https://example.com/main.png"></a></div><div class="se-component se-image"><a id=banner><img src="https://example.com/banner.png"></a></div><button data-name=image-link onclick="document.querySelector('#popup').hidden=false">링크</button><div id=popup hidden><input type=url placeholder=URL><button onclick="document.querySelector('#banner').href=document.querySelector('input').value;document.querySelector('#popup').hidden=true">적용</button></div>`);
  const parts={files:['main.png','banner.png'],bannerLink:{index:1,file:'banner.png',url:STORE_BANNER_URL}};
  await applySmartstoreBannerLink(page,parts);
  assert.equal(await page.locator('#banner').getAttribute('href'),STORE_BANNER_URL);
  assert.equal(await page.locator('a').first().getAttribute('href'),'https://example.com/keep');
  await assert.rejects(applySmartstoreBannerLink(page,{...parts,bannerLink:{...parts.bannerLink,file:'wrong.png'}}),/確認|확인/);
 }finally{await browser.close();}
});
