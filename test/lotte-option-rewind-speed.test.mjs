import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';

const grid='grd_OptnDtlNew';
const root='WorkFrame_fixture_'+grid;
const expected=['01화이트','07블랙','M','L'];

async function fixture(browser,options={}) {
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  await page.setContent(`<style>
    body{margin:0}.cell{position:absolute;height:32px;width:140px;box-sizing:border-box;padding:4px}
    #${root}{position:absolute;left:20px;top:20px;width:760px;height:360px}
    #${root}_head{position:absolute;left:0;top:0;width:700px;height:30px}
    #${root}_body{position:absolute;left:0;top:30px;width:700px;height:300px;overflow:hidden}
    #${root}_vscrollbar{position:absolute;left:710px;top:30px;width:18px;height:300px}
    #${root}_vscrollbar_decbutton{position:absolute;left:0;top:0;width:18px;height:13px;padding:0;border:0}
    #${root}_vscrollbar_trackbar{position:absolute;left:0;top:13px;width:18px;height:60px;background:#777}
    #cover{position:absolute;z-index:20;left:210px;top:50px;width:170px;height:35px;background:white}
  </style><div id="${root}"><div id="${root}_head">옵션</div><div id="${root}_body">
    <div class="cell" id="${root}_body_gridrow_0_cell_0_0" style="left:0;top:0">색상</div>
    <div class="cell" id="${root}_body_gridrow_0_cell_0_2" style="left:200px;top:0">07 블랙</div>
  </div><div id="${root}_vscrollbar"><button id="${root}_vscrollbar_decbutton">↑</button><div id="${root}_vscrollbar_trackbar"></div></div></div>`);
  await page.evaluate(({root,options})=>{
    const source=document.getElementById(root+'_body_gridrow_0_cell_0_2');
    const thumb=document.getElementById(root+'_vscrollbar_trackbar');
    const up=document.getElementById(root+'_vscrollbar_decbutton');
    const bar=document.getElementById(root+'_vscrollbar');
    window.rewindCounts={ups:0};
    if(options.source!==undefined)source.textContent=options.source;
    if(options.rowTop!==undefined)source.style.top=options.rowTop+'px';
    if(options.thumbTop!==undefined)thumb.style.top=options.thumbTop+'px';
    if(options.upTop!==undefined)up.style.top=options.upTop+'px';
    if(options.cover){const cover=document.createElement('div');cover.id='cover';document.body.append(cover);}
    if(options.duplicate){
      const duplicate=source.cloneNode(true);duplicate.textContent=options.duplicate==='offscreen'?'':'01화이트';
      duplicate.style.left='400px';duplicate.style.top=options.duplicate==='offscreen'?'400px':'0px';
      source.before(duplicate);
    }
    let dragOffset=null;
    thumb.onmousedown=e=>{dragOffset=e.clientY-thumb.getBoundingClientRect().top;};
    window.addEventListener('mousemove',e=>{
      if(dragOffset===null||options.ignoreDrag)return;
      const top=Math.max(13,Math.min(bar.offsetHeight-13-thumb.offsetHeight,e.clientY-bar.getBoundingClientRect().top-dragOffset));
      thumb.style.top=top+'px';
    });
    window.addEventListener('mouseup',()=>dragOffset=null);
    up.onclick=()=>{
      window.rewindCounts.ups++;
      if(options.recoverAfter&&window.rewindCounts.ups>=options.recoverAfter){
        thumb.style.top='13px';source.style.top='0px';source.textContent='07 블랙';
      }
    };
  },{root,options});
  const bot=new LotteAutomation('',()=>{});bot.page=page;
  let drags=0;
  const drag=bot.smoothDrag.bind(bot);
  bot.smoothDrag=async(...args)=>{drags++;return drag(...args);};
  return {page,bot,counts:async()=>({drags,...await page.evaluate(()=>window.rewindCounts)})};
}

async function auditFixture(browser,{row=0,type='통합색상',value='블랙'}={}) {
  const f=await fixture(browser);
  await f.page.evaluate(({root,row,type,value})=>{
    const body=document.getElementById(root+'_body');
    for(const [column,left,text] of [[1,350,type],[11,500,value],[12,650,'']]){
      const cell=document.createElement('div');cell.className='cell';
      cell.id=root+'_body_gridrow_0_cell_0_'+column+(column===12?'_controlcheckbox':'');
      cell.style.cssText='left:'+left+'px;top:0;width:'+(column===12?'40':'140')+'px';cell.textContent=text;
      if(column===12)cell.innerHTML='<div id="fixture_chkimgImageElement"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div>';
      body.append(cell);
    }
    if(row!==0)for(const cell of body.children)cell.id=cell.id.replace('gridrow_0_cell_0','gridrow_'+row+'_cell_'+row);
    document.getElementById(root+'_vscrollbar_trackbar').style.height='250px';
  },{root,row,type,value});
  return f;
}

