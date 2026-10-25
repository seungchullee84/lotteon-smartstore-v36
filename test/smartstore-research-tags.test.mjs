import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fillResearchTags} from '../smartstore-research-tags.mjs';
import {SmartstoreAutomation} from '../smartstore-automation.mjs';

async function fixture(page,{candidates,existing=[],invalid=[],wrongId=false}){
 await page.setContent('<div class="control"><div><input aria-label="태그를 입력해주세요."></div><div class="selectize-dropdown-content"></div><div id="selected"></div></div><a>검색에 적용되는 태그 확인</a><div id="dialog"></div>');
 await page.evaluate(({candidates,existing,invalid,wrongId})=>{
  const selected=document.querySelector('#selected'),field=document.querySelector('input'),menu=document.querySelector('.selectize-dropdown-content');
  window.searches=0;window.saves=0;
  const add=tag=>{const span=document.createElement('span');span.className='choice-label';const name=document.createElement('strong');name.textContent='#'+tag.name;const id=document.createElement('span');id.className='sub-text';id.textContent=tag.id;const remove=document.createElement('button');remove.textContent='삭제';remove.onclick=()=>span.remove();span.append(name,id,remove);selected.append(span);};
  for(const tag of existing)add(tag);
  field.addEventListener('keydown',e=>{
   if(e.key==='Escape'){menu.hidden=true;return;}
   if(e.key!=='End')return;window.searches++;menu.replaceChildren();menu.hidden=false;
   const tag=candidates.find(t=>t.name===field.value);if(!tag)return;
   const option=document.createElement('div');option.dataset.selectable='';option.dataset.value=wrongId?'99999':tag.id;option.textContent=tag.name;option.onmousedown=e=>e.preventDefault();option.onclick=()=>{add(tag);field.value='';menu.hidden=true;};menu.append(option);
  });field.addEventListener('blur',()=>{menu.hidden=true;});
  document.querySelector('a').onclick=()=>{
   const names=Array.from(selected.querySelectorAll('strong')).map(e=>e.textContent.slice(1)),modal=document.createElement('div');modal.className='modal-content';
   const heading=document.createElement('h2');heading.textContent='검색 적용 태그 확인';const dl=document.createElement('dl');
   for(const [status,list] of [['태그사전에 등록되어 있습니다. 등록됨',names.filter(n=>!invalid.includes(n))],['태그사전에 등록되어 있지 않습니다. 미등록',names.filter(n=>invalid.includes(n))]]){const dt=document.createElement('dt');dt.textContent=status;const dd=document.createElement('dd');dd.textContent=list.map(n=>'#'+n).join(' ');dl.append(dt,dd);}
   const close=document.createElement('button');close.textContent='확인';close.onclick=()=>modal.remove();modal.append(heading,dl,close);document.querySelector('#dialog').append(modal);
  };
 },{candidates,existing,invalid,wrongId});
}

test('모든 추천을 삭제한 수동 선택은 자동 보충 없이 기존 태그를 비운다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await fixture(page,{candidates:[],existing:[{name:'기존태그',id:'1'}]});
  const result=await fillResearchTags(page,{configured:true,manual:true,candidates:[]});
  assert.equal(result.tagCount,0);assert.equal(result.tagStatus,'needs-review');
  assert.equal(await page.locator('span.choice-label').count(),0);
  assert.equal(await page.evaluate(()=>window.searches),0);assert.equal(await page.evaluate(()=>window.saves),0);
 }finally{await browser.close();}
});

test('관련 사전 ID만 입력하고 기존 태그를 재사용하며 10개 미만도 진행한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(2500);
  const candidates=[{name:'기모슬랙스',id:'1'},{name:'밴딩슬랙스',id:'2'},{name:'테이퍼드핏',id:'3'}];
  await fixture(page,{candidates,existing:[candidates[0],{name:'다른상품',id:'999'}]});
  const research={configured:true,candidates},result=await fillResearchTags(page,research);
  assert.equal(result.tagCount,3);assert.equal(result.retained,1);assert.equal(result.searches,2);assert.equal(result.searchTagsVerified,true);assert.equal(result.tagStatus,'needs-review');assert.equal(result.tagMissing,7);
  const repeated=await fillResearchTags(page,research);assert.equal(repeated.retained,3);assert.equal(repeated.searches,0);assert.equal(await page.evaluate(()=>window.saves),0);
  await assert.rejects(fillResearchTags(page,research,()=>{},()=>{throw Error('중단');}),/중단/);
 }finally{await browser.close();}
});

test('미등록 태그를 제거하고 다음 관련 후보로 교체하며 ID가 다른 자동완성은 선택하지 않는다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(2500);
  const candidates=Array.from({length:11},(_,i)=>({name:'관련태그'+i,id:String(i+1)}));
  await fixture(page,{candidates,invalid:['관련태그0']});
  const result=await fillResearchTags(page,{configured:true,candidates});
  assert.equal(result.tagCount,10);assert(result.rejectedIds.includes('1'));assert(!result.selectedTags.some(t=>t.id==='1'));assert(result.selectedTags.some(t=>t.id==='11'));
  await fixture(page,{candidates:candidates.slice(0,1),wrongId:true});
  const wrong=await fillResearchTags(page,{configured:true,candidates:candidates.slice(0,1)});
  assert.equal(wrong.tagCount,0);assert.equal(wrong.searchTagsVerified,false);assert.equal(await page.locator('span.choice-label').count(),0);
 }finally{await browser.close();}
});


test('다른 품번의 태그 검증은 원래 폼의 이름과 태그를 복원하고 자동입력은 품번 불일치를 차단한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(2500);
  const original=[{name:'원래상품태그',id:'900'}],candidates=[{name:'검증후보1',id:'1'},{name:'검증후보2',id:'2'}];
  await fixture(page,{candidates:[...candidates,...original],existing:original});
  await page.locator('body').evaluate(e=>{const input=document.createElement('input');input.name='product.name';input.value='기존상품 115915';e.append(input);});
  const bot=new SmartstoreAutomation('.',()=>{});bot.preflight=async()=>{bot.page=page;bot.copyFormUrl=page.url();};
  const product={style:'375908'},research={configured:true,candidates};
  await assert.rejects(bot.runTags(product,{research}),/품번이 현재 상품과 다릅니다/);
  const report=await bot.runTags(product,{research,validateOnly:true});
  assert.equal(report.validationOnly,true);assert.equal(report.originalTagsRestored,true);assert.equal(report.applied,false);assert.equal(report.saved,false);
  assert.deepEqual(await page.locator('span.choice-label strong').allTextContents(),['#원래상품태그']);assert.equal(await page.locator('input[name="product.name"]').inputValue(),'기존상품 115915');
 }finally{await browser.close();}
});
