import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fillSmartstoreOrigin} from '../smartstore-form.mjs';

test('원산지는 실제 선택값으로 교체하고 누락된 수입사도 반복 실행마다 검증',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(2000);
  const select=(field,current,options)=>`<div class="form-group"><div class="selectize-input" onclick="this.nextElementSibling.hidden=false"><div class=item>${current}</div></div><div class=selectize-dropdown-content hidden>${options.map(text=>`<div onclick="const box=this.closest('.form-group');box.querySelector('.item').textContent=this.textContent;box.querySelector('select').value=this.textContent;this.parentElement.hidden=true">${text}</div>`).join('')}</div><select ng-model="vm.viewData.originAreaInfo.${field}" style="position:absolute;left:-10000px">${options.map(text=>`<option ${text===current?'selected':''}>${text}</option>`).join('')}</select></div>`;
  await page.setContent(select('originAreaExposureType','수입산',['국산','수입산','기타'])+select('firstSubOriginAreaType','아시아',['아시아'])+select('secondSubOriginAreaType','중국',['중국','베트남'])+'<input value="베트남" hidden><input ng-model="vm.viewData.originAreaInfo.importer" required value="">');
  const result=await fillSmartstoreOrigin(page,'베트남');
  assert.deepEqual(result,{type:'수입산',region:'아시아',country:'베트남',importer:'지오다노'});
  assert.equal(await page.locator('select[ng-model$="secondSubOriginAreaType"]').inputValue(),'베트남');
  const importer=page.locator('input[ng-model$="importer"]');assert.equal(await importer.inputValue(),'지오다노');
  await importer.fill('복사 원본 수입사');await fillSmartstoreOrigin(page,'베트남');assert.equal(await importer.inputValue(),'지오다노');
  await page.setContent(select('originAreaExposureType','수입산',['국산','수입산','기타']));
  assert.deepEqual(await fillSmartstoreOrigin(page,'한국'),{type:'국산',country:'대한민국'});
  assert.equal(await page.locator('select').inputValue(),'국산');
 }finally{await browser.close();}
});
