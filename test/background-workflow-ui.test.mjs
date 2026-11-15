import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

async function waitForPending(pending){
 for(let attempt=0;attempt<100&&!pending.length;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(pending.length,'준비 응답 대기 상태에 도달해야 한다');
}

async function fixture(browser){
 const page=await browser.newPage();page.setDefaultTimeout(5000);
 const errors=[],posts=[],pending=[],pendingComplete=[];
 page.on('pageerror',error=>errors.push(error.message));
 const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=background',rawName:'공식 상품',name:'남성 공식 상품',gender:'남성',consumerPrice:29900,colors:['01검정'],sizes:['M'],material:'면',country:'대한민국',manufactured:'2026-01',washing:'손세탁',keywords:'지오다노,티셔츠',category:{},images:{main:'main.jpg',extra1:'extra1.jpg',extra2:'extra2.jpg'},warnings:[]};
 const control={defer:false,deferComplete:false,cached:false,selection:'main',busy:false,stateReads:0};
 const prompt='job test-job · 원본 검수 후 내장 imagegen으로 생성하고 background-complete helper에 생성 파일 경로 전달';
 await page.addInitScript(()=>{
  window.copies=[];window.clipboardFails=false;
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{if(window.clipboardFails)throw Error('clipboard unavailable');window.copies.push(value);}}});
 });
 await page.route('http://background.test/**',async route=>{
  const url=new URL(route.request().url());let body={},contentType='application/json';
  if(route.request().method()==='POST')posts.push({path:url.pathname,body:route.request().postDataJSON()});
  if(url.pathname==='/api/state'){
   control.stateReads++;
   body={busy:control.busy,phase:control.busy?'collect':'idle',logs:[],revision:1,product,backgroundSelection:control.selection,imageVersions:{}};
  }else if(url.pathname==='/api/branding')body={visible:false};
  else if(url.pathname==='/api/naver-status')body={configured:false};
  else if(url.pathname==='/api/smartstore-two-choice')body={packages:[]};
  else if(url.pathname==='/api/naver-keywords')body={keywords:product.keywords,length:product.keywords.length,source:'모의 응답',period:{startDate:'2026-11-01',endDate:'2026-11-15'}};
  else if(url.pathname==='/api/background-selection'){control.selection=route.request().postDataJSON().key;body={ok:true};}
  else if(url.pathname==='/api/background-cancel')body={ok:true};
  else if(url.pathname==='/api/background-prepare'){
   if(control.defer)await new Promise(resolve=>pending.push(resolve));
   body=control.cached?{ok:true,cached:true,applied:false,jobId:'cached-job',message:'동일 원본의 완료된 합성을 찾았습니다.'}:{ok:true,cached:false,jobId:'test-job',prompt,message:'채팅에서 합성해 주세요.'};
  }else if(url.pathname==='/api/background-complete'){
   if(control.deferComplete)await new Promise(resolve=>pendingComplete.push(resolve));
   body={ok:true,cached:true,file:'main-composite.jpg',elapsedMs:12,message:'동일 원본의 완료된 합성을 대표이미지에 적용했습니다.'};
  }else if(!url.pathname.startsWith('/api/')){
   const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(/^[a-z0-9-]+\.(html|js|mjs|css|png)$/.test(name)){
    try{body=await readFile(new URL('../'+(name==='smartstore-title.mjs'?name:'public/'+name),import.meta.url));contentType=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript';}
    catch{body='';contentType='text/plain';}
   }else{body=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOt0AAAAASUVORK5CYII=','base64');contentType='image/png';}
  }
  await route.fulfill({status:200,contentType,body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});
 });
 await page.goto('http://background.test/');
 await page.waitForFunction(()=>document.querySelector('#source').textContent.includes('123456'));
 await page.locator('#style').fill(product.style);
 await page.locator('#extendBackground').click();
 return {page,posts,pending,pendingComplete,control,prompt,errors,product};
}

test('합성 준비는 중복 클릭을 막고 서버 프롬프트·캐시 적용·복사 대체 입력을 연결한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,pending,control,prompt,errors,product}=await fixture(browser);
  control.defer=true;
  const started=page.waitForRequest(request=>request.url().endsWith('/api/background-prepare'));
  await page.locator('#openBackgroundRequest').evaluate(button=>{button.click();button.click();});await started;await waitForPending(pending);
  await page.waitForFunction(()=>document.querySelector('#openBackgroundRequest').disabled);
  assert.equal(posts.filter(item=>item.path==='/api/background-prepare').length,1);
  const prepared=posts.find(item=>item.path==='/api/background-prepare').body;
  assert.equal(prepared.style,product.style);assert.equal(prepared.sourceUrl,product.sourceUrl);assert.equal(prepared.revision,1);assert.ok(prepared.requestId);
  await page.locator('#style').evaluate(field=>field.dispatchEvent(new Event('input',{bubbles:true})));
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0,'값이 그대로인 input 이벤트는 취소하지 않는다');
  control.defer=false;pending.shift()();
  await page.waitForFunction(()=>window.copies.length===1);
  assert.deepEqual(await page.evaluate(()=>window.copies),[prompt]);
  control.cached=true;const stateReads=control.stateReads;
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('동일 원본'));
  await page.waitForFunction(()=>!document.querySelector('#openBackgroundRequest').disabled);
  assert.ok(control.stateReads>stateReads);assert.equal(await page.evaluate(()=>window.copies.length),1);
  assert.deepEqual(posts.filter(item=>item.path==='/api/background-complete').map(item=>item.body),[{jobId:'cached-job',reuse:true}]);
  control.cached=false;await page.evaluate(()=>{window.clipboardFails=true;});
  await page.locator('#openBackgroundRequest').click();
  await page.locator('#backgroundChatFallback').waitFor();assert.equal(await page.locator('#backgroundChatFallback').inputValue(),prompt);
  const beforeBlocked=posts.filter(item=>item.path==='/api/background-prepare').length;
  await page.locator('#style').evaluate(field=>{field.value='654321';field.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#openBackgroundRequest').click();
  assert.match(await page.locator('#backgroundStatus').textContent(),/먼저 수집/);
  await page.locator('#style').evaluate(field=>{field.value='123456';field.dispatchEvent(new Event('input',{bubbles:true}));});
  control.busy=true;await page.evaluate(()=>refresh());
  await page.waitForFunction(()=>document.querySelector('#openBackgroundRequest').disabled);
  await page.locator('#openBackgroundRequest').evaluate(button=>button.click());
  assert.equal(posts.filter(item=>item.path==='/api/background-prepare').length,beforeBlocked,'다른 품번과 작업 중에는 준비 요청을 보내지 않는다');
  assert.equal(posts.filter(item=>/background-(?:generate|api)/.test(item.path)).length,0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('품번·채널·선택 사진 변경 후 되돌아와도 이전 합성 응답을 폐기한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [change,cached] of [['style',false],['channel',false],['image',false],['style',true],['channel',true],['image',true]]){
   const {page,posts,pending,control,errors}=await fixture(browser);control.defer=true;control.cached=cached;
   const started=page.waitForRequest(request=>request.url().endsWith('/api/background-prepare'));
   await page.locator('#openBackgroundRequest').click();await started;await waitForPending(pending);
   const oldId=posts.find(item=>item.path==='/api/background-prepare').body.requestId;
   const cancelled=page.waitForRequest(request=>request.url().endsWith('/api/background-cancel'));
   if(change==='style')await page.locator('#style').evaluate(field=>{field.value='654321';field.dispatchEvent(new Event('input',{bubbles:true}));field.value='123456';field.dispatchEvent(new Event('input',{bubbles:true}));});
   if(change==='channel')await page.evaluate(()=>{selectRegistrationChannel('smartstore');selectRegistrationChannel('lotte');});
   if(change==='image'){
    await page.locator('#backgroundImageChoice').selectOption('extra1');
    await page.waitForFunction(()=>!document.querySelector('#backgroundImageChoice').disabled);
    await page.locator('#backgroundImageChoice').selectOption('main');
    await page.waitForFunction(()=>!document.querySelector('#backgroundImageChoice').disabled);
   }
   await cancelled;assert.ok(posts.some(item=>item.path==='/api/background-cancel'&&item.body.requestId===oldId));
   control.defer=false;const received=page.waitForResponse(response=>response.url().endsWith('/api/background-prepare'));pending.shift()();await received;
   await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
   assert.equal(await page.evaluate(()=>window.copies.length),0,change);assert.equal(await page.locator('#backgroundChatFallback').count(),0);
   assert.equal(posts.filter(item=>item.path==='/api/background-complete').length,0,'변경된 준비 응답으로 캐시 적용을 요청하지 않는다');
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});

test('캐시 적용 응답을 기다리는 동안 품번을 바꾸면 성공 표시와 후속 새로고침을 생략한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,pendingComplete,control,errors}=await fixture(browser);
  control.cached=true;control.deferComplete=true;
  const started=page.waitForRequest(request=>request.url().endsWith('/api/background-complete'));
  await page.locator('#openBackgroundRequest').click();await started;await waitForPending(pendingComplete);
  const cancelled=page.waitForRequest(request=>request.url().endsWith('/api/background-cancel'));
  await page.locator('#style').evaluate(field=>{field.value='654321';field.dispatchEvent(new Event('input',{bubbles:true}));field.value='123456';field.dispatchEvent(new Event('input',{bubbles:true}));});
  await cancelled;
  const before=control.stateReads,received=page.waitForResponse(response=>response.url().endsWith('/api/background-complete'));
  pendingComplete.shift()();await received;await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
  assert.doesNotMatch(await page.locator('#backgroundStatus').textContent(),/적용했습니다/);
  assert.equal(control.stateReads,before);assert.equal(await page.evaluate(()=>window.copies.length),0);
  assert.equal(posts.filter(item=>item.path==='/api/background-complete').length,1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
