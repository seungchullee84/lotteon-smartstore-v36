import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';

test('HTML 탭이 반응하지 않아도 편집기 API로 교체하고 저장 필드를 동기화',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://editor.test/**',route=>{
      const skin=route.request().url().includes('SmartEditor2Skin');
      return route.fulfill({contentType:'text/html',body:skin?'<button class="se2_to_html">HTML</button><textarea class="se2_input_htmlsrc" style="display:none"></textarea>':`<textarea id="ir1"></textarea><iframe src="https://editor.test/SmartEditor2Skin.html"></iframe><script>let content='';window.oEditors={getById:{ir1:{setIR:html=>content=html,getIR:()=>content,exec:()=>document.querySelector('textarea').value=content}}};</script>`});
    });
    await page.setContent('<iframe style="width:600px;height:300px" src="https://editor.test/SmartEditor2.html"></iframe>');
    const bot=new LotteAutomation('',()=>{});bot.page=page;
    const product={images:{detail:'https://example.test/detail.jpg',info:'https://example.test/info.jpg'}};
    await bot.fillHTML(product);await bot.fillHTML(product);
    const owner=page.frames().find(f=>f.url().endsWith('/SmartEditor2.html'));
    const stored=await owner.locator('#ir1').inputValue();
    assert.equal((stored.match(/<img /g)||[]).length,2);
    assert.match(stored,/info\.jpg/);
  }finally{await browser.close();}
});

test('숨겨진 이전 편집기를 건너뛰고 느린 HTML 모드 전환을 한 번만 실행',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://editor.test/**',route=>route.fulfill({contentType:'text/html',body:`
      <button class="se2_to_html" onclick="window.clicks=(window.clicks||0)+1;setTimeout(()=>document.querySelector('textarea').style.display='block',1800)">HTML</button>
      <textarea class="se2_input_htmlsrc" style="display:none"></textarea>
      <button class="se2_to_editor" onclick="window.result=document.querySelector('textarea').value;document.querySelector('textarea').style.display='none'">Editor</button>`}));
    await page.setContent('<iframe style="display:none" src="https://editor.test/SmartEditor2Skin.html"></iframe><iframe src="https://editor.test/SmartEditor2Skin.html?active=1"></iframe>');
    const active=page.frames().find(f=>f.url().includes('active=1'));
    const bot=new LotteAutomation('',()=>{});bot.page=page;
    await bot.fillHTML({images:{detail:'https://example.test/detail.jpg'}});
    assert.equal(await active.evaluate(()=>window.clicks),1);
    assert.match(await active.evaluate(()=>window.result),/detail\.jpg/);
    const hidden=page.frames().find(f=>f.url().endsWith('SmartEditor2Skin.html'));
    assert.equal(await hidden.locator('textarea').inputValue(),'');
    await active.locator('textarea').evaluate(e=>e.style.display='block');
    await bot.fillHTML({images:{detail:'https://example.test/updated.jpg'}});
    assert.equal(await active.evaluate(()=>window.clicks),1);
    assert.match(await active.evaluate(()=>window.result),/updated\.jpg/);
  }finally{await browser.close();}
});
