import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {suggestMissingLotteCategory} from '../lotte-category-suggest.mjs';
import {validateLotteCategory} from '../lotte-category-validation.mjs';

async function botPage(browser){
 const page=await browser.newPage();page.setDefaultTimeout(1000);
 const bot=new LotteAutomation('',()=>{});bot.page=page;
 bot.pace=async()=>{};bot.settle=async()=>{};
 return {page,bot};
}

test('common category selection respects its full code when names are duplicated',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const {page,bot}=await botPage(browser);
 await page.setContent('<input id="cobPrdcClsfSCd_comboedit_input"><button id="cobPrdcClsfSCd_dropbutton">open</button><div id="cobPrdcClsfSCd_combolistScrollableContainerElement"><div>00111 : 같은이름</div><div>00222 : 같은이름</div></div>');
 await page.evaluate(()=>{
  window.chosen=[];
  for(const row of document.querySelectorAll('#cobPrdcClsfSCd_combolistScrollableContainerElement > div'))row.onclick=()=>{
   window.chosen.push(row.textContent);document.querySelector('input').value=row.textContent;row.parentElement.style.display='none';
  };
 });
 await bot.combo('cobPrdcClsfSCd','00222 : 같은이름');
 assert.deepEqual(await page.evaluate(()=>window.chosen),['00222 : 같은이름']);
 assert.equal(await page.locator('input').inputValue(),'00222 : 같은이름');
});

test('common category does not accept a click whose selected value never commits',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const {page,bot}=await botPage(browser);
 await page.setContent('<input id="cobPrdcClsfSCd_comboedit_input" value="00111 : 이전분류"><button id="cobPrdcClsfSCd_dropbutton">open</button><div id="cobPrdcClsfSCd_combolistScrollableContainerElement"><div>00222 : 선택분류</div></div>');
 await page.evaluate(()=>document.querySelector('#cobPrdcClsfSCd_combolistScrollableContainerElement').onclick=event=>{event.currentTarget.style.display='none';});
 await assert.rejects(bot.combo('cobPrdcClsfSCd','00222 : 선택분류',false,null,{timeout:200}),/분류.*반영|분류.*확인/);
});

async function channelFixture(browser,{delayed=false}={}){
 const {page,bot}=await botPage(browser);
 await page.setContent('<div id="grd_DspctgrS_head">소분류</div><div id="grd_DspctgrS_body"></div>');
 await page.evaluate(({delayed})=>{
  window.chosen=[];
  const populate=()=>{
   const body=document.getElementById('grd_DspctgrS_body');
   for(const [i,code] of ['BC31050100','BC31050200'].entries()){
    const row=document.createElement('div');row.id='grd_DspctgrS_body_gridrow_'+i+'GridAreaContainerElement_inner';row.style.cssText='display:flex;gap:15px;padding:8px';
    for(const [col,text] of [code,'동일소분류'].entries()){
     const cell=document.createElement('div');cell.id='grd_DspctgrS_body_gridrow_'+i+'_cell_'+i+'_'+col+'_GridCellTextContainerElement';cell.textContent=text;row.append(cell);
    }
    row.onclick=()=>{window.chosen.push(code);row.setAttribute('aria-selected','true');};body.append(row);
   }
  };
  if(delayed)setTimeout(populate,160);else populate();
 },{delayed});
 return {page,bot};
}

test('channel category uses the code within the same row and waits for asynchronous rows',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 for(const delayed of [false,true])await t.test(delayed?'delayed':'already rendered',async()=>{
  const {page,bot}=await channelFixture(browser,{delayed});
  const selected=await bot.similarCategoryClick('동일소분류','S',{code:'BC31050200',timeout:1000});
  assert.equal(selected,'동일소분류');
  assert.deepEqual(await page.evaluate(()=>window.chosen),['BC31050200']);await page.close();
 });
});

test('channel category rejects duplicate names when no code disambiguates them',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const {page,bot}=await channelFixture(browser);
 await assert.rejects(bot.similarCategoryClick('동일소분류','S',{timeout:300}),/중복|여러/);
 assert.deepEqual(await page.evaluate(()=>window.chosen),[]);
});

test('old parent rows stay visible while the requested child list is loading',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const {page,bot}=await channelFixture(browser);
 await page.evaluate(()=>{
  const rows=document.querySelectorAll('[id$="GridAreaContainerElement_inner"]');rows[1].remove();
  setTimeout(()=>{const row=rows[0].cloneNode(true);row.id='grd_DspctgrS_body_gridrow_1GridAreaContainerElement_inner';row.children[0].textContent='BC31050200';row.onclick=()=>window.chosen.push('BC31050200');document.getElementById('grd_DspctgrS_body').append(row);},300);
 });
 await bot.similarCategoryClick('동일소분류','S',{code:'BC31050200',timeout:1000});assert.deepEqual(await page.evaluate(()=>window.chosen),['BC31050200']);
});

