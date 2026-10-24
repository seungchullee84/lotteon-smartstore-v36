import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {insertSmartstoreVideo} from '../smartstore-detail-upload.mjs';
test('HTML 변환으로 영상만 삽입하고 남은 주소 문장은 완료로 처리하지 않음',async()=>{
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent(`<button data-name="shopping-html" onclick="document.querySelector('#panel').hidden=false">HTML</button><div id=panel hidden><textarea title="HTML 변환"></textarea><button onclick="const n=document.createElement('div');n.className='se-component se-oembed';document.body.append(n);document.querySelector('#panel').hidden=true">변환</button></div><div class="se-component se-text"></div>`);
await insertSmartstoreVideo(page);assert.equal(await page.locator('.se-oembed').count(),1);assert.doesNotMatch(await page.locator('.se-text').innerText(),/youtube/);assert.match(await page.locator('textarea').inputValue(),/youtube.com\/embed\/nRI2390T5GQ/);
await page.locator('.se-text').evaluate(n=>n.textContent='https://www.youtube.com/watch?v=nRI2390T5GQ');await assert.rejects(insertSmartstoreVideo(page),/영상 주소가 본문에 남아/);
}finally{await browser.close();}});
