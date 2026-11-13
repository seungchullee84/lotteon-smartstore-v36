import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';
import {tryLotteLogin} from '../browser-login.mjs';
test('등록 화면의 입력란이 스크롤 밖에 있어도 가려진 현재 탭을 다시 누르지 않는다',async()=>{
 const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:800,height:600}});
 await page.setContent('<div id="TabFrame_form_tab_Menu_OCPIPMPiMPrdcInfoRgstM_2_23"><div id="TabFrame_form_tab_Menu_OCPIPMPiMPrdcInfoRgstM_2_23_tabbuttonTextBoxElement">상품등록</div></div><div style="position:absolute;inset:0 0 auto 0;height:60px;background:white">다른 메뉴</div><input id="WorkFrame_OCPIPMPiMPrdcInfoRgstM_2_23_cbo_PrdcClCd_comboedit_input" style="position:absolute;top:1500px">');
 const bot=new LotteAutomation('',()=>{});bot.page=page;
 bot.click=async()=>assert.fail('이미 열린 탭을 다시 클릭하면 안 됨');
 await bot.activateRegistration();
 }finally{await browser.close();}
});

const portal='https://together.lotteshopping.com/EMDV3/index.html';
const frame='portal_WorkFrame_OCPIPMPiMPrdcInfoRgstM_6_41';
const tab='portal_TabFrame_form_tab_Menu_OCPIPMPiMPrdcInfoRgstM_6_41_tabbuttonTextBoxElement';
const item=frame+'_form_div_Search_div_Pumbun';
const popup=frame+'_commPopup_form';
const row=popup+'_div_Data_grd_List_body_gridrow_0_cell_0';
const topMenu='portal_TopFrame_form_men_TopMenu_6001268';
const leftMenu='portal_LeftFrame_form_pdv_LeftMenu_div_LeftMenu';

function portalFixture({needsLogin=false,prefilled=false,noticeCount=needsLogin?1:0,noticeCloseDelay=0,existingCode='',lookupDelay=0,mode='menu',rowName='지오다노'}={}){
 const notices=Array.from({length:noticeCount},(_,i)=>'portal_loginOpenPopup_'+(i+1)+'_titlebar_closebutton');
 return `<style>.overlay{position:fixed;inset:0;background:white}</style>
  <section id="login" ${needsLogin?'':'hidden'}>
   <input id="portal_div_Login_edt_LoginId_input" value="${prefilled?'fixture-user':''}">
   <input id="portal_div_Login_edt_LoginPassword_input" type="password" value="${prefilled?'fixture-pass':''}">
   <button id="portal_div_Login_btn_Login">로그인</button>
  </section>
  <main id="portal" ${needsLogin?'hidden':''}>
   <button>로그아웃</button>
   <button id="${topMenu}">온라인 채널연계</button>
   <div id="portal_MainFrame_form" ${mode==='shortcut'?'':'hidden'}>
    <button id="shortcut">온라인 상품등록</button>
   </div>
   <div id="${leftMenu}" hidden>
    <button id="${leftMenu}_btn_Left6001278">상품 관리</button>
    <button id="registration" hidden>상품등록</button>
   </div>
   <button id="${tab}" ${existingCode?'':'hidden'}>상품등록</button>
   <section id="registration-form" hidden>
    <input id="${item}_edt_Code_input" value="${existingCode||(lookupDelay?'241142':'')}">
    <input id="${item}_edt_Name_input" value="${existingCode?'기존 선택':''}" readonly>
    <button id="${item}_btn_CommPopup">품번 찾기</button>
    <input id="${frame}_cbo_PrdcClCd_comboedit_input">
    <input id="product-style" value="기존 입력">
    <button id="create">신규</button><button id="save">임시저장</button>
   </section>
   <section id="item-popup" class="overlay" hidden>
    <input id="${popup}_div_Search_edt_itmno_input" value="${lookupDelay?'241142':''}">
    <button id="${popup}_btn_Search">조회</button>
    <div id="result" hidden>
     <span id="${row}_0">241142</span>
     <button id="${row}_1">${rowName}</button>
    </div>
    <button id="${popup}_btn_Confirm" disabled>확인</button>
   </section>
   ${notices.map(id=>`<div class="overlay">
    <button id="${id}">닫기</button>
    <button class="notice-preference">오늘 하루 그만보기</button>
   </div>`).join('')}
  </main>
  <script>
   const el=id=>document.getElementById(id);
   window.actions=[];
   function on(id, action){el(id).onclick=()=>{actions.push(id);action?.();};}
   on('portal_div_Login_btn_Login',()=>{el('login').hidden=true;el('portal').hidden=false;});
   for(const id of ${JSON.stringify(notices)})on(id,()=>setTimeout(()=>el(id).parentElement.hidden=true,${noticeCloseDelay}));
   for(const field of el('login').querySelectorAll('input'))field.oninput=()=>actions.push('login-input');
   for(const button of document.querySelectorAll('.notice-preference'))button.onclick=()=>actions.push('notice-preference');
   on('${topMenu}',()=>el('${leftMenu}').hidden=false);
   on('${leftMenu}_btn_Left6001278',()=>el('registration').hidden=false);
   function showRegistration(){
    el('${tab}').hidden=false;
    el('registration-form').hidden=false;
    if('${mode}'==='shortcut')setTimeout(()=>el('item-popup').hidden=false,${lookupDelay});
   }
   for(const id of ['registration','shortcut','${tab}'])on(id,showRegistration);
   on('${item}_btn_CommPopup',()=>el('item-popup').hidden=false);
   on('${popup}_btn_Search',()=>{el('result').hidden=el('${popup}_div_Search_edt_itmno_input').value!=='241142';});
   on('${row}_1',()=>el('${popup}_btn_Confirm').disabled=false);
   on('${popup}_btn_Confirm',()=>{
    el('${item}_edt_Code_input').value=el('${row}_0').textContent;
    el('${item}_edt_Name_input').value=el('${row}_1').textContent;
    el('item-popup').hidden=true;
   });
   for(const id of ['create','save'])on(id);
  </script>`;
}

