import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LotteAutomation} from '../automation.mjs';

const grid='grd_OptnDtlNew';
const root='WorkFrame_virtual_'+grid;
const product={name:'회귀 테스트 바지',sourceCategory:['PANTS'],colors:['01화이트','03브라운','04베이지','05미드헤더그레이','06블루','07블랙','08네이비'],sizes:[]};
const selected=['화이트','브라운','베이지','그레이','블루','블랙','네이비'];

async function virtualFixture(browser){
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  await page.setContent(`<style>
    body{margin:0}.cell{position:absolute;height:34px;box-sizing:border-box;padding:4px;font:14px sans-serif}
    #${root}{position:absolute;left:20px;top:20px;width:830px;height:330px}
    #${root}_head{height:30px;width:740px}
    #${root}_body{position:relative;height:294px;width:740px;overflow:hidden}
    #${root}_vscrollbar{position:absolute;left:770px;top:30px;width:18px;height:294px}
    #${root}_vscrollbar_decbutton,#${root}_vscrollbar_incbutton{position:absolute;left:0;width:18px;height:13px;padding:0;border:0}
    #${root}_vscrollbar_decbutton{top:0}#${root}_vscrollbar_incbutton{bottom:0}
    #${root}_vscrollbar_trackbar{position:absolute;left:0;top:13px;width:18px;height:60px;background:#777}
  </style><div id="${root}"><div id="${root}_head">옵션</div><div id="${root}_body"></div>
    <div id="${root}_vscrollbar"><button id="${root}_vscrollbar_decbutton">↑</button><div id="${root}_vscrollbar_trackbar"></div><button id="${root}_vscrollbar_incbutton">↓</button></div>
  </div><input hidden id="${root}_controlcombo_comboedit_input"><button hidden id="${root}_controlcombo_dropbutton">목록</button><div hidden id="${root}_controlcombo_combolistScrollableContainerElement"></div>`);
  await page.evaluate(({root,colors,selected})=>{
    const body=document.getElementById(root+'_body'),bar=document.getElementById(root+'_vscrollbar');
    const thumb=document.getElementById(root+'_vscrollbar_trackbar');
    const input=document.getElementById(root+'_controlcombo_comboedit_input');
    const drop=document.getElementById(root+'_controlcombo_dropbutton'),list=document.getElementById(root+'_controlcombo_combolistScrollableContainerElement');
    const rows=colors.map(source=>({source,type:'통합색상',value:'',checked:false,edits:0}));
    const image='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    let offset=0,collapsed=false,current=-1,pending,drag=null;
    const maxTrack=294-26-60;
    const counts={drags:0,up:0,down:0,collapsed:0,arrowSources:[]};
    const render=()=>{
      body.replaceChildren();body.style.height=collapsed?'42px':'294px';
      rows.forEach((row,index)=>{
        // The DOM row number is a circular rendering slot, not source index/order.
        const slot=(index+offset*2)%rows.length;
        for(const [column,left,width]of[[0,0,75],[1,80,175],[2,260,155],[11,420,165],[12,590,35]]){
          const cell=document.createElement('div');cell.className='cell';
          cell.id=root+'_body_gridrow_'+slot+'_cell_'+slot+'_'+column;
          cell.style.cssText='left:'+left+'px;top:'+((index-offset)*42)+'px;width:'+width+'px';
          if(column===12){
            const checkbox=document.createElement('div');checkbox.id=cell.id+'_controlcheckbox';checkbox.style.cssText='width:24px;height:24px';
            const mark=document.createElement('div');mark.id=cell.id+'_chkimgImageElement';mark.style.cssText='width:20px;height:20px';
            const img=document.createElement('img');if(row.checked)img.src=image;mark.append(img);checkbox.append(mark);cell.append(checkbox);
            checkbox.onclick=()=>{
              row.checked=true;img.src=image;
              // First input focus/checkbox reduces the currently exposed viewport.
              // The existing large thumb step then jumps over the four middle colors.
              if(index===0&&!collapsed){collapsed=true;body.style.height='42px';counts.collapsed++;}
            };
          }else cell.textContent=column===0?'색상':column===1?row.type:column===2?row.source:row.value;
          if(column===11)cell.onclick=()=>{
            current=index;const r=cell.getBoundingClientRect();input.hidden=drop.hidden=false;input.value=row.value;
            input.style.cssText='position:fixed;z-index:2;left:'+r.left+'px;top:'+r.top+'px;width:130px;height:28px;box-sizing:border-box';
            drop.style.cssText='position:fixed;z-index:2;left:'+(r.left+132)+'px;top:'+r.top+'px;width:30px;height:28px';
            list.style.cssText='position:fixed;z-index:3;left:'+r.left+'px;top:'+r.bottom+'px;width:170px;background:white;border:1px solid black';input.focus();
          };
          body.append(cell);
        }
      });
    };
    const position=(next,delay=0)=>{
      clearTimeout(pending);offset=Math.max(0,Math.min(rows.length-1,next));
      thumb.style.top=(13+offset*maxTrack/(rows.length-1))+'px';
      if(delay)pending=setTimeout(render,delay);else render();
    };
    thumb.onmousedown=e=>{drag={startY:e.clientY,top:parseFloat(thumb.style.top)||13,startOffset:offset};};
    window.addEventListener('mousemove',e=>{if(drag)thumb.style.top=Math.max(13,Math.min(13+maxTrack,drag.top+e.clientY-drag.startY))+'px';});
    window.addEventListener('mouseup',()=>{
      if(!drag)return;counts.drags++;
      const delta=parseFloat(thumb.style.top)-drag.top;
      const next=delta<-1?0:delta>1?(drag.startOffset===0?5:6):drag.startOffset;
      drag=null;position(next);
    });
    for(const [suffix,direction]of[['decbutton',-1],['incbutton',1]])document.getElementById(root+'_vscrollbar_'+suffix).onclick=()=>{
      counts[direction<0?'up':'down']++;const next=Math.max(0,Math.min(rows.length-1,offset+direction));
      counts.arrowSources.push(rows[next].source);position(next,70);
    };
    drop.onclick=()=>{
      list.replaceChildren(...selected.map(label=>{const item=document.createElement('div');item.style.cssText='height:25px;line-height:25px';item.textContent=label;
        item.onclick=()=>{input.value=label;list.hidden=true;};return item;}));list.hidden=false;
    };
    input.onkeydown=e=>{
      if(e.key!=='Enter')return;rows[current].value=input.value;rows[current].edits++;
      input.hidden=drop.hidden=list.hidden=true;render();
    };
    document.addEventListener('keydown',e=>{if(e.key==='Escape')list.hidden=true;});
    render();window.fixtureState=()=>({rows:rows.map(row=>({...row})),offset,counts:{...counts,arrowSources:[...counts.arrowSources]}});
  },{root,colors:product.colors,selected});
  const logs=[];const bot=new LotteAutomation('',message=>logs.push(message));bot.page=page;
  return {page,bot,logs};
}

