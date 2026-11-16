import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOt0AAAAASUVORK5CYII=','base64');
async function waitForPending(queue){
 for(let n=0;n<100&&!queue.length;n++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(queue.length,'제어할 지연 응답이 있어야 한다');
}

async function fixture(browser,{legacy=false,points=null}={}){
 const [js,css]=await Promise.all(['smartstore-photo-review.js','smartstore-photo-review.css'].map(name=>readFile(new URL('../public/'+name,import.meta.url),'utf8')));
 const page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(5000);
 const data={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=quick',revision:'quick-one',roleSelectionVersion:2,colors:['01화이트','02블랙'],mainId:'a',items:[
  {id:'a',name:'main.jpg',color:'01화이트',role:'front',roleMode:'order',main:true},
  {id:'b',name:'side.jpg',color:'01화이트',role:'side',roleMode:'order',main:false},
  {id:'c',name:'detail.jpg',color:'01화이트',role:'detail',roleMode:'order',main:false},
  {id:'d',name:'black.jpg',color:'02블랙',role:'front',roleMode:'order',main:false},
  {id:'e',name:'label.jpg',color:'',role:'care-label',roleMode:'order',main:false},
 ]};
 if(legacy){delete data.roleSelectionVersion;for(const item of data.items){delete item.roleMode;item.roleOverride=true;}}
 const control={data,holdDraft:false,holdNextReview:false,applied:false};
 const errors=[],drafts=[],applies=[],pendingDraft=[],pendingReview=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://quick-review.test/**',async route=>{
  const request=route.request(),url=new URL(request.url());let body={},contentType='application/json';
  if(url.pathname==='/'){
   contentType='text/html';body='<meta charset="utf-8"><input id="style" value="123456"><button id="collect">수집</button><div id="photoPreparationStatus"></div><div id="error"></div><script>window.activeChannel=()=>"smartstore";</script><script src="/smartstore-photo-review.js"></script>';
  }else if(url.pathname==='/smartstore-photo-review.js'){body=js;contentType='text/javascript';}
  else if(url.pathname==='/smartstore-photo-review.css'){body=css;contentType='text/css';}
  else if(url.pathname==='/api/state')body={busy:false,phase:control.applied?'done':'idle',product:{style:control.data.style,sourceUrl:control.data.sourceUrl},photoPreparation:control.applied?{status:'ready'}:undefined};
  else if(url.pathname==='/api/smartstore-photo-review'&&request.method()==='GET'){
   body=structuredClone(control.data);
   if(control.holdNextReview){control.holdNextReview=false;await new Promise(resolve=>pendingReview.push(resolve));}
  }else if(url.pathname==='/api/smartstore-photo-review-draft'){
   const payload=request.postDataJSON();drafts.push(payload);
   if(control.holdDraft)await new Promise(resolve=>pendingDraft.push(resolve));
   if(payload.style===control.data.style&&payload.sourceUrl===control.data.sourceUrl&&payload.revision===control.data.revision){
    control.data.items=payload.items.map(item=>({...control.data.items.find(old=>old.id===item.id),...item,main:item.id===payload.mainId}));
    control.data.mainId=payload.mainId;control.data.selectionSavedAt=new Date().toISOString();
   }
   body={ok:true,savedAt:new Date().toISOString()};
  }else if(url.pathname==='/api/smartstore-photo-review'&&request.method()==='POST'){
   applies.push(request.postDataJSON());control.applied=true;body={ok:true};
  }else if(url.pathname==='/api/smartstore-point-picker')body={style:control.data.style,candidates:[],selectedIds:[],message:'',...points};
  else if(url.pathname==='/api/smartstore-point-selection')body={count:request.postDataJSON().selectedIds.length,previewReady:true};
  else if(url.pathname.startsWith('/smartstore-review-photo/')){body=pixel;contentType='image/png';}
  await route.fulfill({status:200,contentType,body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});
 });
 await page.goto('http://quick-review.test/');await page.locator('#manualPhotoReviewOpen').click();
 const cards=page.locator('#manualPhotoReviewGrid > [data-photo-id]');await cards.first().waitFor();
 const card=id=>page.locator('[data-photo-id="'+id+'"]');
 const ids=()=>cards.evaluateAll(nodes=>nodes.map(node=>node.dataset.photoId));
 const selected=()=>page.locator('[data-select-photo]:checked').evaluateAll(nodes=>nodes.map(node=>node.closest('[data-photo-id]').dataset.photoId));
 const saved=()=>page.waitForResponse(response=>response.url().endsWith('/api/smartstore-photo-review-draft'));
 return {page,control,errors,drafts,applies,pendingDraft,pendingReview,cards,card,ids,selected,saved};
}

