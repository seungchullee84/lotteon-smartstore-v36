import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';

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
