import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('오늘 누적 품번 카드에서 대기와 저장 완료를 갱신하고 경로를 표시한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.route('https://register.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="websiteUpdateSummary"></div><div id="websiteUpdateList"></div>'}));await page.goto('https://register.test/');
  await page.addScriptTag({content:await readFile('public/website-daily.js','utf8')});
  const source=(await readFile('public/app.js','utf8')).split('const $=id=>')[0];await page.addScriptTag({content:source+'\nconst $=id=>document.getElementById(id);'});
  const now=new Date().toISOString(),url='https://www.giordano.co.kr/shop/detail.php?pno='+'a'.repeat(32);
  const website={checkedAt:now,intervalMinutes:25,batches:[{checkedAt:now,events:[{type:'new',newProductVerified:true,style:'확인 필요',name:'검증용 상품',sourceUrl:url,firstCheckedAt:now}]}]};
  const research={items:[{style:'123456',sourceUrl:url,status:'queued'}]};
  await page.evaluate(({website,research})=>renderWebsiteUpdates(website,false,research),{website,research});await page.getByRole('button',{name:'신상품 1건',exact:true}).click();
  assert.match(await page.locator('#websiteUpdateList').innerText(),/품번 123456/);assert.match(await page.locator('#websiteUpdateList').innerText(),/수집 대기/);
  Object.assign(research.items[0],{status:'complete',pointCount:3,finishedAt:now,folder:'D:/research/123456'});
  await page.evaluate(({website,research})=>renderWebsiteUpdates(website,false,research),{website,research});
  const text=await page.locator('#websiteUpdateList').innerText();assert.match(text,/폴더 저장 완료 · 소구점 3개/);assert.match(text,/저장 폴더: D:\/research\/123456/);
  assert.equal(await page.getByRole('button',{name:'신상품 1건',exact:true}).count(),1);
 }finally{await browser.close();}
});
