import {setAttributeCheckboxes} from './smartstore-attribute-checkboxes.mjs';
import {selectLearnedAttribute} from './smartstore-learned.mjs';
// Apply only product attributes with reviewed evidence, through the seller UI.
export async function fillAdditionalAttributes(page,fields,log=()=>{},check=()=>{}){
 const heading=page.getByRole('heading',{name:'상품속성',exact:true});
 const dialog=page.locator('.modal-content').filter({has:heading});
 const completed=[];
 const skip=label=>log('상품속성 건너뜀: '+label+' · 최종 직접 확인');
 const failed=(error,label)=>{check();if(error.name==='AbortError')throw error;skip(label);};
 try{
 if(!await dialog.isVisible()){
  const button=page.getByRole('button',{name:'속성 더 입력하기',exact:true});
  if(!await button.isVisible()){log('추가 상품속성 입력란 없음');return [];}
  check();await button.click({timeout:1500});await dialog.waitFor({state:'visible',timeout:1500});
 }
 for(const [label,value] of Object.entries({'주요소재':fields.materials,...fields.attributes})){
  check();
  try{
  const row=dialog.getByRole('row').filter({has:page.locator('th').filter({hasText:new RegExp('^\\s*'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$')})});
  if(!await row.count())continue;
  if(Array.isArray(value)){
   const selected=await setAttributeCheckboxes(row,value,{label,check,requireAll:true,optionalValues:label==='주요소재'?fields.materialFinishes||[]:[],bestEffort:true,timeout:1200,onSkip:skip});
   if(selected.length)completed.push({label,value:selected});
  }else{
   const input=row.locator('.selectize-input');if(!await input.count())continue;
   if(!value){skip(label+' / 확인 근거 없음');continue;}
   await selectLearnedAttribute(page,row,label,value,check);
   completed.push({label,value});
  }
  }catch(error){failed(error,label+' / '+[].concat(value||'').join(', '));}
 }
 check();await dialog.getByRole('button',{name:'저장',exact:true}).click({timeout:1500});await dialog.waitFor({state:'hidden',timeout:1500});
 }catch(error){failed(error,'추가 입력창 적용');completed.length=0;}
 if(await dialog.isVisible()){
  // Close only this optional-attribute dialog so later product fields can proceed.
  try{check();const close=dialog.getByRole('button',{name:/^(취소|닫기)$/,exact:true}).first();if(await close.count())await close.click({timeout:1500});else await dialog.press('Escape',{timeout:1500});}
  catch(error){failed(error,'추가 입력창 닫기');}
 }
 if(completed.length)log('추가 상품속성 확인된 선택: '+completed.map(x=>x.label+' '+[].concat(x.value).join(', ')).join(' · '));
 return completed;
}
