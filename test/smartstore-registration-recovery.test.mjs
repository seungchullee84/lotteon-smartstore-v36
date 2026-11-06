import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runSmartstoreAuto} from '../smartstore-auto.mjs';
import {SmartstoreAutomation} from '../smartstore-automation.mjs';
import {createSmartstoreRecovery} from '../smartstore-upload-recovery.mjs';
import {fillSmartstoreOptions,applySmartstoreBulkStock,readSmartstoreOptionRows,verifySmartstoreOptions,uploadSmartstoreImageSlot} from '../smartstore-form.mjs';

const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=fixture',
 name:'남성 라운드 티셔츠',smartstoreName:'남성 지오다노 라운드 티셔츠 123456',smartstoreNameUserEdited:true,consumerPrice:19900,
 colors:['01블랙','02크림'],sizes:['S','M'],material:'면 100%',country:'대한민국',washing:'손세탁',manufactured:'2026-10',images:{}};
const fixture=(options=product)=>`<meta charset="utf-8">
<input name="product.name"><input id=prd_price2>
<ui-view name=option>
 <label for=option_choice_type_true>설정함</label><input id=option_choice_type_true type=radio checked hidden>
 <label><input type=radio checked>직접 입력하기</label><label><input type=radio checked>조합형</label>
 <div><input ng-model="vm.choiceOptionNameCount"><div class=selectize-input>2개</div></div>
 <input id=choice_option_name0 value=컬러><input id=choice_option_name1 value=사이즈>
 <input id=choice_option_value0 value="${options.colors.join(',')}"><input id=choice_option_value1 value="${options.sizes.join(',')}">
 <div role=grid aria-rowcount="${options.colors.length*options.sizes.length+2}">
  <div class=ag-header><label><input class=ag-selection-checkbox type=checkbox onchange="for(const row of document.querySelectorAll('[row-index]'))row.classList.toggle('ag-row-selected',this.checked)"></label></div>
  ${options.colors.flatMap(color=>options.sizes.map(size=>({color,size}))).map(({color,size},i)=>'<div role=row row-index='+i+'><span tabindex=0 role=gridcell col-id=optionName1>'+color+'</span><span col-id=optionName2>'+size+'</span><span col-id=stockQuantity>10</span></div>').join('')}
 </div>
 <input ng-model="vm.bulkStockQuantity" value=10>
 <button onclick="window.bulk++;setTimeout(()=>{for(const cell of document.querySelectorAll('[col-id=stockQuantity]'))cell.textContent='10';},300)">선택목록 일괄수정</button>
 <button onclick="window.rebuild++">옵션목록으로 적용</button>
</ui-view>
${['representImage','optionalImages','tagImages'].map(id=>'<ncp-product-temp-photo-infra-image-upload id='+id+'><button onclick="window.slot=this.parentElement;document.querySelector(\'[role=dialog]\').hidden=false">이미지 등록</button></ncp-product-temp-photo-infra-image-upload>').join('')}
<div role=dialog hidden><button onclick="document.querySelector('#chosen').click()">내 사진</button><input type=file multiple hidden id=chosen></div>
<input aria-label=품번><table aria-label="상품속성 선택 테이블"><tr><th>주요소재</th><td><input type=checkbox aria-label=면 checked></td></tr></table>
<div><select ng-model="vm.viewData.originAreaInfo.originAreaExposureType"><option>국산</option></select><div class=selectize-input>국산</div></div>
<input name="product.detailAttribute.manufactureDate" value=2026.10.01.>
<input id=prd><input id=prd_col><input id=prd_size><input id=prd_caution>
<label><input type=radio checked>직접입력</label><input ng-model="vm.dateText">
<input id=seller-code1 value="111111 기존코드"><input id=material-detail>
<button data-nclicks-code=descrip.sebtn onclick="window.open('https://sell.smartstore.naver.com/one-fixture')">편집기</button>
<button onclick="window.saved++">저장하기</button><button onclick="window.saved++">임시저장</button>
<script>
 window.bulk=0;window.rebuild=0;window.saved=0;window.files=[];
 document.querySelector('#chosen').onchange=e=>{
  for(const file of e.target.files){
   const img=document.createElement('img');img.src='https://phinf.pstatic.net/'+encodeURIComponent(file.name);
   window.slot.append(img);window.files.push(file.name);
  }
  e.target.value='';e.target.parentElement.hidden=true;
 };
</script>`;
const editorHtml=`<meta charset="utf-8"><style>img{width:120px;height:120px}.se-text-paragraph{min-height:1em}</style>
<button data-group=documentToolbar data-name=image onclick="document.querySelector('[role=dialog]').hidden=false">사진</button>
<div role=dialog hidden>내 사진 불러오기<button onclick="document.querySelector('#chosen').click()">내 사진</button><input type=file hidden id=chosen></div>
<div id=caret class="se-component se-text"><div class=se-text-paragraph tabindex=0><br></div></div>
<iframe id=input_buffer-fixture></iframe>
<button onclick="window.applied++">등록</button>
<script>
 window.applied=0;window.files=[];window.clears=0;
 document.querySelector('iframe').contentDocument.addEventListener('keydown',e=>{if(e.key==='Backspace')window.clears++;});
 document.querySelector('#chosen').onchange=e=>{
  const file=e.target.files[0],component=document.createElement('div');component.className='se-component se-image';
  component.innerHTML='<div class="se-component-content-fit"><img src="https://phinf.pstatic.net/'+encodeURIComponent(file.name)+'"></div>';
  document.querySelector('#caret').before(component);window.files.push(file.name);
  e.target.value='';e.target.parentElement.hidden=true;
 };
</script>`;

