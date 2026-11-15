import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {lotteCategoryChoices,createManualLotteCategory} from '../lotte-category-choice.mjs';
import {bridgeLotteCategory} from '../lotte-category-bridge.mjs';
import {validateLotteCategory,allLotteStandardPaths} from '../lotte-category-validation.mjs';

const raw={style:'375908',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=ui-test',gender:'여성',name:'여성 패딩 375908',rawName:'여성 패딩',sourceCategory:['WOMEN'],category:{commonMajor:'L0011 : 여성의류',commonMiddle:'M0066 : 여성의류아우터',commonSmall:'00856 : 여성패딩'}};
const base={...raw,category:bridgeLotteCategory(raw).category};
const fields=['name','gender','commonMiddle','commonSmall','channelMiddle','channelSmall'];
const alternate=allLotteStandardPaths().find(p=>p.major.name==='브랜드여성의류'&&p.middle.name==='점퍼/패딩/야상'&&p.small.name!=='패딩/다운점퍼');
const choiceCodes=p=>[p.major.code,p.middle.code,p.small.code,p.detail?.code||''];
async function fixture(t,{initial=base,catalogs}={}){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(5000);
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const section=html.match(/<section id="lotteCategoryValidation"[\s\S]*?<\/section>/)?.[0];assert.ok(section);
 let catalogFailure=false;
 await page.route('http://register.test/**',async route=>{
  if(new URL(route.request().url()).pathname==='/api/lotte-category-choices')return catalogFailure?route.fulfill({status:503,body:'unavailable'}):route.fulfill({json:lotteCategoryChoices(catalogs)});
  return route.fulfill({contentType:'text/html',body:'<html><body data-channel="lotte"><input id="style" value="375908"><input id="smartstoreName"><form id="form">'+fields.map(n=>'<label>'+n+'<input name="'+n+'"></label>').join('')+section+'</form></body></html>'});
 });
 await page.goto('http://register.test/');
 let gate=null,release=null,legacy=false,failure=false;
 await page.exposeFunction('categoryRequest',async (route,body)=>{
  requests.push({route,body});if(gate===route){gate=null;await new Promise(r=>release=r);}
  if(failure&&route==='lotte-category-selection')throw Error('연결이 끊어졌어요.');
  let p={...base,...body};if(body.manualChoice)p.category=createManualLotteCategory(p,body.manualChoice,catalogs);
  const bridge=bridgeLotteCategory(p,catalogs);return {category:bridge.category,bridge,validation:validateLotteCategory({...p,category:bridge.category},catalogs),manualSupported:!legacy,selectionSaved:!!body.manualChoice&&!legacy};
 });
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const categoryCode=source.slice(source.indexOf('const lotteCategoryFields='),source.indexOf('function populate('));
 const editCode=source.slice(source.indexOf('const manualProductFields='),source.indexOf('// Secure, optional photo-analysis setup.'));
 const setup='const $=id=>document.getElementById(id);let product=null,serverBusy=false;const activeChannel=()=>document.body.dataset.channel,setText=(e,t)=>e.textContent=t,post=(route,body)=>window.categoryRequest(route,body);const reviewedFields=new Set();function highlightReviewFields(){}function syncNoticeCopy(){}function renderDetailPreview(){}function announce(t){window.announcement=t;}function populate(p){product=p;for(const n of '+JSON.stringify(fields)+')setProductInput($("form").elements[n],p.category?.[n]||p[n]||"",p);}';
 await page.addScriptTag({content:setup+categoryCode+editCode});
 await page.evaluate(p=>populate(p),initial);
 await page.addStyleTag({content:await readFile(new URL('../public/style.css',import.meta.url),'utf8')});
 await page.addScriptTag({content:await readFile(new URL('../public/lotte-category-picker.js',import.meta.url),'utf8')});
 await page.waitForFunction(()=>!document.getElementById('lotteCategoryCommon0').disabled);
 await page.evaluate(()=>checkLotteCategory({fillMissing:true}));
 const waitSaved=()=>page.waitForFunction(()=>!window.lotteCategoryInline.isEditing()&&!!product.category.manualSelection);
 const waitGate=async()=>{for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,10));assert.ok(release);};
 return {page,errors,requests,waitSaved,delay:(route='lotte-category-suggest')=>{gate=route;release=null;},waitGate,release:async()=>{await waitGate();release();},legacy:value=>legacy=value,fail:value=>failure=value,catalogFailure:value=>catalogFailure=value};
}
const select=(page,label)=>page.getByLabel(label,{exact:true});
const saves=f=>f.requests.filter(r=>r.route==='lotte-category-selection');

