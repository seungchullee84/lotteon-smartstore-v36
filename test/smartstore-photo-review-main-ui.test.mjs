import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

test('브라우저의 이전 자동 대표 선택은 재저장하지 않고 새 명시적 선택과 해제를 복원한다',async()=>{
 const js=await readFile(new URL('../public/smartstore-photo-review.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../public/smartstore-photo-review.css',import.meta.url),'utf8');
 const browser=await chromium.launch({headless:true});
 try{
  for(const scenario of [
   {applied:null,local:'a',version:undefined,expected:null},
   {applied:'b',local:'a',version:undefined,expected:'b'},
   {applied:'b',local:'a',version:2,expected:'a'},
   {applied:'b',local:null,version:2,expected:null},
  ]){
   const page=await browser.newPage();page.setDefaultTimeout(5000);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const data={style:'123456',sourceUrl:'https://example.invalid/product',revision:'one',colors:['01블랙'],mainId:scenario.applied,
    items:['a','b'].map(id=>({id,name:id==='a'?'1.jpg':'chosen.jpg',color:'',role:'detail',main:id===scenario.applied}))};
   const local={...data,mainId:scenario.local,mainSelectionVersion:scenario.version,savedAt:'2026-11-15T12:00:00Z',
    items:[...data.items].reverse().map(item=>({...item,color:'01블랙',colorOverride:true}))};
   await page.addInitScript(selection=>localStorage.setItem('smartstore.photo-selection.v1.'+selection.style,JSON.stringify(selection)),local);
   let saved;
   await page.route('http://review.test/**',async route=>{
    const url=new URL(route.request().url());let body={},contentType='application/json';
    if(url.pathname==='/'){contentType='text/html';body='<meta charset="utf-8"><div id="photoPreparationStatus"></div><div id="error"></div><script>window.activeChannel=()=>"smartstore";</script><script src="/smartstore-photo-review.js"></script>';}
    else if(url.pathname==='/smartstore-photo-review.js'){body=js;contentType='text/javascript';}
    else if(url.pathname==='/smartstore-photo-review.css'){body=css;contentType='text/css';}
    else if(url.pathname==='/api/state')body={busy:false,product:{style:data.style}};
    else if(url.pathname==='/api/smartstore-photo-review')body=data;
    else if(url.pathname==='/api/smartstore-point-picker')body={style:data.style,candidates:[],selectedIds:[],message:''};
    else if(url.pathname==='/api/smartstore-photo-review-draft'){saved=route.request().postDataJSON();body={savedAt:new Date().toISOString()};}
    else if(url.pathname.startsWith('/smartstore-review-photo/')){contentType='image/png';body=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOt0AAAAASUVORK5CYII=','base64');}
    await route.fulfill({status:200,contentType,body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});
   });
   await page.goto('http://review.test/');
   const restored=page.waitForResponse(response=>response.url().endsWith('/api/smartstore-photo-review-draft'));
   await page.locator('#manualPhotoReviewOpen').click();await restored;
   assert.equal(saved.mainId,scenario.expected,JSON.stringify(scenario));
   assert.equal(saved.mainSelectionVersion,2);
   assert.deepEqual(saved.items.map(item=>item.id),['b','a'],'이전 색상·순서 선택을 유지한다');
   assert(saved.items.every(item=>item.color==='01블랙'));
   const checked=await page.locator('#manualPhotoReviewGrid input[type=radio]:checked').evaluateAll(inputs=>inputs.map(input=>input.closest('[data-photo-id]').dataset.photoId));
   assert.deepEqual(checked,scenario.expected?[scenario.expected]:[]);
   const stored=await page.evaluate(style=>JSON.parse(localStorage.getItem('smartstore.photo-selection.v1.'+style)),data.style);
   assert.equal(stored.mainSelectionVersion,2);assert.equal(stored.mainId,scenario.expected);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});
