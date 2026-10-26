import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';
import {baseColor,matchColor} from '../product.mjs';
test('스톤은 사용자 지정에 따라 아이보리로 매칭',()=>{
  assert.equal(matchColor('03스톤',['베이지','그레이','아이보리']),'아이보리');
  assert.equal(matchColor('03STONE',['아이보리','화이트']),'아이보리');
  assert.equal(matchColor('03스톤',['그레이','베이지']),null);
});
test('에크루는 사용자 지정에 따라 아이보리로 매칭',()=>{
  assert.equal(matchColor('05에크루',['베이지','아이보리','크림','화이트']),'아이보리');
  assert.equal(matchColor('05ECRU',['크림','아이보리']),'아이보리');
  assert.equal(matchColor('05에크루',['베이지','크림','화이트']),null);
});

test('세이지는 연두를 우선하고 없으면 올리브로 연결',()=>{
  assert.equal(matchColor('03세이지',['올리브','블루','연두']),'연두');
  assert.equal(matchColor('03세이지',['그린','올리브']),'올리브');
  assert.equal(matchColor('03세이지',['세이지','연두']),'세이지');
});

test('새 후보가 여러 번 없어도 실제 스크롤 끝까지 읽음',async()=>{
  const bot=new LotteAutomation('',()=>{});bot.page={waitForTimeout:async()=>{}};
  let step=0;bot.scrollComboList=async(_list,top)=>{if(top){step=0;return false;}return ++step<6;};
  bot.comboLabels=async()=>step<5?['베이지','아이보리']:['블랙','M'];
  assert.deepEqual(await bot.scanComboLabels({}),['베이지','아이보리','블랙','M']);
  assert.equal(step,6);
});

test('복합 STR 색상은 첫 색상으로 매칭',()=>{
  assert.equal(baseColor('02블랙+화이트STR'),'블랙');
  assert.equal(baseColor('02블랙STR'),'블랙');
  assert.equal(matchColor('02블랙+화이트STR',['화이트','블랙','블루']),'블랙');
  assert.equal(matchColor('02블랙+화이트STR',[]),null);
});

test('드래그 중 목록이 닫히면 사라진 스크롤바를 기다리지 않고 다시 엶',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    await page.setContent(`<button id="sample_dropbutton" onclick="document.querySelector('#popup').hidden=false">열기</button><div id="popup"><div id="sample_combolistScrollableContainerElement">베이지</div><div id="sample_combolist_vscrollbar" style="position:absolute;top:60px;width:16px;height:200px"><div id="sample_combolist_vscrollbar_trackbar" style="position:absolute;top:13px;width:16px;height:40px"></div></div></div>`);
    const bot=new LotteAutomation('',()=>{});bot.page=page;
    bot.smoothDrag=async()=>page.locator('#popup').evaluate(e=>e.hidden=true);
    assert.equal(await bot.scrollComboList(page.locator('#sample_combolistScrollableContainerElement').filter({visible:true})),true);
    assert.equal(await page.locator('#popup').isVisible(),true);
  }finally{await browser.close();}
});

test('옵션 항목 ID가 다른 스킨에서도 표시된 색상 목록을 읽음',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    await page.setContent('<div id="list"><div id="item0_text">화이트</div><div id="item1_text">블랙</div><div id="item2_textBoxElement">블루</div></div>');
    const bot=new LotteAutomation('',()=>{});bot.page=page;
    const labels=await bot.comboLabels(page.locator('#list'));
    assert.ok(labels.includes('화이트'));
    assert.equal(matchColor('02블랙+화이트STR',labels),'블랙');
  }finally{await browser.close();}
});

test('휠이 작동하지 않는 가상 목록도 스크롤바로 끝의 블랙을 찾아 선택',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    await page.setContent(`<style>#sample_combolistScrollableContainerElement{position:absolute;left:10px;top:10px;width:180px;height:200px;overflow:hidden}#sample_combolist_vscrollbar{position:absolute;left:195px;top:10px;width:16px;height:200px}#sample_combolist_vscrollbar_trackbar{position:absolute;top:13px;width:16px;height:40px;background:gray}</style>
      <input id="sample_comboedit_input" style="position:absolute;top:250px"><div id="sample_combolistScrollableContainerElement"></div><div id="sample_combolist_vscrollbar"><div id="sample_combolist_vscrollbar_trackbar"></div></div>
      <script>
      const values=['베이지','아이보리','스킨','오트밀','크림','오크베이지','골드','샴페인',...Array.from({length:40},(_,i)=>'색상'+i),'블랙'];
      const list=document.getElementById('sample_combolistScrollableContainerElement'),thumb=document.getElementById('sample_combolist_vscrollbar_trackbar');
      function render(top){const start=Math.floor(top/134*(values.length-8));list.innerHTML=values.slice(start,start+8).map(v=>'<div id="itemTextBoxElement">'+v+'</div>').join('');}
      let offset=null;thumb.onmousedown=e=>offset=e.clientY-thumb.getBoundingClientRect().top;
      window.onmousemove=e=>{if(offset===null)return;const y=Math.max(13,Math.min(147,e.clientY-10-offset));thumb.style.top=y+'px';render(y-13)};
      window.onmouseup=()=>offset=null;list.onclick=e=>document.querySelector('input').value=e.target.textContent;render(0);
      </script>`);
    const bot=new LotteAutomation('',()=>{});bot.page=page;
    const labels=await bot.scanComboLabels(page.locator('#sample_combolistScrollableContainerElement'));
    assert.equal(labels.length,49);
    const selected=matchColor('02블랙+화이트STR',labels);
    assert.equal(selected,'블랙');
    const originalDrag=bot.smoothDrag.bind(bot);let recovered=false;
    bot.smoothDrag=async(x,from,to,fast)=>{if(fast)return;recovered=true;return originalDrag(x,from,to,false);};
    await bot.scrollComboList(page.locator('#sample_combolistScrollableContainerElement'),true);
    assert.equal(recovered,true,'빠른 드래그가 무시되면 일반 드래그로 복구');
    bot.smoothDrag=originalDrag;
    let drags=0;const drag=bot.smoothDrag.bind(bot);
    bot.smoothDrag=async(...args)=>{drags++;return drag(...args);};
    await bot.combo('sample',selected,false,labels);
    assert.equal(await page.locator('input').inputValue(),'블랙');
    assert.ok(drags<=1,'목록을 순회하지 않고 한 번에 목표 위치로 이동');
    drags=0;
    await bot.combo('sample','베이지',false,labels);
    assert.equal(await page.locator('input').inputValue(),'베이지');
    assert.ok(drags<=1,'목록 앞쪽도 한 번에 이동');
  }finally{await browser.close();}
});

test('번호가 붙은 다크인디고는 통합색상 인디고블루를 우선 선택',()=>{
  const labels=['베이지','블루','인디고블루','데님','네이비','블랙'];
  assert.equal(matchColor('02다크인디고',labels),'인디고블루');
  assert.equal(matchColor('DARK INDIGO',labels),'인디고블루');
  assert.equal(matchColor('02다크인디고',['블루','네이비']),'네이비');
  assert.equal(matchColor('02다크인디고',['베이지','블랙']),null);
});

test('사용자 확정 라즈베리는 자주 대신 루비로 매칭',()=>{
  const labels=['레드','와인','자주','핑크','루비'];
  assert.equal(matchColor('02라즈베리',labels),'루비');
  assert.equal(matchColor('02 RASPBERRY',labels),'루비');
  assert.equal(matchColor('02라즈베리',['자주','핑크','레드']),null);
});
