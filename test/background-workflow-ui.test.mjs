import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

async function waitForPending(pending){
 for(let attempt=0;attempt<100&&!pending.length;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(pending.length,'준비 응답 대기 상태에 도달해야 한다');
}

function failedWork(work){
 return {...work,status:'error',attempt:3,maxAttempts:3,manualAvailable:true,message:'3차까지 보정했지만 배경 연결선이 남았습니다.',previews:[1,2,3].map(attempt=>({attempt,url:'/api/background-preview?jobId='+work.jobId+'&attempt='+attempt,reason:attempt+'차: 배경 연결선을 확인해 주세요.'}))};
}

async function fixture(browser,options={}){
 const page=await browser.newPage();page.setDefaultTimeout(5000);
 if(options.clock)await page.clock.install({time:new Date()});
 const errors=[],posts=[],pending=[],pendingComplete=[],pendingDispatch=[],pendingManual=[];
 page.on('pageerror',error=>errors.push(error.message));
 const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=background',rawName:'공식 상품',name:'남성 공식 상품',gender:'남성',consumerPrice:29900,colors:['01검정'],sizes:['M'],material:'면',country:'대한민국',manufactured:'2026-01',washing:'손세탁',keywords:'지오다노,티셔츠',category:{},images:{main:'main.jpg',extra1:'extra1.jpg',extra2:'extra2.jpg'},warnings:[]};
 const control={defer:false,deferComplete:false,deferDispatch:false,cached:false,selection:'main',busy:false,stateReads:0,backgroundWork:null,dispatchResult:null};
 await page.addInitScript(()=>{
  window.copies=[];
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.copies.push(value)}});
 });
 await page.route('http://background.test/**',async route=>{
  const url=new URL(route.request().url());let body={},contentType='application/json';
  if(route.request().method()==='POST')posts.push({path:url.pathname,body:route.request().postDataJSON()});
  if(url.pathname==='/api/state'){
   control.stateReads++;
   body={busy:control.busy,phase:control.busy?'collect':'idle',logs:[],revision:1,product,backgroundSelection:control.selection,imageVersions:control.imageVersions||{},backgroundWork:control.backgroundWork};
  }else if(url.pathname==='/api/branding')body={visible:false};
  else if(url.pathname==='/api/naver-status')body={configured:false};
  else if(url.pathname==='/api/smartstore-two-choice')body={packages:[]};
  else if(url.pathname==='/api/naver-keywords')body={keywords:product.keywords,length:product.keywords.length,source:'모의 응답',period:{startDate:'2026-11-01',endDate:'2026-11-15'}};
  else if(url.pathname==='/api/background-selection'){control.selection=route.request().postDataJSON().key;body={ok:true};}
  else if(url.pathname==='/api/background-cancel'){
   if(control.backgroundWork?.requestId===route.request().postDataJSON().requestId)control.backgroundWork={...control.backgroundWork,status:'cancelled',message:'합성을 취소했습니다.'};
   body={ok:true};
  }
  else if(url.pathname==='/api/background-prepare'){
   if(control.defer)await new Promise(resolve=>pending.push(resolve));
   body=control.cached?{ok:true,cached:true,applied:false,jobId:'cached-job',message:'동일 원본의 완료된 합성을 찾았습니다.'}:{ok:true,cached:false,jobId:'test-job'};
  }else if(url.pathname==='/api/background-dispatch'){
   if(control.deferDispatch)await new Promise(resolve=>pendingDispatch.push(resolve));
   const prepared=posts.filter(item=>item.path==='/api/background-prepare').at(-1).body;
   control.backgroundWork={jobId:'test-job',requestId:prepared.requestId,style:prepared.style,sourceUrl:prepared.sourceUrl,key:prepared.key,status:'waiting',message:'합성을 시작했습니다.',startedAt:Date.now()};
   body=control.dispatchResult||{ok:true,started:true,message:'합성을 시작했습니다.'};
  }else if(url.pathname==='/api/background-complete'){
   if(control.deferComplete)await new Promise(resolve=>pendingComplete.push(resolve));
   if(control.completeWaiting){
    const prepared=posts.filter(item=>item.path==='/api/background-prepare').at(-1).body;
    control.backgroundWork={jobId:'cached-job',requestId:prepared.requestId,style:prepared.style,sourceUrl:prepared.sourceUrl,key:prepared.key,status:'applying-wait',message:'합성 완료 · 다른 작업이 끝나면 대표이미지에 적용합니다.',startedAt:Date.now()};
    body={ok:true,waiting:true,jobId:'cached-job',message:control.backgroundWork.message};
   }else body={ok:true,cached:true,file:'main-composite.jpg',elapsedMs:12,message:'동일 원본의 완료된 합성을 대표이미지에 적용했습니다.'};
  }else if(url.pathname==='/api/background-preview'){
   body=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOt0AAAAASUVORK5CYII=','base64');contentType='image/png';
  }else if(url.pathname==='/api/background-apply-preview'){
   if(control.deferManual)await new Promise(resolve=>pendingManual.push(resolve));
   const selected=route.request().postDataJSON();
   control.backgroundWork={...control.backgroundWork,status:control.manualWaiting?'applying-wait':'complete',manual:true,selectedAttempt:selected.attempt,message:control.manualWaiting?'합성 완료 · 다른 작업이 끝나면 대표이미지에 적용합니다.':'선택한 결과를 대표이미지에 적용했습니다.'};
   body={ok:true,waiting:!!control.manualWaiting,message:control.backgroundWork.message};
   if(!control.manualWaiting)control.imageVersions={main:'manual-result'};
  }else if(!url.pathname.startsWith('/api/')){
   const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(/^[a-z0-9-]+\.(html|js|mjs|css|png)$/.test(name)){
    try{body=await readFile(new URL('../'+(name==='smartstore-title.mjs'?name:'public/'+name),import.meta.url));contentType=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript';
     if(name==='index.html'&&control.restoredInput)body=body.toString().replace('</body>','<script>document.querySelector("#style").value='+JSON.stringify(control.restoredInput)+'</script></body>');
    }
    catch{body='';contentType='text/plain';}
   }else{body=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOt0AAAAASUVORK5CYII=','base64');contentType='image/png';}
  }
  await route.fulfill({status:200,contentType,body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});
 });
 await page.goto('http://background.test/');
 await page.waitForFunction(()=>document.querySelector('#source').textContent.includes('123456'));
 await page.locator('#style').fill(product.style);
 await page.locator('#extendBackground').click();
 return {page,posts,pending,pendingComplete,pendingDispatch,pendingManual,control,errors,product};
}