test('상품등록 화면 열기가 로그인·공지 닫기·상품등록·정확한 품번 선택까지 진행한다',async t=>{
 const browser=await chromium.launch();
 t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:portalFixture({needsLogin:true})}));
 await page.goto(portal);
 const bot=new LotteAutomation('',()=>{});
 bot.page=page;
 bot.connectChrome=async()=>{bot.context=page.context();};
 bot.ensureLogin=waitForForm=>tryLotteLogin(page,{store:{load:async()=>({
  username:'fixture-user',password:'fixture-pass',revision:'one'
 })},waitForForm,timeout:1500});
 assert.deepEqual(await bot.openRegistration(),{status:'registration-ready'});
 assert.equal(await page.locator('[id="'+item+'_edt_Code_input"]').inputValue(),'241142');
 assert.equal(await page.locator('[id="'+item+'_edt_Name_input"]').inputValue(),'지오다노');
 assert.deepEqual(await page.evaluate(()=>window.actions),[
  'login-input','login-input','portal_div_Login_btn_Login','portal_loginOpenPopup_1_titlebar_closebutton',
  topMenu,leftMenu+'_btn_Left6001278','registration',item+'_btn_CommPopup',
  popup+'_btn_Search',row+'_1',popup+'_btn_Confirm'
 ]);
 assert.equal(await page.locator('#product-style').inputValue(),'기존 입력');
});

test('저장된 계정이 채워져 있으면 바로 로그인하고 겹친 공지 19개를 X로 닫는다',async t=>{
 const browser=await chromium.launch();
 t.after(()=>browser.close());
 const page=await browser.newPage();
 const noticeCount=19;
 const body=portalFixture({needsLogin:true,prefilled:true,noticeCount,noticeCloseDelay:390,lookupDelay:400,mode:'shortcut'});
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));
 await page.goto(portal);
 const bot=new LotteAutomation('',()=>{});
 bot.page=page;
 bot.connectChrome=async()=>{bot.context=page.context();};
 bot.ensureLogin=waitForForm=>tryLotteLogin(page,{store:{load:async()=>({
  username:'fixture-user',password:'fixture-pass',revision:'one'
 })},waitForForm,timeout:1500});
 assert.deepEqual(await bot.openRegistration(),{status:'registration-ready'});
 assert.deepEqual(await page.evaluate(()=>window.actions),[
  'portal_div_Login_btn_Login',
  ...Array.from({length:noticeCount},(_,i)=>'portal_loginOpenPopup_'+(noticeCount-i)+'_titlebar_closebutton'),
  'shortcut',popup+'_btn_Search',row+'_1',popup+'_btn_Confirm'
 ]);
 assert.equal(await page.locator('[id="'+item+'_edt_Code_input"]').inputValue(),'241142');
 assert.equal(await page.locator('[id="'+item+'_edt_Name_input"]').inputValue(),'지오다노');
});

test('상품등록 바로가기와 기존 탭을 재사용하고 이미 선택된 품번은 유지한다',async t=>{
 const browser=await chromium.launch();
 t.after(()=>browser.close());
 for(const options of [{mode:'shortcut'},{mode:'shortcut',lookupDelay:400},{existingCode:'654321'}]){
  const page=await browser.newPage();
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:portalFixture(options)}));
  await page.goto(portal);
  const bot=new LotteAutomation('',()=>{});
  bot.page=page;
  bot.open=()=>Promise.resolve({status:'session'});
  assert.equal((await bot.openRegistration()).status,'registration-ready');
  const actions=await page.evaluate(()=>window.actions);
  if(options.existingCode){
   assert.deepEqual(actions,[tab]);
   assert.equal(await page.locator('[id="'+item+'_edt_Code_input"]').inputValue(),options.existingCode);
  }else assert.deepEqual(actions,['shortcut',popup+'_btn_Search',row+'_1',popup+'_btn_Confirm']);
  await page.close();
 }
});

test('로그인 확인이 필요하면 이동하지 않고 조회 결과의 이름이 다르면 확인하지 않는다',async t=>{
 const browser=await chromium.launch();
 t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:portalFixture({mode:'shortcut',rowName:'다른 브랜드'})}));
 await page.goto(portal);
 const bot=new LotteAutomation('',()=>{});
 bot.page=page;
 bot.open=()=>Promise.resolve({status:'manual'});
 assert.deepEqual(await bot.openRegistration(),{status:'manual'});
 assert.deepEqual(await page.evaluate(()=>window.actions),[]);
 bot.open=()=>Promise.resolve({status:'session'});
 await assert.rejects(bot.openRegistration(),/지오다노 품번 241142/);
 assert.deepEqual(await page.evaluate(()=>window.actions),['shortcut',popup+'_btn_Search']);
});
