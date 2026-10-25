import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {setAttributeCheckboxes} from '../smartstore-attribute-checkboxes.mjs';
import {fillLearnedAttributes} from '../smartstore-learned.mjs';
import {fillAdditionalAttributes} from '../smartstore-attributes.mjs';

const materials='<input type="checkbox" id="fleece" aria-label="기모" onclick="return false"><input type="checkbox" id="cotton" aria-label="면">';
const selector=(label,value,available=value)=>`<tr><th>${label}</th><td><div class="selectize-input" onclick="this.classList.add('dropdown-active');this.nextElementSibling.hidden=false"><span class="item">선택</span></div><div class="selectize-dropdown-content" hidden><div data-selectable onclick="this.parentElement.previousElementSibling.querySelector('.item').textContent=this.textContent;this.parentElement.hidden=true">${available}</div></div></td></tr>`;
async function fixture(fn){const browser=await chromium.launch({headless:true});try{await fn(await browser.newPage());}finally{await browser.close();}}

test('실패한 기모와 카테고리에 없는 소재를 건너뛰고 다음 체크박스는 선택한다',()=>fixture(async page=>{
 await page.setContent('<table><tr><td>'+materials+'</td></tr></table>');
 const skipped=[];
 const selected=await setAttributeCheckboxes(page.getByRole('row'),['기모','면','울/모'],{requireAll:true,bestEffort:true,timeout:120,onSkip:x=>skipped.push(x)});
 assert.deepEqual(selected,['면']);assert.equal(await page.locator('#cotton').isChecked(),true);
 assert.equal(await page.locator('#fleece').isChecked(),false);
 assert(skipped.some(x=>x.includes('기모')));assert(skipped.some(x=>x.includes('울/모')));
}));

test('소재와 소매기장 실패 후에도 네크라인 입력을 계속하며 실패를 완료로 기록하지 않는다',()=>fixture(async page=>{
 await page.setContent('<table aria-label="상품속성 선택 테이블"><tr><th>주요소재</th><td>'+materials+'</td></tr>'+selector('소매기장','긴팔','반팔')+selector('네크라인','라운드넥')+'</table>');
 const logs=[];
 await fillLearnedAttributes(page,{materials:['면'],materialFinishes:['기모'],sleeve:'긴팔',neckline:'라운드넥'},()=>{},x=>logs.push(x));
 assert.equal(await page.locator('#cotton').isChecked(),true);
 assert.equal(await page.getByRole('row').filter({hasText:'네크라인'}).locator('.item').innerText(),'라운드넥');
 assert(logs.some(x=>x.includes('기모')&&x.includes('건너뜀')));
 assert(logs.some(x=>x.includes('소매기장')&&x.includes('건너뜀')));
}));

test('추가 속성창은 선택 가능한 항목을 유지하고 다음 속성까지 처리한 뒤 적용한다',()=>fixture(async page=>{
 await page.setContent('<div class="modal-content"><h2>상품속성</h2><table><tr><th>주요소재</th><td>'+materials+'</td></tr>'+selector('사용대상','남성용')+'</table><button onclick="this.parentElement.hidden=true">저장</button></div>');
 const logs=[];
 const completed=await fillAdditionalAttributes(page,{materials:['면'],materialFinishes:['기모'],attributes:{'사용대상':'남성용'}},x=>logs.push(x));
 assert.deepEqual(completed,[{label:'주요소재',value:['면']},{label:'사용대상',value:'남성용'}]);
 assert.equal(await page.locator('.modal-content').isVisible(),false);
 assert(logs.some(x=>x.includes('기모')&&x.includes('건너뜀')));
 assert(!logs.find(x=>x.includes('확인된 선택')).includes('기모'));
}));

test('선택 실패를 건너뛰는 중에도 사용자 중단을 즉시 전파한다',()=>fixture(async page=>{
 await page.setContent('<table><tr><td>'+materials+'</td></tr></table>');
 let checks=0;
 await assert.rejects(()=>setAttributeCheckboxes(page.getByRole('row'),['기모','면'],{bestEffort:true,timeout:120,check:()=>{if(++checks>=2)throw Error('사용자가 중단했습니다.');}}),/사용자가 중단/);
 assert.equal(await page.locator('#cotton').isChecked(),false);
}));

test('추가 속성 적용 실패는 입력창을 닫고 최종 확인 기록으로 남긴다',()=>fixture(async page=>{
 await page.setContent('<div class="modal-content"><h2>상품속성</h2><table><tr><th>주요소재</th><td><input type="checkbox" aria-label="면"></td></tr></table><button>저장</button><button onclick="this.parentElement.hidden=true">닫기</button></div>');
 const logs=[];
 const completed=await fillAdditionalAttributes(page,{materials:['면'],attributes:{}},x=>logs.push(x));
 assert.deepEqual(completed,[]);assert.equal(await page.locator('.modal-content').isVisible(),false);
 assert(logs.some(x=>x.includes('추가 입력창 적용')&&x.includes('건너뜀')));
}));