test('합성 진행은 준비·실행·작업 중 중복 클릭을 막고 완료된 결과만 다시 실행할 수 있다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,pending,pendingDispatch,control,errors,product}=await fixture(browser);
  assert.equal(await page.locator('#openBackgroundRequest').textContent(),'합성 진행');
  assert.doesNotMatch(await page.locator('#backgroundDialog').textContent(),/복사|붙여넣/);
  control.defer=true;control.deferDispatch=true;
  const started=page.waitForRequest(request=>request.url().endsWith('/api/background-prepare'));
  await page.locator('#openBackgroundRequest').evaluate(button=>{button.click();button.click();});await started;await waitForPending(pending);
  await page.waitForFunction(()=>document.querySelector('#openBackgroundRequest').disabled);
  assert.equal(posts.filter(item=>item.path==='/api/background-prepare').length,1);
  const prepared=posts.find(item=>item.path==='/api/background-prepare').body;
  assert.equal(prepared.style,product.style);assert.equal(prepared.sourceUrl,product.sourceUrl);assert.equal(prepared.revision,1);assert.ok(prepared.requestId);
  await page.locator('#style').evaluate(field=>field.dispatchEvent(new Event('input',{bubbles:true})));
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0,'값이 그대로인 input 이벤트는 취소하지 않는다');
  control.defer=false;pending.shift()();
  await waitForPending(pendingDispatch);
  await page.locator('#openBackgroundRequest').evaluate(button=>{button.click();button.click();});
  assert.deepEqual(posts.filter(item=>item.path==='/api/background-dispatch').map(item=>item.body),[{jobId:'test-job'}]);
  control.deferDispatch=false;pendingDispatch.shift()();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  for(const status of ['waiting','generating','processing','review']){
   control.backgroundWork={...control.backgroundWork,status,message:status+' 단계 진행 중'};
   await page.evaluate(()=>refresh());
   assert.equal(await page.locator('#backgroundStatus').textContent(),status+' 단계 진행 중');
   assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),true);
   assert.equal(await page.locator('#backgroundImageChoice').isDisabled(),false,'사진을 바꿔 진행 중 작업을 취소할 수 있다');
   await page.locator('#openBackgroundRequest').evaluate(button=>button.click());
  }
  assert.equal(posts.filter(item=>item.path==='/api/background-prepare').length,1);
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,1);
  control.backgroundWork={...control.backgroundWork,status:'complete',message:'합성 완료'};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
  control.cached=true;const stateReads=control.stateReads;
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('동일 원본'));
  await page.waitForFunction(()=>!document.querySelector('#openBackgroundRequest').disabled);
  assert.ok(control.stateReads>stateReads);
  assert.deepEqual(posts.filter(item=>item.path==='/api/background-complete').map(item=>item.body),[{jobId:'cached-job',reuse:true}]);
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,1,'캐시 적용은 worker를 실행하지 않는다');
  assert.deepEqual(await page.evaluate(()=>window.copies),[],'합성은 클립보드를 사용하지 않는다');
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

