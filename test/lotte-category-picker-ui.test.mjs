import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {lotteCategoryChoices,createManualLotteCategory} from '../lotte-category-choice.mjs';
import {bridgeLotteCategory} from '../lotte-category-bridge.mjs';
import {validateLotteCategory,allLotteStandardPaths} from '../lotte-category-validation.mjs';

const raw={style:'375908',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=ui-test',gender:'여성',name:'여성 패딩 375908',rawName:'여성 패딩',sourceCategory:['WOMEN'],category:{commonMajor:'L0011 : 여성의류',commonMiddle:'M0066 : 여성의류아우터',commonSmall:'00856 : 여성패딩'}};
const base={...raw,category:bridgeLotteCategory(raw).category};
const fields=['name','gender','commonMiddle','commonSmall','channelMiddle','channelSmall'];
const ids=['lotteCategoryValidation','lotteCategoryValidationSummary','lotteCategoryValidationMessage','lotteCategoryCommonPath','lotteCategoryChannelPath','lotteCategoryValidationScope','lotteCategorySuggestionStatus'];
const paths=allLotteStandardPaths();
const alternate=paths.find(p=>p.major.name==='브랜드여성의류'&&p.middle.name==='점퍼/패딩/야상'&&p.small.name!=='패딩/다운점퍼');
const choiceCodes=p=>[p.major.code,p.middle.code,p.small.code,p.detail?.code||''];
async function fixture(t){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(5000);
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://register.test/**',async route=>{
  if(new URL(route.request().url()).pathname==='/api/lotte-category-choices')return route.fulfill({json:lotteCategoryChoices()});
  return route.fulfill({contentType:'text/html',body:'<html><body data-channel="lotte"><input id="style" value="375908"><input id="smartstoreName"><form id="form">'+fields.map(n=>'<label>'+n+'<input name="'+n+'"></label>').join('')+'</form><button id="lotteCategorySuggest">공란 분류 자동 채우기</button>'+ids.map(id=>'<div id="'+id+'"></div>').join('')+'<ul id="lotteCategoryValidationIssues"></ul></body></html>'});
 });
 await page.goto('http://register.test/');
 let gate=null,release=null,legacy=false;
 await page.exposeFunction('categoryRequest',async body=>{
  requests.push(body);if(gate){gate=null;await new Promise(r=>release=r);}
  let p={...base,...body};if(body.manualChoice)p.category=createManualLotteCategory(p,body.manualChoice);
  const bridge=bridgeLotteCategory(p);return {category:bridge.category,bridge,validation:validateLotteCategory({...p,category:bridge.category}),manualSupported:!legacy};
 });
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const categoryCode=source.slice(source.indexOf('const lotteCategoryFields='),source.indexOf('function populate('));
 const editCode=source.slice(source.indexOf('const manualProductFields='),source.indexOf('// Secure, optional photo-analysis setup.'));
 const setup='const $=id=>document.getElementById(id);let product=null,serverBusy=false;const activeChannel=()=>document.body.dataset.channel,setText=(e,t)=>e.textContent=t,post=(route,body)=>window.categoryRequest(body);const reviewedFields=new Set();function highlightReviewFields(){}function syncNoticeCopy(){}function renderDetailPreview(){}function announce(t){window.announcement=t;}function populate(p){product=p;for(const n of '+JSON.stringify(fields)+')setProductInput($("form").elements[n],p.category?.[n]||p[n]||"",p);}';
 await page.addScriptTag({content:setup+categoryCode+editCode});
 await page.evaluate(p=>populate(p),base);
 await page.addStyleTag({content:await readFile(new URL('../public/style.css',import.meta.url),'utf8')});
 await page.addScriptTag({content:await readFile(new URL('../public/lotte-category-picker.js',import.meta.url),'utf8')});
 const open=async()=>{await page.locator('#lotteCategoryEdit').click();await page.getByText(/자동으로 연결된 현재 분류|직접 선택한 분류예요/).waitFor();};
 return {page,errors,requests,open,delay:()=>{gate=true;release=null;},release:async()=>{for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,10));assert.ok(release);release();},legacy:value=>legacy=value};
}

