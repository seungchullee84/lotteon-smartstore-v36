import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';
test('등록 화면의 입력란이 스크롤 밖에 있어도 가려진 현재 탭을 다시 누르지 않는다',async()=>{
 const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:800,height:600}});
 await page.setContent('<div id="TabFrame_form_tab_Menu_OCPIPMPiMPrdcInfoRgstM_2_23"><div id="TabFrame_form_tab_Menu_OCPIPMPiMPrdcInfoRgstM_2_23_tabbuttonTextBoxElement">상품등록</div></div><div style="position:absolute;inset:0 0 auto 0;height:60px;background:white">다른 메뉴</div><input id="WorkFrame_OCPIPMPiMPrdcInfoRgstM_2_23_cbo_PrdcClCd_comboedit_input" style="position:absolute;top:1500px">');
 const bot=new LotteAutomation('',()=>{});bot.page=page;
 bot.click=async()=>assert.fail('이미 열린 탭을 다시 클릭하면 안 됨');
 await bot.activateRegistration();
 }finally{await browser.close();}
});