test('automatic defaults appear inline without any edit button or manual-save request',async t=>{
 const f=await fixture(t,{initial:{...raw,category:{...raw.category}}}),{page}=f;
 assert.equal(await select(page,'1차 대분류').inputValue(),'L0011');
 assert.equal(await select(page,'1차 소분류').inputValue(),'00856');
 assert.equal(await select(page,'2차 소분류').inputValue(),base.category.channelCodes.small);
 assert.equal(await page.locator('#lotteCategoryEdit,#lotteCategoryPicker').count(),0);
 assert.equal(await page.locator('.lotte-category-inline-select:visible').count(),6);
 assert.equal(saves(f).length,0,'showing defaults must not mark them as a user override');
 assert.equal(await page.evaluate(()=>product.category.manualSelection),undefined);
 assert.equal(await page.evaluate(()=>new FormData(document.querySelector('#form')).get('commonSmall')),base.category.commonSmall);
 await select(page,'2차 소분류').focus();
 await page.evaluate(()=>{window.pickerNode=document.querySelector('#lotteCategoryChannel2');window.optionNode=pickerNode.options[1];document.dispatchEvent(new CustomEvent('register-state'));});
 assert.equal(await page.evaluate(()=>window.pickerNode===document.activeElement&&optionNode===pickerNode.options[1]),true,'polling must not replace controls/options or move focus');
 for(const width of [1280,900,430,390]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.locator('#lotteCategoryValidation').evaluate(el=>el.scrollWidth>el.clientWidth),false,'overflow '+width);
  assert.equal(await page.locator('.lotte-category-inline-select:visible').count(),6);
 }
});

test('a direct second-category edit saves once, survives rechecking and reload, and does not leak to another source',async t=>{
 const f=await fixture(t),{page}=f;
 await select(page,'2차 소분류').selectOption(alternate.small.code);await f.waitSaved();
 assert.equal(saves(f).length,1);
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),alternate.small.name);
 assert.equal(await page.evaluate(()=>product.category.channelCodes.small),alternate.small.code);
 assert.equal(await page.locator('#lotteCategoryValidationSummary').innerText(),'직접 선택한 분류 유지');
 assert.equal(await page.evaluate(()=>fillMissingLotteCategory()),true);
 assert.equal(await select(page,'2차 소분류').inputValue(),alternate.small.code);
 assert.ok((await page.evaluate(()=>currentProductEdits())).fields.lotteCategorySelection);
 await page.evaluate(p=>{populate(p);document.dispatchEvent(new CustomEvent('register-state'));},base);
 assert.equal(await select(page,'2차 소분류').inputValue(),alternate.small.code);
 assert.equal(saves(f).length,1,'state polls and validation must not save again');
 await page.evaluate(p=>{populate({...p,sourceUrl:p.sourceUrl+'-new'});document.dispatchEvent(new CustomEvent('register-state'));},base);
 assert.equal(await select(page,'2차 소분류').inputValue(),base.category.channelCodes.small);
 assert.equal(await page.evaluate(()=>currentProductEdits()?.fields.lotteCategorySelection),undefined);
});

test('changing first category reconnects and saves second automatically; incomplete paths block Start',async t=>{
 const f=await fixture(t),{page}=f;
 await select(page,'1차 중분류').selectOption('M0210');
 assert.equal(await select(page,'1차 소분류').inputValue(),'');
 assert.equal(await page.evaluate(()=>fillMissingLotteCategory()),false);
 assert.equal(saves(f).length,0);
 assert.equal(await page.locator('[name=commonSmall]').inputValue(),base.category.commonSmall);
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('register-state')));
 assert.equal(await select(page,'1차 중분류').inputValue(),'M0210','polls retain incomplete drafts');
 await select(page,'1차 소분류').selectOption('00847');await f.waitSaved();
 assert.equal(await select(page,'2차 중분류').locator('option:checked').innerText(),'가디건/조끼');
 assert.equal(await page.locator('[name=commonSmall]').inputValue(),'00847 : 여성가디건');
 assert.equal(saves(f).length,1);
 assert.equal(await page.evaluate(()=>fillMissingLotteCategory()),true);
});