test('실패와 재개를 서로 다른 시간으로 남기고 이전 수집과 상세 제작을 다시 하지 않는다',async()=>{
 const checkpoint={},calls=[],timings=[];let fail=true;
 const deps={input:product.style,checkpoint,collect:async()=>{calls.push('collect');return {product,folder:'fixture'};},
  prepare:async p=>p,onPrepared:async()=>calls.push('preview'),preflight:async()=>calls.push('preflight'),
  verifyResume:async()=>calls.push('verify'),render:async()=>{calls.push('render');return {};},onTiming:(name,timing)=>timings.push([name,timing]),
  upload:async(p,f,{measure})=>measure('extraImages',async()=>{if(fail)throw Error('첨부 연결 끊김');return {editorPrepared:true,editorApplied:false};})};
 await assert.rejects(runSmartstoreAuto(deps),/연결 끊김/);
 assert(timings.some(([id,t])=>id==='extraImages'&&t.status==='error'&&t.ms>=0));
 fail=false;const result=await runSmartstoreAuto(deps);
 assert.deepEqual(calls,['collect','preview','preflight','render','verify','preflight']);
 assert.equal(result.published,false);
 assert(timings.some(([id,t])=>id==='extraImages'&&t.status==='done'));
});

test('모의 옵션 28개: 이미 맞는 재고는 갱신하지 않고, 일부 재고 오류는 일괄수정 한 번만 한다',async t=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),plan={colors:['01블랙','02크림','03그레이','04네이비'],sizes:['24','25','26','27','28','29','30'],expectedOptions:28,stockPerOption:10};
  await page.setContent(fixture(plan));
  let started=performance.now();await applySmartstoreBulkStock(page,plan);assert.equal(verifySmartstoreOptions(plan,await readSmartstoreOptionRows(page,plan)),28);
  const old=Math.round(performance.now()-started);
  await page.evaluate(()=>{window.bulk=0;window.rebuild=0;});
  started=performance.now();assert.equal(await fillSmartstoreOptions(page,plan),28);
  t.diagnostic('모의 옵션 28개 · 이전 경로 '+old+'ms / 불필요한 일괄수정 생략 '+Math.round(performance.now()-started)+'ms');
  assert.deepEqual(await page.evaluate(()=>[window.bulk,window.rebuild]),[0,0]);
  await page.locator('[col-id=stockQuantity]').nth(15).evaluate(n=>n.textContent='2');
  await assert.rejects(fillSmartstoreOptions(page,plan,{completed:true}),/재고가 바뀌었습니다/);
  assert.deepEqual(await page.evaluate(()=>[window.bulk,window.rebuild]),[0,0]);
  assert.equal(await fillSmartstoreOptions(page,plan),28);
  assert.deepEqual(await page.evaluate(()=>[window.bulk,window.rebuild]),[1,0]);
 }finally{await browser.close();}
});