test('portal-style lists keep automatic defaults; explicit choice survives checking, reopening and fresh state',async t=>{
 const {page,errors,requests,open}=await fixture(t);await open();
 assert.equal(await page.getByLabel('1차 대분류',{exact:true}).inputValue(),'L0011');
 assert.equal(await page.getByLabel('1차 소분류',{exact:true}).inputValue(),'00856');
 assert.equal(await page.getByLabel('2차 소분류',{exact:true}).inputValue(),base.category.channelCodes.small);
 const output=new URL('../previews/astryx-smartstore/.runtime/',import.meta.url);await mkdir(output,{recursive:true});
 await page.screenshot({path:new URL('category-picker-desktop.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
 await page.getByLabel('2차 소분류',{exact:true}).selectOption(alternate.small.code);
 await page.getByRole('button',{name:'선택한 분류 적용',exact:true}).click();await page.locator('#lotteCategoryPicker').waitFor({state:'hidden'});
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),alternate.small.name);
 assert.equal(await page.evaluate(()=>product.category.channelCodes.small),alternate.small.code);
 assert.equal(await page.locator('#lotteCategoryValidationSummary').innerText(),'직접 선택한 분류 유지');
 assert.equal(await page.evaluate(()=>fillMissingLotteCategory()),true);
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),alternate.small.name);
 const stored=await page.evaluate(()=>currentProductEdits());assert.ok(stored.fields.lotteCategorySelection);
 await page.evaluate(p=>populate(p),base);
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),alternate.small.name);
 await open();assert.equal(await page.getByLabel('2차 소분류',{exact:true}).inputValue(),alternate.small.code);
 await page.getByRole('button',{name:'취소',exact:true}).click();
 const widths=[];for(const width of [390,430,768,1152]){
  await page.setViewportSize({width,height:950});await open();
  const overflow=await page.locator('#lotteCategoryPicker').evaluate(el=>el.scrollWidth>el.clientWidth);assert.equal(overflow,false,'overflow '+width);
  const b=await page.locator('#lotteCategoryPicker').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1);
  if(width===390)await page.screenshot({path:new URL('category-picker-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.keyboard.press('Escape');widths.push(width);
 }
 await page.evaluate(p=>populate({...p,sourceUrl:p.sourceUrl+'-new'}),base);
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),base.category.channelSmall,'old manual choice must not leak into changed source');
 assert.equal(await page.evaluate(()=>currentProductEdits()?.fields.lotteCategorySelection),undefined);
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.style===base.style));
});

test('changing first category reconnects second; cancel, stale product and old-server responses cannot apply',async t=>{
 const f=await fixture(t),{page,open}=f;await open();
 await page.getByLabel('1차 중분류',{exact:true}).selectOption('M0210');
 assert.equal(await page.locator('#lotteCategoryPickerApply').isDisabled(),true);
 await page.getByLabel('1차 소분류',{exact:true}).selectOption('00847');
 await page.getByText('2차를 자동으로 연결했어요. 다르면 아래 목록에서 직접 선택하세요.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('2차 중분류',{exact:true}).locator('option:checked').innerText().then(x=>x.split('  ·  ')[0]),'가디건/조끼');
 assert.equal(await page.locator('[name=commonSmall]').inputValue(),base.category.commonSmall,'modal edits remain draft until Apply');
 await page.getByRole('button',{name:'취소',exact:true}).click();
 assert.equal(await page.locator('[name=commonSmall]').inputValue(),base.category.commonSmall);
 await open();f.legacy(true);await page.getByRole('button',{name:'선택한 분류 적용',exact:true}).click();
 await page.getByText(/반영을 확인하지 못했어요/).waitFor();assert.equal(await page.evaluate(()=>product.category.manualSelection),undefined);
 f.legacy(false);await page.keyboard.press('Escape');await open();f.delay();
 await page.getByRole('button',{name:'1차 기준으로 다시 연결',exact:true}).click();
 await page.evaluate(()=>{product={...product,style:'375909'};document.querySelector('#style').value='375909';});
 await f.release();await page.getByText(/상품 또는 입력값이 바뀌었어요/).waitFor();
 assert.equal(await page.locator('#lotteCategoryPickerApply').isDisabled(),true);
 assert.equal(await page.locator('[name=channelSmall]').inputValue(),base.category.channelSmall);
 await page.keyboard.press('Escape');assert.deepEqual(f.errors,[]);
});