test('실제 첫 행과 스크롤 최상단이 확인되면 드래그와 위 클릭을 모두 생략',async t=>{
  const browser=await chromium.launch({headless:true});
  try{
    const f=await fixture(browser),start=performance.now();
    assert.equal(await f.bot.optionGridAtTop(grid,expected),true,'요청 배열의 첫 01색상이 아닌 실제 첫 07색상도 허용');
    await f.bot.scrollOptionGrid(grid,0,expected);
    assert.deepEqual(await f.counts(),{drags:0,ups:0});
    t.diagnostic(JSON.stringify({elapsedMs:Math.round(performance.now()-start),...await f.counts()}));
  }finally{await browser.close();}
});

test('중복 ID의 화면 밖 빈 재활용 셀은 정상 첫 행의 증거를 대신하지 않는다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const f=await fixture(browser,{duplicate:'offscreen'});
    assert.equal(await f.bot.optionGridAtTop(grid,expected),true);
    await f.page.locator(`[id="${root}_body_gridrow_0_cell_0_2"]`).last().evaluate(e=>e.textContent='');
    assert.equal(await f.bot.optionGridAtTop(grid,expected),false,'첫 행 원본이 비었는데 복제된 row0 ID만으로 완료하지 않음');
  }finally{await browser.close();}
});

test('썸 위치만 맞거나 행이 가려졌거나 증거가 모호하면 최상단으로 판단하지 않는다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const options of [{source:''},{source:'다른 상품'},{rowTop:45},{thumbTop:25},{upTop:8},{cover:true},{duplicate:'visible'}]){
      const f=await fixture(browser,options);
      assert.equal(await f.bot.optionGridAtTop(grid,expected),false,JSON.stringify(options));
      await f.page.close();
    }
    const f=await fixture(browser);
    assert.equal(await f.bot.optionGridAtTop(grid,[]),false,'빈 기대 목록으로 일치 증거를 만들지 않음');
  }finally{await browser.close();}
});

test('가상 첫 행이 늦게 돌아오면 기존 이동 후 증거 확인 시에만 반복을 멈춘다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const f=await fixture(browser,{source:'',thumbTop:80,ignoreDrag:true,recoverAfter:3});
    assert.equal(await f.bot.optionGridAtTop(grid,expected),false);
    await f.bot.scrollOptionGrid(grid,0,expected);
    const counts=await f.counts();
    assert.equal(counts.drags,1);
    assert(counts.ups>=3&&counts.ups<40,'첫 행 반영 전에는 멈추지 않고 반영 뒤 기존 40회보다 일찍 종료');
    assert.equal(await f.bot.optionGridAtTop(grid,expected),true);
  }finally{await browser.close();}
});

test('끝까지 확인할 수 없는 상태는 기존 최대 40회 복구를 유지한다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const f=await fixture(browser,{source:'다른 상품',ignoreDrag:true});
    await f.bot.scrollOptionGrid(grid,0,expected);
    assert.deepEqual(await f.counts(),{drags:1,ups:40});
    assert.equal(await f.bot.optionGridAtTop(grid,expected),false);
  }finally{await browser.close();}
});

test('아래 이동과 중단 요청은 최상단 조기종료와 별도로 유지한다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const f=await fixture(browser);
    await f.bot.scrollOptionGrid(grid,null,expected);
    assert.deepEqual(await f.counts(),{drags:1,ups:0});
    f.bot.stopped=true;
    await assert.rejects(()=>f.bot.scrollOptionGrid(grid,0,expected),/중단/);
    assert.deepEqual(await f.counts(),{drags:1,ups:0});
  }finally{await browser.close();}
});

test('전체 직접입력 감사도 실제 첫 행 증거가 있으면 12회 위 클릭을 생략하고 행 검증을 완료',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const f=await auditFixture(browser);
    assert.deepEqual((await f.bot.auditOptionRows(grid)).map(({source,type,value,checked})=>({source,type,value,checked})),[
      {source:'07 블랙',type:'통합색상',value:'블랙',checked:true}
    ]);
    await f.bot.checkAllDirectInputs({colors:['07블랙'],sizes:[],name:'테스트 바지'});
    const counts=await f.counts();assert.equal(counts.ups,0);assert(counts.drags>0,'전체 감사의 아래/위 이동은 유지');
  }finally{await browser.close();}
});

test('전체 감사에서 첫 행을 증명할 수 없으면 기존 12회 복구를 유지',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const f=await auditFixture(browser,{row:1});
    assert.equal(await f.bot.optionGridAtTop(grid,expected),false);
    await f.bot.checkAllDirectInputs({colors:['07블랙'],sizes:[],name:'테스트 바지'});
    assert.equal((await f.counts()).ups,12);
  }finally{await browser.close();}
});

test('최상단 증거가 있어도 감사의 누락 옵션과 잘못된 직접입력 유형을 통과시키지 않는다',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const [options,product,missing] of [
      [{},{colors:['07블랙'],sizes:['M'],name:'테스트 바지'},'M'],
      [{type:'성인 하의 사이즈'},{colors:['07블랙'],sizes:[],name:'테스트 바지'},'07블랙']
    ]){
      const f=await auditFixture(browser,options);
      await assert.rejects(()=>f.bot.checkAllDirectInputs(product),new RegExp('전체 점검 누락: '+missing));
      assert.equal((await f.counts()).ups,0);await f.page.close();
    }
  }finally{await browser.close();}
});
