import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';

async function fixture(browser, product, choices={}) {
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const sizeType=/바지|팬츠|슬랙스/.test(product.name)?'성인 하의 사이즈':'성인 상의 사이즈';
  const rows=[...product.colors.map(source=>({source,kind:'색상',type:'통합색상'})),...product.sizes.map(source=>({source,kind:'사이즈',type:sizeType}))];
  await page.setContent('<style>body{margin:0}.cell{position:absolute;box-sizing:border-box;height:34px;padding:5px;font:14px sans-serif}.checked{width:20px;height:20px}#grd_OptnDtlNew{position:absolute;left:20px;top:20px;width:830px;height:380px}#grd_OptnDtlNew_head{height:28px}#grd_OptnDtlNew_body{position:relative;height:340px}</style><div id="grd_OptnDtlNew"><div id="grd_OptnDtlNew_head">옵션</div><div id="grd_OptnDtlNew_body"></div></div><input hidden id="grd_OptnDtlNew_controlcombo_comboedit_input"><button hidden id="grd_OptnDtlNew_controlcombo_dropbutton">목록</button><div hidden id="grd_OptnDtlNew_controlcombo_combolistScrollableContainerElement"></div>');
  await page.evaluate(({rows,choices})=>{
    const grid='grd_OptnDtlNew',body=document.getElementById(grid+'_body');
    const input=document.getElementById(grid+'_controlcombo_comboedit_input');
    const arrow=document.getElementById(grid+'_controlcombo_dropbutton');
    const list=document.getElementById(grid+'_controlcombo_combolistScrollableContainerElement');
    window.fixtureRows=rows;
    window.counts={opens:0,escapes:0};
    window.options={'통합색상':['화이트','블랙','네이비','베이지','차콜','버건디'],
      '성인 하의 사이즈':['S','M','L'],'성인 상의 사이즈':['S','M','L'],...choices};
    let current=-1;
    const image='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    rows.forEach((row,index)=>{
      const values={0:row.kind,1:row.type,2:row.source,11:''};
      const left={0:0,1:80,2:260,11:420,12:590},width={0:75,1:175,2:155,11:165,12:35};
      for(const column of [0,1,2,11,12]){
        const cell=document.createElement('div');cell.className='cell';
        cell.id=grid+'_body_gridrow_'+index+'_cell_'+index+'_'+column;
        cell.style.cssText='top:'+index*42+'px;left:'+left[column]+'px;width:'+width[column]+'px';
        if(column===12){
          const checkbox=document.createElement('div');
          checkbox.id=cell.id+'_controlcheckbox';checkbox.style.cssText='width:24px;height:24px';
          const mark=document.createElement('div');mark.id=cell.id+'_chkimgImageElement';mark.className='checked';mark.append(document.createElement('img'));
          checkbox.append(mark);checkbox.onclick=()=>mark.firstChild.setAttribute('src',image);cell.append(checkbox);
        }else cell.textContent=values[column];
        if(column===11)cell.onclick=()=>{
          current=index;const r=cell.getBoundingClientRect();
          input.hidden=arrow.hidden=false;input.value=cell.textContent;
          input.style.cssText='position:fixed;z-index:2;left:'+r.left+'px;top:'+r.top+'px;width:130px;height:28px;box-sizing:border-box';
          arrow.style.cssText='position:fixed;z-index:2;left:'+(r.left+132)+'px;top:'+r.top+'px;width:30px;height:28px';
          list.style.cssText='position:fixed;z-index:3;left:'+r.left+'px;top:'+r.bottom+'px;width:170px;background:white;border:1px solid black';
          input.focus();
        };
        body.append(cell);
      }
    });
    arrow.onclick=()=>{
      window.counts.opens++;
      if(window.removeBlackAfterFirst && window.counts.opens>=3)window.options['통합색상']=['화이트','네이비'];
      list.replaceChildren(...window.options[rows[current].type].map(label=>{
        const item=document.createElement('div');item.style.cssText='height:25px;line-height:25px';item.textContent=label;
        item.onclick=()=>{input.value=label;list.hidden=true;};return item;
      }));list.hidden=false;
    };
    input.onkeydown=event=>{
      if(event.key!=='Enter')return;
      document.getElementById(grid+'_body_gridrow_'+current+'_cell_'+current+'_11').textContent=input.value;
      input.hidden=arrow.hidden=list.hidden=true;
    };
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){window.counts.escapes++;list.hidden=true;}});
  },{rows,choices});
  const bot=new LotteAutomation('',()=>{});bot.page=page;
  let scans=0,audits=0;
  const scan=bot.scanComboLabels.bind(bot),audit=bot.auditLotteOptions.bind(bot);
  bot.scanComboLabels=async list=>{scans++;return scan(list);};
  bot.auditLotteOptions=async p=>{audits++;return audit(p);};
  return {page,bot,counts:()=>({scans,audits}),read:()=>bot.auditOptionRows('grd_OptnDtlNew')};
}