test('품번·선택 사진 변경 후 되돌아와도 이전 합성 응답을 폐기한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [change,cached] of [['style',false],['image',false],['style',true],['image',true]]){
   const {page,posts,pending,control,errors}=await fixture(browser);control.defer=true;control.cached=cached;
   const started=page.waitForRequest(request=>request.url().endsWith('/api/background-prepare'));
   await page.locator('#openBackgroundRequest').click();await started;await waitForPending(pending);
   const oldId=posts.find(item=>item.path==='/api/background-prepare').body.requestId;
   const cancelled=page.waitForRequest(request=>request.url().endsWith('/api/background-cancel'));
   if(change==='style')await page.locator('#style').evaluate(field=>{field.value='654321';field.dispatchEvent(new Event('input',{bubbles:true}));field.value='123456';field.dispatchEvent(new Event('input',{bubbles:true}));});
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
   assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,0,'변경된 준비 응답으로 worker를 실행하지 않는다');
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

test('실패·취소 상태는 다시 활성화하고 이전 작업 상태는 새 작업의 잠금을 풀지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,control,errors}=await fixture(browser);
  for(const status of ['error','cancelled']){
   await page.locator('#openBackgroundRequest').click();
   await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
   const current=control.backgroundWork;
   control.backgroundWork={...current,requestId:'older-request',status:'complete',message:'이전 작업 완료'};
   await page.evaluate(()=>refresh());
   assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),true);
   assert.doesNotMatch(await page.locator('#backgroundStatus').textContent(),/이전 작업 완료/);
   control.backgroundWork={...current,status,message:status+' 상태'};
   await page.evaluate(()=>refresh());
   assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
   assert.equal(await page.locator('#backgroundStatus').textContent(),status+' 상태');
  }
  control.dispatchResult={ok:false,started:false,message:'합성을 시작하지 못했습니다.'};
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('시작하지 못했습니다'));
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false,'실행 실패 후 남은 waiting 상태로 다시 잠그지 않는다');
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,3);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('새로고침은 실행 중 작업을 복원하고 품번 변경은 같은 요청을 한 번 취소한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,control,errors}=await fixture(browser);
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  const requestId=control.backgroundWork.requestId;
  control.backgroundWork={...control.backgroundWork,status:'generating',message:'배경 생성 중'};
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#source').textContent.includes('123456'));
  await page.locator('#extendBackground').click();
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),true);
  assert.equal(await page.locator('#backgroundStatus').textContent(),'배경 생성 중');
  await page.locator('#openBackgroundRequest').evaluate(button=>button.click());
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,1);
  const cancelled=page.waitForRequest(request=>request.url().endsWith('/api/background-cancel'));
  await page.locator('#style').evaluate(field=>{field.value='654321';field.dispatchEvent(new Event('input',{bubbles:true}));});
  await cancelled;
  await page.evaluate(()=>refresh());await page.evaluate(()=>refresh());
  assert.deepEqual(posts.filter(item=>item.path==='/api/background-cancel').map(item=>item.body),[{requestId}]);
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('새로고침 시 입력 품번·출처·사진이 달라진 작업을 복원하지 않고 한 번 취소한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const changed of ['input','source','selection']){
   const {page,posts,control,product,errors}=await fixture(browser);
   await page.locator('#openBackgroundRequest').click();
   await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
   const requestId=control.backgroundWork.requestId;
   if(changed==='input')control.restoredInput='654321';
   if(changed==='source')product.sourceUrl='https://www.giordano.co.kr/shop/detail.php?pno=changed';
   if(changed==='selection')control.selection='extra1';
   const cancelled=page.waitForRequest(request=>request.url().endsWith('/api/background-cancel'));
   await page.reload();await cancelled;
   await page.waitForFunction(()=>document.querySelector('#source').textContent.includes('123456'));
   await page.evaluate(()=>refresh());await page.evaluate(()=>refresh());
   assert.deepEqual(posts.filter(item=>item.path==='/api/background-cancel').map(item=>item.body),[{requestId}],changed);
   assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,1);
   assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});

