import {setAttributeCheckboxes} from './smartstore-attribute-checkboxes.mjs';
// Apply only product attributes with reviewed evidence, through the seller UI.
export async function fillAdditionalAttributes(page,fields,log=()=>{},check=()=>{}){
 const heading=page.getByRole('heading',{name:'상품속성',exact:true});
 const dialog=page.locator('.modal-content').filter({has:heading});
 if(!await dialog.isVisible()){
  const button=page.getByRole('button',{name:'속성 더 입력하기',exact:true});
  if(!await button.isVisible()){log('추가 상품속성 입력란 없음');return [];}
  check();await button.click();await dialog.waitFor({state:'visible'});
 }
 await dialog.locator('th').filter({hasText:/^주요소재/}).waitFor({state:'visible'});
 const completed=[];
 const normalize=s=>s.replace(/추천/g,'').replace(/\s+/g,' ').trim();
 for(const [label,value] of Object.entries({'주요소재':fields.materials,...fields.attributes})){
  check();
  const row=dialog.getByRole('row').filter({has:page.locator('th').filter({hasText:new RegExp('^\\s*'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$')})});
  if(!await row.count())continue;
  if(Array.isArray(value)){
   await setAttributeCheckboxes(row,value,{label,check,requireAll:true});
  }else{
   const input=row.locator('.selectize-input');if(!await input.count())continue;
   if(normalize(await input.innerText())!==value){
    await input.click();const options=row.locator('.selectize-dropdown-content [data-selectable]');let found=false;
    for(let i=0;i<await options.count();i++)if(normalize(await options.nth(i).innerText())===value){await options.nth(i).click();found=true;break;}
    if(!found)throw Error('이 카테고리에 해당 속성 값이 없습니다: '+label+' / '+value);
   }
   if(normalize(await input.innerText())!==value)throw Error('추가속성 확인 실패: '+label);
  }
  completed.push({label,value});
 }
 check();await dialog.getByRole('button',{name:'저장',exact:true}).click();await dialog.waitFor({state:'hidden'});
 log('추가 상품속성 반영: '+completed.map(x=>x.label+' '+[].concat(x.value).join(', ')).join(' · '));
 return completed;
}
