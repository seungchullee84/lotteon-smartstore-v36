import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';

async function fixture(browser, product) {
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const rows=[...product.colors.map(source=>({source,kind:'색상',type:'통합색상'})),...product.sizes.map(source=>({source,kind:'사이즈',type:'성인 하의 사이즈'}))];
  await page.setContent('<style>body{margin:0}.cell{position:absolute;box-sizing:border-box;height:34px;padding:5px;font:14px sans-serif}.checked{width:20px;height:20px}#grd_OptnDtlNew{position:absolute;left:20px;top:20px;width:830px;height:380px}#grd_OptnDtlNew_head{height:28px}#grd_OptnDtlNew_body{position:relative;height:340px}</style><div id="grd_OptnDtlNew"><div id="grd_OptnDtlNew_head">옵션</div><div id="grd_OptnDtlNew_body"></div></div><input hidden id="grd_OptnDtlNew_controlcombo_comboedit_input"><button hidden id="grd_OptnDtlNew_controlcombo_dropbutton">목록</button><div hidden id="grd_OptnDtlNew_controlcombo_combolistScrollableContainerElement"></div>');
  await page.evaluate(rows=>{
    const grid='grd_OptnDtlNew',body=document.getElementById(grid+'_body');
    const input=document.getElementById(grid+'_controlcombo_comboedit_input');
    const arrow=document.getElementById(grid+'_controlcombo_dropbutton');
    const list=document.getElementById(grid+'_controlcombo_combolistScrollableContainerElement');
    window.fixtureRows=rows;
    window.counts={opens:0,escapes:0};
    window.options={'통합색상':['화이트','블랙','네이비'],'성인 하의 사이즈':['S','M','L']};
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
  },rows);
  const bot=new LotteAutomation('',()=>{});bot.page=page;
  let scans=0,audits=0;
  const scan=bot.scanComboLabels.bind(bot),audit=bot.auditLotteOptions.bind(bot);
  bot.scanComboLabels=async list=>{scans++;return scan(list);};
  bot.auditLotteOptions=async p=>{audits++;return audit(p);};
  return {page,bot,counts:()=>({scans,audits}),read:()=>bot.auditOptionRows('grd_OptnDtlNew')};
}

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