for(const mode of ['copy','edit'])test(mode+' 모의 등록: 추가사진과 두 번째 상세에서 실패해도 이미 반영된 사진과 옵션을 재생성하지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-recovery-')),files=['main.jpg','extra.jpg','detail-1.png','detail-2.png'].map(name=>path.join(root,name));
 const browser=await chromium.launch({headless:true});
 try{
  await Promise.all(files.map(file=>writeFile(file,'fixture file')));
  const context=await browser.newContext();
  await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().includes('one-fixture')?editorHtml:fixture()}));
  const page=await context.newPage();await page.goto('https://sell.smartstore.naver.com/#/products/'+mode+'/42');
  const bot=new SmartstoreAutomation(root,()=>{}),run={};bot.context=context;bot.connectChrome=async()=>{};
  await bot.preflight(product,{run});
  let failAt='extraImages';
  const args={main:files[0],extras:[files[1]],detailParts:{files:files.slice(2),includeVideo:false},preserveTags:true,run,
   measure:async(name,fn)=>{if(name===failAt)throw Error('모의 중단: '+name);return fn();}};
  await assert.rejects(bot.uploadPrepared(product,root,args),/모의 중단: extraImages/);
  assert.deepEqual(await page.evaluate(()=>window.files),['main.jpg']);
  failAt='detailImage2';await bot.preflight(product,{run});
  await assert.rejects(bot.uploadPrepared(product,root,args),/모의 중단: detailImage2/);
  const editor=run.editor.binding.page;
  assert.deepEqual(await editor.evaluate(()=>window.files),['detail-1.png']);
  failAt=null;await bot.preflight(product,{run});
  const result=await bot.uploadPrepared(product,root,args);
  assert.deepEqual(await page.evaluate(()=>({files:window.files,bulk:window.bulk,rebuild:window.rebuild,saved:window.saved})),{files:['main.jpg','extra.jpg'],bulk:0,rebuild:0,saved:0});
  assert.deepEqual(await editor.evaluate(()=>({files:window.files,clears:window.clears,applied:window.applied})),{files:['detail-1.png','detail-2.png'],clears:1,applied:0});
  assert.equal(result.editorPrepared,true);assert.equal(result.editorApplied,false);assert.equal(result.verifiedOptions,4);
  await page.reload();
  await assert.rejects(bot.preflight(product,{run}),e=>e.code==='SMARTSTORE_RESUME_CHANGED');
  run.formBinding.dispose();run.editor.binding.dispose();
 }finally{
  await browser.close();await Promise.all([...files,path.join(root,'smartstore-auto-result.json')].map(file=>unlink(file).catch(()=>{})));await rmdir(root);
 }
});

test('업로드 응답 오류 후 같은 이름의 첨부가 확인되면 재첨부하지 않고, 개수만 같은 다른 파일은 거부한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({body:''}));
  await page.setContent('<ncp-product-temp-photo-infra-image-upload id=representImage><img src="https://phinf.pstatic.net/expected.jpg"><button onclick="window.deleted=true">이미지 삭제</button></ncp-product-temp-photo-infra-image-upload>');
  const receipt={cleared:true,submitted:true};
  await uploadSmartstoreImageSlot(page,'representImage',['expected.jpg'],{replaceImages:true,receipt});
  assert.equal(receipt.done,true);
  await page.locator('img').evaluate(n=>n.src='https://phinf.pstatic.net/different.jpg');
  await assert.rejects(uploadSmartstoreImageSlot(page,'representImage',['expected.jpg'],{replaceImages:true,receipt}),/중복 첨부/);
  assert.equal(await page.evaluate(()=>window.deleted),undefined);
 }finally{await browser.close();}
});

const uiTimeout=()=>Object.assign(Error('모의 일시 지연'),{name:'TimeoutError'});
test('일시 지연만 자동 재시도하며, 같은 구간은 한 번만 재시도하고 화면이 바뀌면 재입력하지 않는다',async()=>{
 let calls=0;
 const recover=createSmartstoreRecovery({check:()=>{},verify:async()=>{},limit:2});
 const alwaysLate=async()=>{calls++;throw uiTimeout();};
 await assert.rejects(recover('basic',alwaysLate),/일시 지연/);assert.equal(calls,2);
 await assert.rejects(recover('options',alwaysLate),/일시 지연/);assert.equal(calls,4);
 await assert.rejects(recover('mainImage',alwaysLate),/일시 지연/);assert.equal(calls,5);
 const guarded=createSmartstoreRecovery({check:()=>{},verify:async()=>{throw Error('다른 판매자 화면');}});
 await assert.rejects(guarded('extraImages',alwaysLate),/다른 판매자 화면/);assert.equal(calls,6);
 await assert.rejects(guarded('extraImages',async()=>{throw Error('다른 품번');}),/다른 품번/);
});

