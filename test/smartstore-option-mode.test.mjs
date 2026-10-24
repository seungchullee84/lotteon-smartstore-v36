import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ensureSmartstoreOptionMode,readSmartstoreOptionRows,verifySmartstoreOptions} from '../smartstore-form.mjs';

test('hidden styled radios do not cause an already open option panel to close on repeated runs',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(2000);
  await page.setContent(`<ui-view name="option"><button onclick="const p=document.querySelector('#panel');p.hidden=!p.hidden;window.toggles=(window.toggles||0)+1">옵션 도움말</button><section id=panel><input id=option_choice_type_true type=radio checked style="display:none"><label for=option_choice_type_true>설정함</label><label><input type=radio name=mode checked>직접 입력하기</label><label><input type=radio name=type checked>조합형</label></section></ui-view>`);
  assert.equal(await page.locator('#option_choice_type_true').isVisible(),false);
  await ensureSmartstoreOptionMode(page);await ensureSmartstoreOptionMode(page);
  assert.equal(await page.evaluate(()=>window.toggles||0),0);assert.equal(await page.locator('#panel').isVisible(),true);
  await page.getByRole('button',{name:'옵션 도움말'}).click();
  await ensureSmartstoreOptionMode(page);assert.equal(await page.locator('#panel').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.toggles),2);
 }finally{await browser.close();}
});


test('40개 가상 옵션 행의 중간 조합과 재고도 빠짐없이 검증한다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(2000);
  const plan={colors:['01블랙','02차콜','03라이트그레이','04팀버','05브라운'],sizes:['28','29','30','31','32','33','34','36'],expectedOptions:40,stockPerOption:10};
  const rows=plan.colors.flatMap(color=>plan.sizes.map(size=>({color,size,stock:10})));
  const mount=async data=>{
   await page.setContent('<div role="grid"></div>');
   await page.evaluate(data=>{
    const grid=document.querySelector('[role="grid"]');
    const render=index=>{
     const start=Math.floor(index/7)*7;
     grid.innerHTML=data.slice(start,start+7).map((row,i)=>'<div role="row" row-index="'+(start+i)+'"><div tabindex="0" role="gridcell" col-id="optionName1">'+row.color+'</div><div role="gridcell" col-id="optionName2">'+row.size+'</div><div role="gridcell" col-id="stockQuantity">'+row.stock+'</div></div>').join('');
     grid.querySelector('[row-index="'+index+'"] [col-id="optionName1"]').focus();
    };
    grid.addEventListener('keydown',e=>{
     let index=Number(e.target.closest('[row-index]').getAttribute('row-index'));
     if(e.ctrlKey&&e.key==='Home')index=0;
     else if(e.key==='ArrowDown')index=Math.min(data.length-1,index+1);
     else return;
     e.preventDefault();requestAnimationFrame(()=>render(index));
    });render(data.length-1);
   },data);
  };
  await mount(rows);
  const read=await readSmartstoreOptionRows(page,plan);
  assert.equal(read.length,40);assert.equal(verifySmartstoreOptions(plan,read),40);
  await mount(rows.map((row,i)=>i===20?{...row,stock:0}:row));
  const incorrect=await readSmartstoreOptionRows(page,plan);
  assert.throws(()=>verifySmartstoreOptions(plan,incorrect),/옵션 재고 확인 실패/);
  await assert.rejects(readSmartstoreOptionRows(page,plan,()=>{throw Error('사용자가 중단했습니다.');}),/중단/);
 }finally{await browser.close();}
});