test('cancel and product or channel changes discard an outstanding recommendation without saving',async t=>{
 const f=await fixture(t),{page}=f;
 for(const mode of ['cancel','source','channel']){
  await page.evaluate(p=>{document.body.dataset.channel='lotte';populate(p);document.dispatchEvent(new CustomEvent('register-state'));},base);
  await select(page,'1차 중분류').selectOption('M0210');f.delay();
  await select(page,'1차 소분류').selectOption('00847');await f.waitGate();
  if(mode==='cancel')await page.getByRole('button',{name:'선택 취소',exact:true}).click();
  else if(mode==='source')await page.evaluate(p=>{populate({...p,sourceUrl:p.sourceUrl+'-new'});document.dispatchEvent(new CustomEvent('register-state'));},base);
  else await page.evaluate(()=>{document.body.dataset.channel='smartstore';});
  await f.release();
  await page.waitForFunction(()=>!window.lotteCategoryInline.isEditing());
  assert.equal(saves(f).length,0,mode+' must not save');
  assert.equal(await page.locator('[name=commonSmall]').inputValue(),base.category.commonSmall);
 }
});

test('failure or missing acknowledgement keeps the old values and allows retry on the same screen',async t=>{
 const f=await fixture(t),{page}=f;f.legacy(true);
 await select(page,'2차 소분류').selectOption(alternate.small.code);
 await page.waitForFunction(()=>document.getElementById('lotteCategoryValidationSummary').textContent==='반영 확인 필요');
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),base.category.channelSmall);
 assert.equal(await page.evaluate(()=>fillMissingLotteCategory()),false);
 f.legacy(false);f.fail(true);
 await page.getByRole('button',{name:'다시 반영',exact:true}).click();
 await page.getByText('연결이 끊어졌어요.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>product.category.manualSelection),undefined);
 f.fail(false);await page.getByRole('button',{name:'다시 반영',exact:true}).click();await f.waitSaved();
 assert.equal(await select(page,'2차 소분류').inputValue(),alternate.small.code);
});

test('Start waits for selection acknowledgement and accepts the matching state-poll echo',async t=>{
 const f=await fixture(t),{page}=f;f.delay('lotte-category-selection');
 await select(page,'2차 소분류').selectOption(alternate.small.code);await f.waitGate();
 assert.equal(await select(page,'1차 대분류').isDisabled(),true);
 await page.evaluate(()=>{window.beforeInputSettled=false;window.beforeInputResult=window.lotteCategoryInline.beforeInput().then(result=>{window.beforeInputSettled=true;return result;});});
 assert.equal(await page.evaluate(()=>window.beforeInputSettled),false);
 const category=createManualLotteCategory(base,{common:['L0011','M0066','00856'],channel:choiceCodes(alternate)});
 await page.evaluate(p=>{document.dispatchEvent(new CustomEvent('register-state'));populate(p);}, {...base,category});
 await f.release();
 assert.equal(await page.evaluate(()=>window.beforeInputResult),true);
 await f.waitSaved();assert.equal(saves(f).length,1);
});

test('a late save response cannot apply to a different current product',async t=>{
 const f=await fixture(t),{page}=f;f.delay('lotte-category-selection');
 await select(page,'2차 소분류').selectOption(alternate.small.code);await f.waitGate();
 await page.evaluate(p=>{document.querySelector('#style').value='375909';populate({...p,style:'375909',sourceUrl:p.sourceUrl+'-new'});document.dispatchEvent(new CustomEvent('register-state'));},base);
 await f.release();await page.waitForFunction(()=>!window.lotteCategoryInline.isEditing());
 assert.equal(await page.evaluate(()=>product.style),'375909');
 assert.equal(await page.evaluate(()=>product.category.manualSelection),undefined);
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),base.category.channelSmall);
});

test('an actual fourth-level branch waits for its leaf before saving',async t=>{
 const catalogs={common:JSON.parse(await readFile(new URL('../data/category-catalog-common.json',import.meta.url))),standard:JSON.parse(await readFile(new URL('../data/category-catalog-standard.json',import.meta.url)))};
 const small=catalogs.standard.majors.find(n=>n.code===alternate.major.code).middles.find(n=>n.code===alternate.middle.code).smalls.find(n=>n.code===alternate.small.code);
 small.details=[{code:'TESTDETAIL01',name:'검증용 세분류'}];
 const f=await fixture(t,{catalogs}),{page}=f;
 await select(page,'2차 소분류').selectOption(alternate.small.code);
 assert.equal(await select(page,'2차 세분류').isVisible(),true);
 assert.equal(saves(f).length,0);
 assert.equal(await page.evaluate(()=>fillMissingLotteCategory()),false);
 await select(page,'2차 세분류').selectOption('TESTDETAIL01');await f.waitSaved();
 assert.equal(await page.evaluate(()=>product.category.channelCodes.detail),'TESTDETAIL01');
 assert.equal(saves(f).length,1);
});