async function placeOptionsInChannel(page){
  await page.evaluate(()=>{
    const grid=document.getElementById('grd_OptnDtlNew');
    const panel='mock_chnlForm_form_div_Data';
    const viewport=document.createElement('div');
    const viewportHeight=270,gridTop=205;
    const bodyHeight=Math.max(340,window.fixtureRows.length*42);
    const contentHeight=gridTop+28+bodyHeight+72;
    viewport.id=panel+'ScrollableInnerContainerElement';
    viewport.style.cssText='position:absolute;left:20px;top:130px;width:850px;height:'+viewportHeight+'px;overflow:hidden';
    const content=document.createElement('div');
    content.style.cssText='position:absolute;width:830px;top:0;left:0;height:'+contentHeight+'px';
    grid.style.left='0';grid.style.top=gridTop+'px';grid.style.height=28+bodyHeight+'px';
    document.getElementById(grid.id+'_body').style.height=bodyHeight+'px';
    document.body.append(viewport);viewport.append(content);content.append(grid);
    const bar=document.createElement('div');
    bar.id=panel+'_vscrollbar';bar.style.cssText='position:absolute;left:870px;top:130px;width:14px;height:'+viewportHeight+'px';
    const thumb=document.createElement('div');
    const track=viewportHeight-26,thumbHeight=track*viewportHeight/contentHeight;
    thumb.id=bar.id+'_trackbar';thumb.style.cssText='position:absolute;top:13px;left:0;width:14px;height:'+thumbHeight+'px;background:#777';
    document.body.append(bar);bar.append(thumb);
    window.scrollMoves=0;let start;
    thumb.onmousedown=e=>{start={pointer:e.clientY,top:parseFloat(thumb.style.top)};};
    document.addEventListener('mousemove',e=>{
      if(!start)return;
      const top=Math.max(13,Math.min(13+track-thumbHeight,start.top+e.clientY-start.pointer));
      thumb.style.top=top+'px';
      content.style.top=(-(top-13)*(contentHeight-viewportHeight)/(track-thumbHeight))+'px';
    });
    document.addEventListener('mouseup',()=>{if(start&&parseFloat(thumb.style.top)>start.top)window.scrollMoves++;start=null;});
  });
}

async function readAllOptions(page){
  return page.evaluate(()=>{
    const read=(row,col)=>document.getElementById('grd_OptnDtlNew_body_gridrow_'+row+'_cell_'+row+'_'+col);
    return window.fixtureRows.map((_,row)=>({
      type:read(row,1).textContent,value:read(row,11).textContent,
      checked:!!read(row,12).querySelector('img').getAttribute('src'),
    }));
  });
}

test('채널 오른쪽 스크롤에 잘린 색상·사이즈를 모두 드러내 선택하고 다시 점검한다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const product={name:'테스트 재킷',colors:['01소프트베이지','02차콜','03버건디','04체리래커','05블랙'],sizes:['S','M','L']};
    const f=await fixture(browser,product,{'통합색상':['베이지','차콜','버건디','블랙','레드','체리']});
    await placeOptionsInChannel(f.page);
    assert.deepEqual((await f.bot.optionGridSnapshot('grd_OptnDtlNew')).rows.map(row=>row.source),['01소프트베이지']);
    await f.bot.matchLotteOptions(product);
    const actual=await readAllOptions(f.page);
    assert.deepEqual(actual.map(row=>row.value),['베이지','차콜','버건디','체리','블랙','S','M','L']);
    assert(actual.every(row=>row.checked));
    assert((await f.page.evaluate(()=>window.scrollMoves))>0);
    assert.equal(f.counts().audits,1);
  }finally{await browser.close();}
});

test('바지 416962의 가려진 옵션과 인치 표기 사이즈를 모두 선택하고 점검한다',async t=>{
  const browser=await chromium.launch({headless:true});
  try{
    const product={
      name:'여성 스트레이트 코듀로이 바지',sourceCategory:['WOMEN','PANTS','캐주얼팬츠'],
      colors:['01아이보리','02베이지','03와인브라운','04네이비','05차콜','06블랙'],
      sizes:['25','26','27','28','29','30'],
    };
    const colors=['아이보리','베이지','브라운','네이비','차콜','블랙'];
    const sizes=['25인치','26인치','27 인치','28인치','29인치','30인치'];
    const f=await fixture(browser,product,{'통합색상':colors,'성인 하의 사이즈':sizes});
    await placeOptionsInChannel(f.page);
    const before=await f.bot.optionGridSnapshot('grd_OptnDtlNew');
    assert.deepEqual(before.rows.map(row=>row.source),['01아이보리']);
    assert.equal(before.clippedRows.length,11);
    await f.bot.matchLotteOptions(product);
    const actual=await readAllOptions(f.page);
    assert.deepEqual(actual.map(row=>row.value),[...colors,...sizes]);
    assert.deepEqual(actual.map(row=>row.type),[
      ...colors.map(()=>'통합색상'),...sizes.map(()=>'성인 하의 사이즈'),
    ]);
    assert(actual.every(row=>row.checked));
    const scrollMoves=await f.page.evaluate(()=>window.scrollMoves);
    assert(scrollMoves>0);
    assert.equal(f.counts().audits,1);
    t.diagnostic(JSON.stringify({initiallyVisible:before.rows.length,scrollMoves,colors:colors.length,sizes:sizes.length,
      checked:actual.filter(row=>row.checked).length}));
  }finally{await browser.close();}
});