test('옵션명 표기의 공백이 달라도 읽고, 이미 요청한 옵션 조합이 불명확하면 새로 생성하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),plan={...product,expectedOptions:4,stockPerOption:10};
  await page.setContent(fixture().replace('직접 입력하기','직접입력하기'));
  assert.equal(await fillSmartstoreOptions(page,plan),4);
  await page.locator('[col-id=optionName1]').first().evaluate(n=>n.textContent='다른 조합');
  await assert.rejects(fillSmartstoreOptions(page,plan,{receipt:{listRequested:true}}),/중복 생성하지 않았습니다/);
  assert.deepEqual(await page.evaluate(()=>[window.bulk,window.rebuild]),[0,0]);
 }finally{await browser.close();}
});

test('이미지 등록 버튼의 직접 선택기와 응답 없는 내 사진 창의 해당 파일 입력란을 모두 처리한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-chooser-')),file=path.join(root,'expected.jpg');
 const browser=await chromium.launch({headless:true});
 try{
  await writeFile(file,'fixture');
  const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({body:''}));
  for(const mode of ['direct','scoped-input']){
   await page.setContent(fixture()+'<input hidden type="file" accept="image/*" onchange="window.otherInput=true">');
   await page.evaluate(mode=>{
    if(mode==='direct')document.querySelector('#representImage button').onclick=()=>{
     window.slot=document.querySelector('#representImage');document.querySelector('#chosen').click();
    };
    else document.querySelector('[role="dialog"] button').onclick=()=>{};
   },mode);
   const logs=[];
   await uploadSmartstoreImageSlot(page,'representImage',[file],{replaceImages:true,receipt:{},log:x=>logs.push(x)});
   assert.deepEqual(await page.evaluate(()=>window.files),['expected.jpg']);
   assert.equal(await page.evaluate(()=>window.otherInput),undefined);
   assert.equal(await page.locator('#optionalImages img').count(),0);
   assert.equal(logs.some(s=>s.includes('파일 입력란 사용')),mode==='scoped-input');
  }
 }finally{await browser.close();await unlink(file).catch(()=>{});await rmdir(root);}
});

test('한 번 시작하면 상품명 입력 지연과 상세 첨부 확인 지연을 스스로 복구하고 파일은 한 번만 보낸다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-auto-retry-')),files=['main.jpg','extra.jpg','detail-1.png','detail-2.png'].map(name=>path.join(root,name));
 const browser=await chromium.launch({headless:true});
 try{
  await Promise.all(files.map(file=>writeFile(file,'fixture file')));
  const context=await browser.newContext();
  await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().includes('one-fixture')?editorHtml:fixture()}));
  const page=await context.newPage();await page.goto('https://sell.smartstore.naver.com/#/products/copy/42');
  const logs=[],bot=new SmartstoreAutomation(root,x=>logs.push(x)),run={};
  bot.context=context;bot.connectChrome=async()=>{};await bot.preflight(product,{run});
  await page.locator('input[name="product.name"]').evaluate(n=>n.disabled=true);
  page.setDefaultTimeout(400);
  let verified=0;
  const result=await bot.uploadPrepared(product,root,{main:files[0],extras:[files[1]],detailParts:{files:files.slice(2),includeVideo:false},preserveTags:true,run,
   verifyRetry:async()=>{verified++;await page.locator('input[name="product.name"]').evaluate(n=>n.disabled=false);},
   measure:async(name,fn)=>{
    if(name==='detailImage1'){
     const editor=run.editor.binding.page,wait=editor.waitForFunction.bind(editor);
     editor.waitForFunction=async(predicate,arg,options)=>{
      const outcome=await wait(predicate,arg,options);
      if(arg?.name==='detail-1.png'){editor.waitForFunction=wait;throw uiTimeout();}
      return outcome;
     };
    }
    return fn();
   }});
  assert.equal(verified,2);assert.equal(result.editorPrepared,true);assert.equal(result.editorApplied,false);
  assert.deepEqual(await page.evaluate(()=>[window.files,window.saved,window.rebuild]),[['main.jpg','extra.jpg'],0,0]);
  assert.deepEqual(await run.editor.binding.page.evaluate(()=>[window.files,window.applied]),[['detail-1.png','detail-2.png'],0]);
  assert(logs.some(s=>s.includes('상품명·가격 자동 복구 완료')));
  assert(logs.some(s=>s.includes('상세이미지 1장째 자동 복구 완료')));
  run.formBinding.dispose();run.editor.binding.dispose();
 }finally{
  await browser.close();await Promise.all([...files,path.join(root,'smartstore-auto-result.json')].map(file=>unlink(file).catch(()=>{})));await rmdir(root);
 }
});