test('added standard categories must match all levels in one row, including detail',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const {page,bot}=await botPage(browser);
 await page.setContent('<div id="div_input05_div_body_grd_Dspctgr"></div><button id="div_input05_div_body_btn_Dspctgr_AddRow">추가</button>');
 await page.evaluate(()=>{
  window.adds=0;
  const grid=document.getElementById('div_input05_div_body_grd_Dspctgr');
  const add=values=>{
   const n=grid.children.length,row=document.createElement('div');row.id=grid.id+'_body_gridrow_'+n+'GridAreaContainerElement_inner';
   values.forEach((value,c)=>{const cell=document.createElement('div');cell.id=grid.id+'_body_gridrow_'+n+'_cell_'+n+'_'+c+'_GridCellTextContainerElement';cell.textContent=value;row.append(cell);});grid.append(row);
  };
  add(['브랜드여성의류','티셔츠/맨투맨','맨투맨','']);
  add(['브랜드남성의류','티셔츠/맨투맨','후드티셔츠','다른세분류']);
  document.querySelector('button').onclick=()=>{window.adds++;setTimeout(()=>add(['브랜드여성의류','티셔츠/맨투맨','후드티셔츠','선택세분류']),80);};
 });
 await bot.addStandardCategory('브랜드여성의류','티셔츠/맨투맨','후드티셔츠','선택세분류');
 assert.equal(await page.evaluate(()=>window.adds),1,'labels spread across different rows are not an added path');
 await bot.addStandardCategory('브랜드여성의류','티셔츠/맨투맨','후드티셔츠','선택세분류');
 assert.equal(await page.evaluate(()=>window.adds),1,'the exact existing row is not added twice');
});

test('the real portal column layout matches names at 6/8/10/12 and checks leaf code',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const {page,bot}=await botPage(browser);
 await page.setContent('<div id="div_input05_div_body_grd_Dspctgr"></div>');
 await page.evaluate(()=>{
  const grid=document.querySelector('div'),heads={4:'카테고리코드',6:'대분류',8:'중분류',10:'소분류',12:'세분류'};
  for(const [i,label]of Object.entries(heads)){const h=document.createElement('div');h.id=grid.id+'_head_gridrow_-1_cell_-1_'+i;h.textContent=label;grid.append(h);}
  const row=document.createElement('div');row.id=grid.id+'_body_gridrow_0';grid.append(row);
  for(const [i,value]of Object.entries({4:'BC31030100',6:'브랜드남성의류',8:'긴팔티셔츠/맨투맨',10:'라운드넥티셔츠',12:''})){const c=document.createElement('div');c.id=row.id+'_cell_0_'+i;c.textContent=value;row.append(c);}
 });
 assert.equal(await bot.hasStandardCategory('브랜드남성의류','긴팔티셔츠/맨투맨','라운드넥티셔츠','',{small:'BC31030100'}),true);
 assert.equal(await bot.hasStandardCategory('브랜드남성의류','반팔티셔츠','라운드넥반팔티'),false);
 assert.equal(await bot.hasStandardCategory('브랜드남성의류','긴팔티셔츠/맨투맨','라운드넥티셔츠','',{small:'BC_WRONG'}),false);
});

test('double click waits for the channel form and refuses a different style',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const {page,bot}=await botPage(browser);
 await page.setContent('<div id="row">123456(DT)</div><input id="edt_style_input" value="123456(DT)">');
 await page.evaluate(()=>document.querySelector('#row').ondblclick=()=>setTimeout(()=>{const input=document.createElement('input');input.id='cbo_preSet_comboedit_input';input.value='신규 26년';document.body.append(input);},120));
 await bot.openCategoryChannel(page.locator('#row'),{style:'123456'});
 await page.locator('#edt_style_input').fill('654321(DT)');
 await assert.rejects(bot.assertChannelStyle({style:'123456'}),/품번/);
});

test('243801 short sleeves retain the matching second category after retry, never stale long sleeves',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lotte-pair-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const p={style:'243801',gender:'남성',rawName:'면 라운드 3팩 반팔 기본 티셔츠',sourceCategory:['MEN','TOP','반팔티'],category:{}};
 p.category=suggestMissingLotteCategory(p).category;const before=structuredClone(p.category);
 assert.equal(validateLotteCategory(p).ready,true);assert.equal(p.category.channelSmall,'라운드넥반팔티');assert.notEqual(p.category.channelMiddle,'긴팔티셔츠/맨투맨');
 const bot=new LotteAutomation(root,()=>{}),calls=[];let failures=0,adds=0;
 bot.page={waitForTimeout:async()=>{}};bot.settle=async()=>{};bot.assertChannelStyle=async()=>{};
 bot.similarCategoryClick=async(name,level,options)=>{calls.push({name,level,...options});if(level==='M'&&failures++===0)throw Error('목록 로딩 중');return name;};
 bot.addStandardCategory=async(major,middle,small)=>{adds++;assert.equal(small,'라운드넥반팔티');assert.equal(middle,before.channelMiddle);};
 await bot.selectMatchedChannelCategory(p);assert.equal(adds,1);assert.equal(calls.filter(x=>x.level==='L').length,2);assert.deepEqual(p.category,before);assert.ok(calls.every(x=>x.code));
 const cache=JSON.parse(await readFile(path.join(root,'category-matches.json'),'utf8'));assert.equal(cache.matches[0].actual.small,'라운드넥반팔티');
});

test('ambiguous Add is never repeated and never learned as success',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lotte-pair-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const p={style:'243801',gender:'남성',rawName:'면 라운드 3팩 반팔 티셔츠',sourceCategory:['MEN','TOP','반팔티'],category:{}};p.category=suggestMissingLotteCategory(p).category;
 const bot=new LotteAutomation(root,()=>{});bot.page={waitForTimeout:async()=>{}};bot.settle=async()=>{};bot.assertChannelStyle=async()=>{};bot.similarCategoryClick=async()=>{};let adds=0;
 bot.addStandardCategory=async()=>{adds++;throw Error('추가 반영 확인 실패');};
 await assert.rejects(bot.selectMatchedChannelCategory(p),/추가 반영/);assert.equal(adds,1);await assert.rejects(readFile(path.join(root,'category-matches.json')),e=>e.code==='ENOENT');
});