test('같은 유형의 반복 옵션은 전체 후보를 한 번만 읽고 실제 선택과 전체 점검은 유지',async t=>{
  const browser=await chromium.launch({headless:true});
  try{
    const product={name:'테스트 바지',sourceCategory:['PANTS'],colors:['01화이트','02블랙','03네이비'],sizes:['M','L']};
    const f=await fixture(browser,product),start=performance.now();
    await f.bot.matchLotteOptions(product);
    const elapsedMs=Math.round(performance.now()-start),actions=await f.page.evaluate(()=>window.counts);
    const actual=await f.read();
    assert.deepEqual(actual.map(row=>row.value),['화이트','블랙','네이비','M','L']);
    assert(actual.every(row=>row.checked));
    assert.deepEqual(f.counts(),{scans:2,audits:1});
    t.diagnostic(JSON.stringify({rows:5,types:2,...actions,elapsedMs}));
    assert.deepEqual(actions,{opens:7,escapes:2},'각 행의 선택 5회 + 유형별 최초 후보 조사 2회만 연다');
    await f.bot.matchLotteOptions(product);
    assert.deepEqual(f.counts(),{scans:4,audits:2},'후보 캐시는 이번 실행 안에서만 재사용한다');
  }finally{await browser.close();}
});

test('재사용 후보에 일치하는 색상이 없으면 체크나 전체 완료로 넘어가지 않는다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const product={name:'테스트 바지',colors:['01화이트','02라즈베리'],sizes:[]};
    const f=await fixture(browser,product);
    await assert.rejects(()=>f.bot.matchLotteOptions(product),/유사한 롯데ON 옵션값을 찾지 못했습니다/);
    assert.deepEqual(f.counts(),{scans:1,audits:0});
    const rows=await f.read();assert.equal(rows[0].checked,true);assert.equal(rows[1].checked,false);
  }finally{await browser.close();}
});

test('채널 창에 동일한 기본 옵션 두 줄이 있으면 빈 페이지용 표를 건너뛰고 기존 옵션에서 이어간다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    const product={name:'테스트 재킷',colors:['01소프트베이지','02차콜'],sizes:['S','M']};
    const area='mock_chnlForm_form_div_Data_div_input12_div_body';
    const base=area+'_grd_OptnDtl';
    const directRows=[
      ['직접입력1','색상',product.colors.join(',')],
      ['직접입력2','사이즈',product.sizes.join(',')],
    ];
    await page.setContent('<section id="'+area+'"><div id="'+area+'_div_Page_grd_OptnDtl">페이지 정보</div><div id="'+base+'">'+
      directRows.flatMap((values,i)=>values.map((value,col)=>'<div id="'+base+'_body_gridrow_'+(i+2)+'_cell_'+(i+2)+'_'+col+'">'+value+'</div>')).join('')+
      '</div><div id="'+base+'New"><div id="'+base+'New_body_gridrow_0_cell_0_2">01소프트베이지</div></div></section>');
    const bot=new LotteAutomation('',()=>{});bot.page=page;
    bot.applyChannelPreset=async()=>assert.fail('이미 입력된 옵션의 프리셋을 다시 적용하면 안 됨');
    const actions=[];
    bot.matchLotteOptions=async p=>{assert.equal(p,product);actions.push('옵션 선택');};
    bot.textClick=async label=>actions.push(label);
    bot.modalConfirm=bot.set=bot.snapshot=async()=>{};
    await bot.channel(product,'',{resume:true});
    assert.deepEqual(actions,['옵션 선택','롯데ON옵션적용','온라인재고일괄등록','제한']);
    assert.equal(await bot.canResumeChannelOptions({...product,sizes:['S','L']}),false);
  }finally{await browser.close();}
});

test('조사 뒤 실제 목록이 바뀌면 캐시만 믿고 옵션을 완료하지 않는다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const product={name:'테스트 바지',colors:['01화이트','02블랙'],sizes:[]};
    const f=await fixture(browser,product);
    await f.page.evaluate(()=>window.removeBlackAfterFirst=true);
    await assert.rejects(()=>f.bot.matchLotteOptions(product),/같거나 유사한 분류를 찾지 못했습니다/);
    assert.deepEqual(f.counts(),{scans:1,audits:0});
    const rows=await f.read();assert.equal(rows[0].checked,true);assert.equal(rows[1].checked,false);
  }finally{await browser.close();}
});