test('사진 목록 앞에서 선택한 소구점과 공식 근거를 확인하고 반영한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const candidates=['부드러운 착용감','움직이기 편해요','가볍게 입어요'].map((title,index)=>({
   id:String(index),title,description:title,evidence:'공식 설명 '+index,
  }));
  const {page}=await fixture(browser,{points:{revision:'points-one',candidates,selectedIds:['0','1']}});
  const picker=page.locator('#photoPointPicker');
  await page.waitForFunction(()=>document.querySelector('#photoPointSummary').textContent.includes('2개 선택'));
  assert.ok((await picker.boundingBox()).y<(await page.locator('#manualPhotoReviewGrid').boundingBox()).y);
  assert.equal(await picker.getByText('부드러운 착용감',{exact:true}).first().isVisible(),true);
  assert.equal(await page.getByText('공식 근거: 공식 설명 2',{exact:true}).isVisible(),true);
  await picker.locator('input[value="2"]').check();
  await picker.locator('#photoPointApply').click();
  await page.waitForFunction(()=>document.querySelector('#photoPointSummary').textContent.includes('3개 선택'));
 }finally{await browser.close();}
});

test('Shift 범위의 색상 변경은 해당 묶음으로 이동하고 대표와 드래그를 유지한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,card,ids,selected,saved,drafts,errors}=await fixture(browser);
  const black=page.locator('#manualPhotoReviewLegend button[data-color="02블랙"]');
  assert.equal(await black.isDisabled(),true,'선택한 사진이 없으면 색상 일괄 적용을 막는다');
  await page.getByLabel('main.jpg 일괄 색상 지정',{exact:true}).check();
  await page.getByLabel('detail.jpg 일괄 색상 지정',{exact:true}).click({modifiers:['Shift']});
  assert.deepEqual(await selected(),['a','b','c']);
  const autosaved=saved();await black.click();await autosaved;
  assert.deepEqual(await ids(),['d','a','b','c','e'],'바뀐 사진은 대상 색상 묶음 뒤로 이동한다');
  for(const id of ['a','b','c'])assert.equal(await card(id).locator('[data-field=color]').inputValue(),'02블랙');
  assert.equal(await card('a').locator('input[type=radio]').isChecked(),true);
  assert.equal(drafts.at(-1).mainId,'a');
  assert.equal(drafts.at(-1).mainSelectionVersion,2);
  assert.equal(drafts.at(-1).roleSelectionVersion,2);
  await page.locator('#manualPhotoSelectionClear').click();assert.deepEqual(await selected(),[]);
  assert.equal(await black.isDisabled(),true);
  const dragged=saved();
  await card('c').locator(':scope > img').dragTo(card('a').locator(':scope > img'),{targetPosition:{x:10,y:100}});
  await dragged;
  assert.deepEqual(await ids(),['d','c','a','b','e']);
  assert.equal(drafts.at(-1).mainId,'a','순서를 옮겨도 대표사진은 바뀌지 않는다');
  assert.deepEqual(await selected(),[],'사진 드래그가 일괄 선택을 만들지 않는다');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('직접 지정한 후면은 초안·재열기에도 유지하고 순서대로 버튼으로만 자동 구도로 돌아간다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,card,saved,drafts,errors}=await fixture(browser);
  const manualSaved=saved();await card('a').locator('button[data-role-choice="back"]').click();await manualSaved;
  assert.equal(await card('a').getAttribute('data-role-mode'),'manual');
  assert.equal(await card('a').locator('[data-field=role]').inputValue(),'back');
  assert.equal(drafts.at(-1).items.find(item=>item.id==='a').roleMode,'manual');
  assert.equal(drafts.at(-1).items.find(item=>item.id==='a').role,'back');
  assert.equal(drafts.at(-1).roleSelectionVersion,2);
  await page.locator('#manualPhotoReviewClose').click();await page.locator('#manualPhotoReviewOpen').click();await card('a').waitFor();
  assert.equal(await card('a').getAttribute('data-role-mode'),'manual');
  assert.equal(await card('a').locator('[data-field=role]').inputValue(),'back');
  assert.equal(await card('a').locator('input[type=radio]').isChecked(),true);
  const ordered=saved();await card('a').locator('button[data-role-choice="order"]').click();await ordered;
  assert.equal(await card('a').getAttribute('data-role-mode'),'order');
  assert.equal(await card('a').locator('[data-field=role]').inputValue(),'front');
  assert.equal(drafts.at(-1).items.find(item=>item.id==='a').roleMode,'order');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('개별 색상을 바꾸면 묶음을 즉시 옮기고 기존 묶음의 순서를 유지한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,card,ids,saved,drafts,errors}=await fixture(browser);
  const edited=saved();await card('a').locator('[data-field=color]').selectOption('02블랙');await edited;
  assert.deepEqual(await ids(),['b','c','d','a','e']);
  assert.deepEqual(drafts.at(-1).items.map(item=>item.id),['b','c','d','a','e']);
  const sorted=saved();await page.locator('#manualPhotoReviewSort').click();await sorted;
  assert.deepEqual(await ids(),['b','c','d','a','e']);
  assert.deepEqual(drafts.at(-1).items.map(item=>item.id),['b','c','d','a','e']);
  assert.equal(drafts.at(-1).mainId,'a');
  const movedUp=saved();await card('a').locator('[data-field=color]').selectOption('01화이트');await movedUp;
  assert.deepEqual(await ids(),['b','c','a','d','e']);
  assert.equal(drafts.at(-1).mainId,'a');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('구형 서버의 roleOverride는 수동 구도로 승격하지 않고 새 수동 구도 버튼을 비활성화한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {card,errors}=await fixture(browser,{legacy:true});
  const back=card('a').locator('button[data-role-choice="back"]');
  assert.ok(await back.count()===0||await back.isDisabled());
  assert.notEqual(await card('a').getAttribute('data-role-mode'),'manual');
  assert.equal(await card('a').locator('[data-field=role]').inputValue(),'front');
  assert.equal(await card('a').locator('input[type=radio]').isChecked(),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('품번 변경 이벤트 이후 이전 사진의 선택과 반영을 막는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,card,applies,errors}=await fixture(browser);
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('register-state',{detail:{productStyle:'654321',busy:false,phase:'done'}})));
  assert.equal(await page.locator('#manualPhotoReviewApply').isDisabled(),true);
  await page.locator('#manualPhotoReviewApply').evaluate(button=>button.click());
  assert.equal(applies.length,0);
  if(await card('a').isVisible())assert.equal(await card('a').locator('[data-select-photo]').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('닫았다 다시 연 세션에 이전 목록 응답이 늦게 도착해도 새 revision과 선택을 유지한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,control,pendingReview,ids,selected,errors}=await fixture(browser);
  await page.getByLabel('main.jpg 일괄 색상 지정',{exact:true}).check();
  await page.locator('#manualPhotoReviewClose').click();
  control.holdNextReview=true;await page.locator('#manualPhotoReviewOpen').click();await waitForPending(pendingReview);
  await page.locator('#manualPhotoReviewClose').click();
  control.data={...control.data,revision:'quick-two',mainId:'x',items:[{id:'x',name:'new-main.jpg',color:'01화이트',role:'front',roleMode:'order',main:true},{id:'y',name:'new-side.jpg',color:'01화이트',role:'side',roleMode:'order',main:false}]};
  await page.locator('#manualPhotoReviewOpen').click();await page.locator('[data-photo-id=x]').waitFor();
  const late=page.waitForResponse(response=>response.url().includes('/api/smartstore-photo-review?'));
  pendingReview.shift()();await late;
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,30)));
  assert.deepEqual(await ids(),['x','y']);assert.deepEqual(await selected(),[]);
  assert.equal(await page.locator('[data-photo-id=x] input[type=radio]').isChecked(),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('사진 반영은 초안 저장을 기다리기 전 잠겨 중복 클릭과 중간 편집을 막는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,card,control,pendingDraft,drafts,applies,errors}=await fixture(browser);control.holdDraft=true;
  await page.locator('#manualPhotoReviewApply').evaluate(button=>{button.click();button.click();});await waitForPending(pendingDraft);
  assert.equal(await page.locator('#manualPhotoReviewApply').isDisabled(),true);
  assert.equal(await card('a').locator('[data-select-photo]').isDisabled(),true);
  assert.equal(await card('a').locator('button[data-role-choice="back"]').isDisabled(),true);
  assert.equal(drafts.length,1);assert.equal(applies.length,0);
  const applied=page.waitForRequest(request=>request.url().endsWith('/api/smartstore-photo-review')&&request.method()==='POST');
  control.holdDraft=false;pendingDraft.shift()();await applied;
  await page.locator('#manualPhotoReviewDialog').waitFor({state:'hidden'});
  assert.equal(applies.length,1);
  assert.equal(applies[0].roleSelectionVersion,2);
  assert.equal(applies[0].mainId,'a');
  assert(applies[0].items.every(item=>['manual','order'].includes(item.roleMode)));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