test('가상 행 순환과 큰 스크롤로 빠진 연속 네 색상을 한 줄 복구로 모두 입력하고 전체 감사',async t=>{
  const browser=await chromium.launch({headless:true});
  try{
    const {page,bot,logs}=await virtualFixture(browser);
    await bot.matchLotteOptions(product);
    const state=await page.evaluate(()=>window.fixtureState());
    assert.deepEqual(state.rows.map(row=>row.value),selected,'03~06을 포함한 실제 옵션값 모두 확인');
    assert(state.rows.every(row=>row.checked),'모든 원본 행의 직접입력 체크 확인');
    assert.deepEqual(state.rows.map(row=>row.edits),Array(7).fill(1),'이미 완료된 행을 중복 입력하지 않음');
    assert.equal(state.counts.collapsed,1);assert(state.counts.drags>0);assert(state.counts.down>=4);
    for(const source of product.colors.slice(1,5))assert(state.counts.arrowSources.includes(source),'화살표 복구로 실제 중간 행 방문: '+source);
    assert(logs.some(log=>/한 줄씩/.test(log)),'빠른 검사 실패 뒤 복구 경로 실행');
    assert(logs.some(log=>/7\/7개 직접입력 체크 확인/.test(log)),'기존 전체 감사도 일곱 행 확인');
    t.diagnostic(JSON.stringify({rows:state.rows.length,counts:{...state.counts,arrowSources:[...new Set(state.counts.arrowSources)]}}));
  }finally{await browser.close();}
});
