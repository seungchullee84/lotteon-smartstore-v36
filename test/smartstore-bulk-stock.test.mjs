import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {applySmartstoreBulkStock,readSmartstoreOptionRows,verifySmartstoreOptions} from '../smartstore-form.mjs';

for(const mode of ['edit','copy'])test(mode+' 옵션 갱신 후 실제 전체체크를 다시 하고 재고 10 일괄수정의 지연 반영을 기다린다',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),plan={colors:['01블랙','02미드나잇'],sizes:['29','30'],stockPerOption:10,expectedOptions:4};
  const rows=plan.colors.flatMap(color=>plan.sizes.map(size=>({color,size})));
  await page.setContent(`<div role="grid" aria-rowcount="6">
   <div class="ag-header"><input type="checkbox" hidden id="built-in"><label><input type="checkbox" class="ag-selection-checkbox" checked>전체선택</label></div>
   ${rows.map((r,i)=>`<div role="row" row-index="${i}"><span role="gridcell" tabindex="0" col-id="optionName1">${r.color}</span><span col-id="optionName2">${r.size}</span><span col-id="stockQuantity">0</span></div>`).join('')}
  </div><input ng-model="vm.bulkStockQuantity" value="10"><button>선택목록 일괄수정</button>
  <script>
   window.selectionEvents=0;window.bulkClicks=0;window.stockEvents=0;
   document.querySelector('.ag-selection-checkbox').onchange=e=>{window.selectionEvents++;document.querySelectorAll('[row-index]').forEach(row=>row.classList.toggle('ag-row-selected',e.target.checked));};
   document.querySelector('[ng-model]').oninput=()=>window.stockEvents++;
   document.querySelector('button').onclick=()=>{window.bulkClicks++;if([...document.querySelectorAll('[row-index]')].every(row=>row.classList.contains('ag-row-selected'))&&document.querySelector('[ng-model]').value==='10')setTimeout(()=>document.querySelectorAll('[col-id="stockQuantity"]').forEach(cell=>cell.textContent='10'),200);};
  </script>`);
  await applySmartstoreBulkStock(page,plan);
  assert.equal(await page.locator('#built-in').isChecked(),false,'숨겨진 다른 체크박스를 조작하지 않음');
  assert.deepEqual(await page.evaluate(()=>({selection:window.selectionEvents,bulk:window.bulkClicks})),{selection:2,bulk:1});
  assert((await page.evaluate(()=>window.stockEvents))>0,'이미 10이 적혀 있어도 입력 이벤트를 다시 발생시킴');
  assert.equal(verifySmartstoreOptions(plan,await readSmartstoreOptionRows(page,plan)),4);
 }finally{await browser.close();}
});
