import {isLottePortalPage,lotteSessionExpired,LOTTE_SESSION_EXPIRED} from './browser-login.mjs';

const frame='[id*="WorkFrame_OCPIPMPiMPrdcInfoRgstM_"]';
const tab='[id*="TabFrame_form_tab_Menu_OCPIPMPiMPrdcInfoRgstM_"][id$="_tabbuttonTextBoxElement"]';
const itemCode='241142',itemName='지오다노';
const noticeSelector='[id*="_loginOpenPopup_"][id$="_titlebar_closebutton"]';

async function closeLoginNotices(page,check){
 const notices=page.locator(noticeSelector).filter({visible:true});
 const deadline=Date.now()+30000;
 let blockedUntil=Date.now()+6000;
 while(await notices.count()){
  await check();
  if(Date.now()>=Math.min(deadline,blockedUntil))throw Error('전용 크롬에서 롯데 포털 공지 창을 확인해 주세요.');
  const id=await notices.evaluateAll(buttons=>buttons.find(button=>{
   const r=button.getBoundingClientRect();
   return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  })?.id);
  if(id){
   const button=page.locator('[id='+JSON.stringify(id)+']');
   await button.click({timeout:1200});
   await button.waitFor({state:'hidden',timeout:2500});
   blockedUntil=Date.now()+6000;
  }else await page.waitForTimeout(100);
 }
}

export async function openLotteRegistration(page,{check=()=>{}}={}){
 async function checkPortal(){
  check();
  if(page.isClosed()||!isLottePortalPage(page))throw Error('전용 크롬에서 롯데 파트너포털을 열어 주세요.');
  if(await lotteSessionExpired(page))throw Error(LOTTE_SESSION_EXPIRED);
 }
 const visible=selector=>page.locator(selector).filter({visible:true});
 const form=visible(frame+'[id$="cbo_PrdcClCd_comboedit_input"]');
 const lookup=visible(frame+'[id$="_commPopup_form_div_Search_edt_itmno_input"]');
 const search=visible(frame+'[id$="_commPopup_form_btn_Search"]');
 const confirm=visible(frame+'[id$="_commPopup_form_btn_Confirm"]');
 async function clickMenu(menu){
  for(let attempt=0;attempt<2;attempt++){
   await checkPortal();
   await closeLoginNotices(page,checkPortal);
   try{await menu.click({timeout:3500});return;}
   catch(error){
    if(attempt||error.name!=='TimeoutError'||!await visible(noticeSelector).count())throw error;
   }
  }
 }
 try{
  await checkPortal();
  await closeLoginNotices(page,checkPortal);
  if(!await form.isVisible()&&!await lookup.isVisible()){
   const registrationTab=visible(tab);
   const shortcut=page.locator('[id*="_MainFrame_"]')
    .getByText(/^온라인\s*상품\s*등록$/).filter({visible:true});
   if(await registrationTab.count()){
    await clickMenu(registrationTab);
   }else if(await shortcut.count()===1){
    await clickMenu(shortcut);
   }else{
    const online=visible('[id$="_form_men_TopMenu_6001268"]');
    const products=visible('[id$="_div_LeftMenu_btn_Left6001278"]').last();
    const registration=page.locator('[id$="_div_LeftMenu"]')
     .getByText(/^(?:온라인\s*)?상품\s*등록$/).filter({visible:true});
    if(!await registration.count()){
     if(!await products.count())await clickMenu(online);
     await clickMenu(products);
    }
    await clickMenu(registration);
   }
  }
  await form.or(lookup).first().waitFor({state:'visible',timeout:8000});
  await checkPortal();
 }catch(error){
  await checkPortal();
  if(error.message.includes('공지 창'))throw error;
  throw Error('전용 크롬에서 온라인 채널연계 → 상품관리 → 상품등록을 열어 주세요.');
 }

 try{
  const code=visible(frame+'[id$="_div_Pumbun_edt_Code_input"]');
  const name=visible(frame+'[id$="_div_Pumbun_edt_Name_input"]');
  if(!await lookup.isVisible()){
   if((await code.inputValue({timeout:4000})).trim()){
    if((await name.inputValue({timeout:4000})).trim())return;
    throw Error('선택된 품번명을 확인할 수 없습니다.');
   }
   await checkPortal();
   await visible(frame+'[id$="_div_Pumbun_btn_CommPopup"]').click({timeout:4000});
  }
  await lookup.waitFor({state:'visible',timeout:4000});
  await checkPortal();
  const entered=(await lookup.inputValue()).trim();
  if(entered&&entered!==itemCode)throw Error('입력 중인 품번을 확인해 주세요.');
  await lookup.fill(itemCode,{timeout:3000});
  await lookup.press('Tab',{timeout:3000});
  await checkPortal();
  await search.click({timeout:4000});
  await page.locator('[id$="waitwindow"]').first().waitFor({state:'hidden',timeout:6000});
  const exact=text=>new RegExp('^\\s*'+text+'\\s*$');
  const result=visible(frame+'[id*="_commPopup_form_div_Data_grd_List_body_gridrow_"][id$="_0"]')
   .filter({hasText:exact(itemCode)});
  await result.first().waitFor({state:'visible',timeout:6000});
  const id=await result.getAttribute('id',{timeout:3000});
  const item=visible('[id='+JSON.stringify(id.replace(/_0$/,'_1'))+']').filter({hasText:exact(itemName)});
  await checkPortal();
  await item.click({timeout:3000});
  await checkPortal();
  await confirm.click({timeout:3000});
  await lookup.waitFor({state:'hidden',timeout:6000});
  await form.waitFor({state:'visible',timeout:6000});
  await checkPortal();
  if((await code.inputValue()).trim()!==itemCode||(await name.inputValue()).trim()!==itemName){
   throw Error('상품등록 화면에서 선택된 품번을 확인할 수 없습니다.');
  }
 }catch{
  await checkPortal();
  throw Error('상품등록 화면에서 지오다노 품번 241142를 확인해 주세요.');
 }
}