test('실행 응답을 기다리는 동안 사진을 변경하면 늦은 응답으로 진행 상태를 되살리지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,pendingDispatch,control,errors}=await fixture(browser);control.deferDispatch=true;
  await page.locator('#openBackgroundRequest').click();await waitForPending(pendingDispatch);
  await page.locator('#backgroundImageChoice').selectOption('extra1');
  await page.waitForFunction(()=>!document.querySelector('#backgroundImageChoice').disabled);
  const received=page.waitForResponse(response=>response.url().endsWith('/api/background-dispatch'));
  pendingDispatch.shift()();await received;
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
  assert.doesNotMatch(await page.locator('#backgroundStatus').textContent(),/합성을 시작했습니다/);
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,1);
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('합성 창을 닫아도 단계·경과 시간과 완료·실패 상태가 계속 보이고 다른 보기 작업을 막지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,pending,control,errors}=await fixture(browser);control.defer=true;
  await page.locator('#openBackgroundRequest').click();await waitForPending(pending);
  await page.locator('#closeBackground').click();
  assert.equal(await page.locator('#backgroundProgress').isVisible(),true);
  assert.match(await page.locator('#backgroundProgressHeading').textContent(),/합성 진행 중.*원본 확인/);
  assert.match(await page.locator('#extendBackground').textContent(),/합성 진행 중/);
  assert.equal(await page.locator('#extendBackground').isDisabled(),false);
  assert.equal(await page.locator('#downloadMain1500').isDisabled(),false);
  assert.equal(await page.locator('#style').isDisabled(),false);
  assert.match(await page.locator('#backgroundProgressHint').textContent(),/품번이나 합성 사진.*취소/);
  assert.equal(await page.locator('#backgroundProgressElapsed').isVisible(),false,'시작 시각이 없으면 경과 시간을 만들지 않는다');
  control.defer=false;pending.shift()();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  const startedAt=Date.now()-61000;
  control.backgroundWork={...control.backgroundWork,status:'generating',message:'배경 생성 중',startedAt};
  await page.evaluate(()=>refresh());
  assert.match(await page.locator('#backgroundProgressHeading').textContent(),/배경 생성/);
  assert.match(await page.locator('#backgroundProgressElapsed').textContent(),/경과 1분 [12]초/);
  assert.doesNotMatch(await page.locator('#backgroundProgress').textContent(),/%/);
  control.backgroundWork={...control.backgroundWork,attempt:2,maxAttempts:3,message:'배경 경계선을 보정하고 다시 생성합니다.'};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#backgroundProgressHeading').textContent(),'합성 보정 재시도 중 · 2/3회');
  assert.match(await page.locator('#backgroundProgressMessage').textContent(),/배경 경계선/);
  assert.match(await page.locator('#backgroundProgressElapsed').textContent(),/경과 1분 [12]초/,'재시도에도 같은 시작 시각을 사용한다');
  await page.setViewportSize({width:390,height:700});
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const visible=await page.locator('#backgroundProgress').boundingBox();
  assert.ok(visible.y>=0&&visible.y<20&&visible.x>=0&&visible.x+visible.width<=390,'좁은 화면에서도 상단에 남고 가로로 넘치지 않는다');
  assert.equal(await page.locator('#backgroundProgress').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  for(const status of ['review','complete','error','cancelled']){
   control.backgroundWork={...control.backgroundWork,status,message:status+' 결과',elapsedMs:65000};
   await page.evaluate(()=>refresh());
   assert.equal(await page.locator('#backgroundProgress').isVisible(),true);
   assert.match(await page.locator('#backgroundProgressMessage').textContent(),new RegExp(status+' 결과'));
   if(status!=='review'){
    assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
    assert.equal(await page.locator('#backgroundProgressElapsed').textContent(),'소요 1분 5초');
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('현재 상품의 완료·실패 상태는 새로고침 후에도 표시하고 다른 탭의 최신 종료 작업으로 잠금을 해제한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,control,errors}=await fixture(browser);
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  const older=control.backgroundWork;
  control.backgroundWork={...older,jobId:'other-tab-job',requestId:'other-tab-request',startedAt:older.startedAt+1,status:'error',message:'최종 검수에서 배경 연결부를 확인해 주세요.',elapsedMs:32000};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
  assert.equal(await page.locator('#backgroundProgress').getAttribute('data-status'),'error');
  assert.match(await page.locator('#backgroundProgressMessage').textContent(),/배경 연결부/);
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0,'다른 탭의 최신 종료 상태를 읽으며 취소 요청을 보내지 않는다');
  for(const status of ['error','complete']){
   control.backgroundWork={...control.backgroundWork,status,message:status+' 확인'};
   await page.reload();
   await page.waitForFunction(()=>document.querySelector('#source').textContent.includes('123456'));
   assert.equal(await page.locator('#backgroundProgress').getAttribute('data-status'),status);
   assert.equal(await page.locator('#backgroundProgress').isVisible(),true);
   assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('합성 중 다른 작업이 시작되어도 취소하지 않고 적용 대기 상태에서 완료를 기다린다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,pendingDispatch,control,errors}=await fixture(browser);control.deferDispatch=true;
  await page.locator('#openBackgroundRequest').click();await waitForPending(pendingDispatch);
  control.busy=true;await page.evaluate(()=>{requestLock=true;return refresh();});
  pendingDispatch.shift()();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0);
  assert.equal(await page.locator('#closeBackground').textContent(),'닫고 다른 작업하기');
  await page.locator('#closeBackground').click();
  await page.locator('#backgroundProgressOpen').click();
  assert.equal(await page.locator('#backgroundDialog').isVisible(),true,'다른 작업 중에도 진행 상황을 다시 볼 수 있다');
  control.backgroundWork={...control.backgroundWork,status:'applying-wait',message:'합성 완료 · 다른 작업이 끝나면 대표이미지에 적용합니다.'};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#backgroundProgressHeading').textContent(),'합성 완료 · 적용 대기');
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),true);
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0);
  control.busy=false;control.backgroundWork={...control.backgroundWork,status:'complete',message:'대표이미지에 적용했습니다.',elapsedMs:10000};
  await page.evaluate(()=>{requestLock=false;return refresh();});
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
  assert.equal(await page.locator('#backgroundProgressHeading').textContent(),'합성 완료');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('캐시 결과도 다른 작업이 끝날 때까지 적용 대기로 표시하고 서버 상태로 완료한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,control,errors}=await fixture(browser);control.cached=true;control.completeWaiting=true;
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundProgress').dataset.status==='applying-wait');
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),true);
  assert.doesNotMatch(await page.locator('#backgroundStatus').textContent(),/적용했습니다/);
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,0);
  control.backgroundWork={...control.backgroundWork,status:'complete',message:'완료된 합성을 대표이미지에 적용했습니다.',elapsedMs:2300};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),false);
  assert.equal(await page.locator('#backgroundProgressHeading').textContent(),'합성 완료');
  assert.equal(posts.filter(item=>item.path==='/api/background-complete').length,1,'적용 대기는 서버가 처리하고 브라우저는 반복 적용하지 않는다');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('같은 상품의 판매처를 바꿔도 합성과 상태 확인을 이어가며 스마트스토어 사진을 교체하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,pending,control,errors}=await fixture(browser);control.defer=true;
  await page.locator('#openBackgroundRequest').click();await waitForPending(pending);
  await page.locator('#closeBackground').click();
  await page.evaluate(()=>selectRegistrationChannel('smartstore'));
  control.defer=false;pending.shift()();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,1);
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0);
  assert.equal(await page.locator('#backgroundProgress').isVisible(),true);
  control.backgroundWork={...control.backgroundWork,status:'review',message:'완성본 검수 중'};
  await page.evaluate(()=>refresh());
  assert.match(await page.locator('#backgroundProgressHeading').textContent(),/완성본 검수/);
  await page.locator('#backgroundProgressOpen').click();
  assert.equal(await page.locator('#backgroundDialog').isVisible(),true);
  assert.equal(await page.locator('#backgroundImageChoice').isDisabled(),true);
  await page.locator('#closeBackground').click();
  control.imageVersions={main:'new-lotte-composite'};
  control.backgroundWork={...control.backgroundWork,status:'complete',message:'롯데 대표이미지에 적용했습니다.',elapsedMs:1000};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#backgroundProgressHeading').textContent(),'합성 완료');
  assert.equal(await page.locator('#main').getAttribute('src'),null,'스마트스토어 화면에 롯데 대표사진 src를 쓰지 않는다');
  assert.equal(await page.locator('#openBackgroundRequest').isDisabled(),true,'새 배경 합성은 롯데에서만 시작한다');
  await page.evaluate(()=>selectRegistrationChannel('lotte'));
  await page.waitForFunction(()=>!document.querySelector('#openBackgroundRequest').disabled);
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('종료 알림은 첫 표시 4초 후 사라지고 폴링·새로고침으로 다시 나타나지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,control,errors}=await fixture(browser,{clock:true});
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  await page.locator('#closeBackground').click();
  for(const status of ['error','complete','cancelled']){
   control.backgroundWork={...control.backgroundWork,status,message:status+' 종료'};
   await page.evaluate(()=>refresh());
   assert.equal(await page.locator('#backgroundProgress').isVisible(),true,status);
   await page.clock.fastForward(3000);await page.evaluate(()=>refresh());
   assert.equal(await page.locator('#backgroundProgress').isVisible(),true,'폴링해도 최초 표시 시간을 유지한다');
   await page.clock.fastForward(1100);
   assert.equal(await page.locator('#backgroundProgress').isVisible(),false,status);
   await page.evaluate(()=>refresh());await page.evaluate(()=>refresh());
   assert.equal(await page.locator('#backgroundProgress').isVisible(),false,'같은 종료 상태를 다시 표시하지 않는다');
   await page.reload();await page.waitForFunction(()=>document.querySelector('#source').textContent.includes('123456'));
   assert.equal(await page.locator('#backgroundProgress').isVisible(),false,'새로고침해도 알림을 되살리지 않는다');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('실패 회차의 이미지와 사유를 볼 수 있고 직접 선택한 결과만 대표이미지에 적용한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,control,errors}=await fixture(browser,{clock:true});
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  await page.locator('#closeBackground').click();
  const main=await page.locator('#main').getAttribute('src');
  control.backgroundWork=failedWork(control.backgroundWork);await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#backgroundDialog').isVisible(),false,'실패가 다른 작업 중 모달을 강제로 열지 않는다');
  assert.equal(await page.locator('#backgroundFailureCard').isVisible(),true);
  await page.waitForFunction(()=>document.querySelector('#backgroundFailureThumbnail').naturalWidth>0);
  await page.clock.fastForward(4100);await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#backgroundProgress').isVisible(),false);
  assert.equal(await page.locator('#backgroundFailureCard').isVisible(),true,'알림이 사라져도 실패 결과를 볼 수 있다');
  await page.locator('#viewBackgroundFailure').click();
  assert.equal(await page.locator('#backgroundFailureReview').isVisible(),true);
  assert.equal(await page.locator('#backgroundFailureAttempt').inputValue(),'3');
  assert.equal(await page.locator('#backgroundFailedImage').getAttribute('src'),'/api/background-preview?jobId=test-job&attempt=3');
  assert.match(await page.locator('#backgroundFailureReason').textContent(),/3차/);
  await page.locator('#backgroundFailureAttempt').selectOption('2');
  assert.match(await page.locator('#backgroundFailedImage').getAttribute('src'),/attempt=2$/);
  assert.match(await page.locator('#backgroundFailureReason').textContent(),/2차/);
  assert.equal(await page.locator('#main').getAttribute('src'),main,'실패 결과 조회는 현재 대표이미지를 바꾸지 않는다');
  assert.equal(posts.filter(item=>item.path==='/api/background-apply-preview').length,0);
  await page.locator('#applyBackgroundFailure').evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>document.querySelector('#backgroundProgress').dataset.status==='complete');
  await page.waitForFunction(()=>document.querySelector('#backgroundFailureCard').hidden);
  assert.deepEqual(posts.filter(item=>item.path==='/api/background-apply-preview').map(item=>item.body),[{jobId:'test-job',attempt:2,userApproved:true}]);
  assert.equal(posts.filter(item=>item.path==='/api/background-dispatch').length,1,'수동 적용은 새 이미지를 생성하지 않는다');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('실패 결과 수동 적용도 다른 작업 중에는 대기하고 이미지 없는 실패는 사유만 보여준다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,control,errors}=await fixture(browser);
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  control.backgroundWork=failedWork(control.backgroundWork);await page.evaluate(()=>refresh());
  control.busy=true;control.manualWaiting=true;await page.evaluate(()=>refresh());
  await page.locator('#applyBackgroundFailure').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundProgress').dataset.status==='applying-wait');
  assert.equal(await page.locator('#applyBackgroundFailure').isDisabled(),true);
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,0);
  control.busy=false;control.backgroundWork={...control.backgroundWork,status:'complete',message:'선택한 결과를 적용했습니다.'};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#backgroundFailureCard').isVisible(),false);
  assert.equal(posts.filter(item=>item.path==='/api/background-apply-preview').length,1);
  control.backgroundWork={...control.backgroundWork,status:'error',previews:[],manualAvailable:false,message:'이미지 생성 전에 작업이 종료되었습니다.'};
  await page.evaluate(()=>refresh());
  assert.equal(await page.locator('#backgroundFailureNoImage').isVisible(),true);
  assert.equal(await page.locator('#backgroundFailedImage').isVisible(),false);
  assert.equal(await page.locator('#applyBackgroundFailure').isVisible(),false);
  assert.match(await page.locator('#backgroundFailureReason').textContent(),/이미지 생성 전에/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('실패 결과 적용 응답을 기다리는 동안 품번이 바뀌면 이전 완료를 표시하거나 새로고침하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,pendingManual,control,errors}=await fixture(browser);
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  control.backgroundWork=failedWork(control.backgroundWork);await page.evaluate(()=>refresh());control.deferManual=true;
  await page.locator('#applyBackgroundFailure').click();await waitForPending(pendingManual);
  const cancelled=page.waitForRequest(request=>request.url().endsWith('/api/background-cancel'));
  await page.locator('#style').evaluate(field=>{field.value='654321';field.dispatchEvent(new Event('input',{bubbles:true}));});
  await cancelled;
  const reads=control.stateReads,received=page.waitForResponse(response=>response.url().endsWith('/api/background-apply-preview'));
  pendingManual.shift()();await received;await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
  assert.equal(control.stateReads,reads);
  assert.notEqual(await page.locator('#backgroundProgress').getAttribute('data-status'),'complete');
  assert.equal(await page.locator('#backgroundFailureCard').isVisible(),true,'같은 수집 상품의 이전 실패 결과는 조회할 수 있다');
  assert.equal(await page.locator('#applyBackgroundFailure').isDisabled(),true);
  assert.equal(posts.filter(item=>item.path==='/api/background-apply-preview').length,1);
  assert.equal(posts.filter(item=>item.path==='/api/background-cancel').length,1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('같은 상품에서 선택 사진을 바꿔도 이전 실패 결과는 보이며 적용은 막는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,posts,control,errors}=await fixture(browser);
  await page.locator('#openBackgroundRequest').click();
  await page.waitForFunction(()=>document.querySelector('#backgroundStatus').textContent.includes('합성을 시작했습니다'));
  control.backgroundWork=failedWork(control.backgroundWork);await page.evaluate(()=>refresh());
  const main=await page.locator('#main').getAttribute('src');
  await page.locator('#backgroundImageChoice').selectOption('extra2');
  await page.waitForFunction(()=>!document.querySelector('#backgroundImageChoice').disabled);
  control.backgroundWork={...control.backgroundWork,status:'error',manualAvailable:false,manualUnavailableReason:'사진 선택이나 원본 상태가 바뀌어 이 결과는 미리보기만 가능합니다.'};
  await page.evaluate(()=>refresh());
  await page.locator('#closeBackground').click();
  assert.equal(await page.locator('#backgroundFailureCard').isVisible(),true);
  await page.locator('#viewBackgroundFailure').click();
  assert.equal(await page.locator('#backgroundImageChoice').inputValue(),'extra2','실패 결과 조회가 현재 선택 사진을 바꾸지 않는다');
  assert.match(await page.locator('#backgroundOriginalHeading').textContent(),/추가이미지 2/);
  assert.match(await page.locator('#backgroundFailureSource').textContent(),/대표이미지/);
  assert.match(await page.locator('#backgroundFailedImage').getAttribute('src'),/attempt=3$/);
  assert.equal(await page.locator('#applyBackgroundFailure').isVisible(),true);
  assert.equal(await page.locator('#applyBackgroundFailure').isDisabled(),true);
  assert.match(await page.locator('#backgroundFailureApplyStatus').textContent(),/미리보기만/);
  await page.locator('#applyBackgroundFailure').evaluate(button=>button.click());
  assert.equal(posts.filter(item=>item.path==='/api/background-apply-preview').length,0);
  assert.equal(await page.locator('#main').getAttribute('src'),main);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#source').textContent.includes('123456'));
  assert.equal(await page.locator('#backgroundFailureCard').isVisible(),true,'새로고침 후에도 같은 상품의 이전 실패 결과를 볼 수 있다');
  await page.locator('#viewBackgroundFailure').click();
  assert.equal(await page.locator('#applyBackgroundFailure').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
