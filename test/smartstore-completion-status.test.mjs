import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{chromium}from'playwright';import{smartstorePartLayout}from'../smartstore-detail-upload.mjs';
test('템플릿별 모든 상세 조각은 배너·하단 포함 문서 너비를 사용한다',()=>{for(const detailTemplate of [1,2])for(let index=0;index<6;index++)assert.equal(smartstorePartLayout({detailTemplate,bannerLink:{index:4},footerIndex:5},index),'fit');});
test('상세 교체 성공만 완료 표시하고 대기·실패·다른 작업은 표시하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<button id=smartstoreDetailOnly>상세설명만 교체</button>');
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),helper=source.slice(source.indexOf('function updateDetailOnlyCompletion('),source.indexOf('async function refresh(){'));
  const motion=source.slice(source.indexOf("function detailMotionContent("),source.indexOf("function announce("));await page.addScriptTag({content:"const $=id=>document.getElementById(id);"+motion+helper});
  for(const state of [{busy:true,phase:'smartstore-detail-only'},{busy:false,phase:'error',error:'실패',completedJob:'smartstore-detail-only'},{busy:false,phase:'done',completedJob:'collect'}]){
   await page.evaluate(s=>updateDetailOnlyCompletion(s),state);assert.equal(await page.locator('#detailOnlyCompletion').isVisible(),false);
  }
  await page.evaluate(()=>updateDetailOnlyCompletion({busy:false,phase:'done',completedJob:'smartstore-detail-only'}));
  assert.equal(await page.locator('#detailOnlyCompletion').isVisible(),true);assert.match(await page.locator('#detailOnlyCompletion').innerText(),/교체 완료/);assert.match(await page.locator('#detailOnlyCompletion').innerText(),/저장·등록 전/);
 }finally{await browser.close();}
});
