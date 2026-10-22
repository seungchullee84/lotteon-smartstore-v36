import {resolveCatalogCategory} from './category-catalog.mjs';
import {categoryKey,loadCategoryCache,saveCategoryMatch} from './category-cache.mjs';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {OptionCoverage} from './option-coverage.mjs';
import {categoryAlternatives,similarCategory,channelCategoryPath} from './category.mjs';
import { matchColor, validateStyle } from './product.mjs';
import {buildDetailContent} from './detail-html.mjs';
import {prepareMainImage} from './main-image.mjs';

const PORTAL='https://together.lotteshopping.com/EMDV3/index.html';
export class LotteAutomation {
  constructor(root,log){this.root=root;this.log=log;this.stopped=false;this.pending=null;}
  async stop(){
    this.stopped=true;this.pending?.reject(Error('사용자가 중단했습니다.'));this.pending=null;
    // Disconnect this automation client to cancel Playwright's in-flight waits.
    // The separately launched Chrome window and entered form stay open.
    const connection=this.browser;this.browser=null;this.context=null;this.page=null;
    if(connection)await connection.close().catch(()=>{});
  }
  check(){if(this.stopped) throw Error('사용자가 중단했습니다.');}
  async open(){
    // A loopback CDP connection survives app restarts; ordinary Chrome profiles are untouched.
    const profile=path.join(this.root,'browser-profile-chrome-v2');
    await mkdir(profile,{recursive:true});
    const connect=async()=>{
      const port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
      if(!Number.isInteger(port)||port<1024||port>65535)throw Error('크롬 연결 포트 확인 실패');
      this.browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:2000});
      this.context=this.browser.contexts()[0];
    };
    if(!this.browser?.isConnected()){
      try{await connect();}catch{
        const exe=path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe');
        const child=spawn(exe,['--user-data-dir='+profile,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check',PORTAL],{detached:true,stdio:'ignore'});
        let launchError;child.on('error',e=>{launchError=e;});child.unref();
        let connected=false;
        for(let n=0;n<30;n++){if(launchError)throw Error('크롬을 실행하지 못했습니다: '+launchError.message);try{await connect();connected=true;break;}catch{await new Promise(r=>setTimeout(r,400));}}
        if(!connected)throw Error('전용 크롬 연결에 실패했습니다. 크롬 설치와 창 실행 상태를 확인해 주세요.');
      }
    }
    const pages=this.context.pages().filter(p=>!p.isClosed());
    this.page=pages.find(p=>p.url().startsWith('https://together.lotteshopping.com/'))||await this.context.newPage();
    this.page.setDefaultTimeout(8000);
    if(!this.page.url().startsWith('https://together.lotteshopping.com/'))await this.page.goto(PORTAL,{waitUntil:'domcontentloaded'});
    const cdp=await this.context.newCDPSession(this.page);
    try{const {windowId}=await cdp.send('Browser.getWindowForTarget');await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'maximized'}});}finally{await cdp.detach();}
    await this.page.bringToFront();
    this.log('크롬 로그인 창을 열었습니다. 이미 열려 있으면 기존 창에 다시 연결합니다. 로그인 후 상품등록 화면을 열어 주세요.');
  }
  async wait(message){
    this.log(message); this.onPause?.(message);
    await new Promise((resolve,reject)=>{this.pending={resolve,reject};}); this.pending=null;this.check();
  }
  resume(){this.pending?.resolve();}
  locator(suffix){
    const selector=suffix==='div_Chnl_cbo_Chnl_comboedit_input'||suffix==='div_Chnl_cbo_Chnl_dropbutton'||suffix==='div_Chnl_cbo_Chnl_combolistScrollableContainerElement'
      ? `[id*="WorkFrame_OCPIPMPiMPrdcInfoRgstM_"][id$="${suffix}"]` : `[id$="${suffix}"]`;
    return this.page.locator(selector).filter({visible:true}).last();
  }
  async activateRegistration(){
    // An unfinished category dialog blocks all background tab clicks.
    const categoryPopup=this.page.locator('[id$="rppluClsf"]').filter({visible:true});
    if(await categoryPopup.count()){
      await this.textClick('취소',categoryPopup.last());await this.settle();
      this.log('이전 분류 조회창을 닫고 기존 상품등록 화면으로 돌아왔습니다.');
    }
    const tabs=this.page.locator('[id*="TabFrame_form_tab_Menu_OCPIPMPiMPrdcInfoRgstM_"]');
    const ids=await tabs.evaluateAll(es=>es.filter(e=>/tab_Menu_OCPIPMPiMPrdcInfoRgstM_\d+_\d+$/.test(e.id)).map(e=>e.id));
    if(ids.length!==1)throw Error('상품등록 탭을 하나 열어 주세요.');
    const tab=this.page.locator('[id="'+ids[0]+'_tabbuttonTextBoxElement"]');
    const active=await this.page.locator('[id*="WorkFrame_OCPIPMPiMPrdcInfoRgstM_"][id$="cbo_PrdcClCd_comboedit_input"]').evaluateAll(es=>es.some(e=>{
      const r=e.getBoundingClientRect(),hit=e.ownerDocument.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width>0&&r.height>0&&hit&&(hit===e||e.contains(hit));
    }));
    if(!active){await tab.click();await this.settle();}
  }
  async reveal(loc){
    this.check();if(loc.waitFor)await loc.waitFor({state:'attached',timeout:8000});
    let previous='',unchanged=0,last;
    for(let n=0;n<24;n++){
      this.check();
      last=await loc.evaluate(el=>{
        const doc=el.ownerDocument,win=doc.defaultView,r=el.getBoundingClientRect();
        const viewport={left:0,top:0,right:win.innerWidth,bottom:win.innerHeight};
        let clip={...viewport};const surfaces=[];let scrollbar=null;
        for(let p=el.parentElement;p;p=p.parentElement){const pr=p.getBoundingClientRect(),st=win.getComputedStyle(p);
          if(!scrollbar&&/ScrollableInnerContainerElement$/.test(p.id)){const base=p.id.replace(/ScrollableInnerContainerElement$/,'');const bar=doc.getElementById(base+'_vscrollbar'),thumb=doc.getElementById(base+'_vscrollbar_trackbar');if(bar&&thumb){const br=bar.getBoundingClientRect(),tr=thumb.getBoundingClientRect();if(br.width>0&&tr.height>0&&tr.height<br.height-30)scrollbar={x:tr.x+tr.width/2,y:tr.y+tr.height/2,thumbTop:tr.y,thumbHeight:tr.height,top:br.y+13,bottom:br.bottom-13,viewHeight:pr.height};}} if(/hidden|auto|scroll|clip/.test(st.overflow+st.overflowX+st.overflowY)){
          const v={left:Math.max(0,pr.left),top:Math.max(0,pr.top),right:Math.min(win.innerWidth,pr.right),bottom:Math.min(win.innerHeight,pr.bottom)};
          if(v.right-v.left>100&&v.bottom-v.top>100&&p.scrollHeight>p.clientHeight+10)surfaces.push(v);
          clip={left:Math.max(clip.left,pr.left),top:Math.max(clip.top,pr.top),right:Math.min(clip.right,pr.right),bottom:Math.min(clip.bottom,pr.bottom)};
        }}
        const x=r.x+r.width/2,y=r.y+r.height/2,hit=doc.elementFromPoint(x,y);
        const visible=r.width>0&&r.height>0&&x>=clip.left&&x<=clip.right&&y>=clip.top&&y<=clip.bottom&&!!hit&&(el.contains(hit)||hit.contains(el));
        const surface=surfaces.at(-1)||viewport;
        return {scrollbar,visible,id:el.id||el.textContent?.trim().slice(0,45),x:r.x,y:r.y,width:r.width,height:r.height,clip,surface,blocker:hit?.id||hit?.tagName};
      });
      // Already visible and unobstructed: avoid cosmetic recentering.
      if(last.visible)return;
      if(!last.width||!last.height)throw Error('입력란이 숨겨져 있습니다: '+last.id);
      const v=last.surface;
      const top=Math.max(v.top,last.clip.top),bottom=Math.min(v.bottom,last.clip.bottom);
      const center=last.y+last.height/2;
      const direction=center<top+16?-1:center>bottom-16?1:0;
      if(!direction){if(n<10){await this.page.waitForTimeout(150);continue;}throw Error('안내창 또는 로딩 화면이 입력란을 가리고 있습니다: '+last.id+' / '+last.blocker);}
      const signature=[last.x,last.y,v.top,v.bottom].join(':');unchanged=signature===previous?unchanged+1:0;previous=signature;
      if(unchanged>=4)break;
      if(last.scrollbar){const t=last.scrollbar;const delta=(center-(v.top+v.bottom)/2)*t.thumbHeight/t.viewHeight;const target=Math.max(t.top+t.thumbHeight/2,Math.min(t.bottom-t.thumbHeight/2,t.y+delta));if(Math.abs(target-t.y)>2){await this.smoothDrag(t.x,t.y,target);continue;}}
      await this.page.mouse.move(v.left+4,Math.min(v.bottom-24,Math.max(v.top+24,(v.top+v.bottom)/2)));
      await this.page.mouse.wheel(0,direction*Math.min(500,Math.max(100,(v.bottom-v.top)*.55)));
      await this.page.waitForTimeout(100);
    }
    throw Error('입력란 이동 실패: '+last?.id+' (현재 화면 '+Math.round(last?.y||0)+'px). 등록 팝업 또는 화면 배율을 확인해 주세요.');
  }
  async smoothDrag(x,from,to,fast=false){
    await this.page.mouse.move(x,from);await this.page.mouse.down();
    try{const steps=fast?3:10;for(let i=1;i<=steps;i++){this.check();const t=i/steps,eased=t*t*(3-2*t);await this.page.mouse.move(x,from+(to-from)*eased);if(!fast)await this.page.waitForTimeout(12);}}
    finally{await this.page.mouse.up();}
    await this.page.waitForTimeout(fast?60:100);
  }
  async pace(){this.check();await this.page.waitForTimeout(150);this.check();}
  async click(loc){this.check();await this.reveal(loc);await loc.click();await this.pace();}
  async set(suffix,value){const loc=this.locator(suffix);await this.click(loc);await loc.fill(String(value));await this.pace();await loc.press('Tab');await this.pace();}
  async textClick(text,scope=this.page){await this.click(scope.getByText(text,{exact:true}).filter({visible:true}).last());}
  async settle(){await this.page.locator('[id$="waitwindow"]').waitFor({state:'hidden',timeout:45000}).catch(()=>{});this.check();}
  async combo(suffix,choice,allowSimilar=false,knownLabels=null){
    const input=this.locator(suffix+'_comboedit_input');
    await this.reveal(input);
    const list=this.page.locator('[id$="'+suffix+'_combolistScrollableContainerElement"]').filter({visible:true}).last();
    if(!await list.count()){const arrow=this.locator(suffix+'_dropbutton');await arrow.click();}
    await list.waitFor({state:'visible',timeout:4000});
    const clickMatch=async()=>{
      const label=choice.replace(/^[^:：]*[:：]\s*/,'');
      const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const targets=list.getByText(new RegExp('^\\s*(?:[^:：]+[:：]\\s*)?'+escaped+'\\s*$'));
      for(let i=0;i<await targets.count();i++){
        const target=targets.nth(i);
        const ready=await target.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=e.ownerDocument.elementFromPoint(x,y);return r.width>0&&r.height>0&&!!hit&&(e===hit||e.contains(hit));});
        if(ready){await target.click();await this.settle();await this.pace();return true;}
      }
      return false;
    };
    if(await clickMatch())return;
    const index=knownLabels?.indexOf(choice)??-1;
    if(index>=0){
      const metrics=await list.evaluate(e=>{const row=e.querySelector('[id$="itemTextBoxElement"],[id$="textBoxElement"],[id$="TextBoxElement"]');return {height:e.clientHeight,rowHeight:row?.getBoundingClientRect().height||22};});
      const visible=Math.max(1,metrics.height/metrics.rowHeight);
      const fraction=Math.max(0,Math.min(1,(index-visible/2)/Math.max(1,knownLabels.length-visible)));
      await this.scrollComboList(list,false,fraction);
      if(await clickMatch())return;
    }
    await this.scrollComboList(list,true);
    const seen=new Set();
    for(let n=0;n<120;n++){
      for(const label of (await list.innerText()).split('\n').map(x=>x.trim()).filter(Boolean))seen.add(label);
      this.check();if(await clickMatch())return;
      if(!await this.scrollComboList(list))break;
    }
    await this.page.keyboard.press('Escape');
    if(allowSimilar){const selected=similarCategory(choice,[...seen]);if(selected){this.log('유사 분류 선택: '+choice+' → '+selected);return this.combo(suffix,selected,false);}}
    throw Error('같거나 유사한 분류를 찾지 못했습니다: '+choice);
  }
  async comboLabels(list){
    // Skins use different item text IDs; rendered text also covers those variants.
    const texts=await list.locator('[id$="itemTextBoxElement"],[id$="textBoxElement"],[id$="TextBoxElement"]').allTextContents();
    texts.push(await list.innerText());
    return [...new Set(texts.flatMap(text=>text.split(/\r?\n/)).map(text=>text.trim()).filter(Boolean))];
  }
  async scrollComboList(list,top=false,fraction=null){
    const id=await list.getAttribute('id');
    const barId=id?.replace(/ScrollableContainerElement$/,'_vscrollbar');
    const bar=this.page.locator('[id="'+barId+'"]').filter({visible:true}).last();
    const thumb=this.page.locator('[id="'+barId+'_trackbar"]').filter({visible:true}).last();
    if(await bar.count()&&await thumb.count()){
      // A Nexacro redraw can hide/recreate the thumb between two awaits.
      // Snapshot the current nodes without waiting for a vanished visible locator.
      const rect=loc=>loc.evaluateAll(es=>{const e=es.at(-1);if(!e)return null;const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});
      const b=await rect(bar),t=await rect(thumb);
      if(!b||!t)return false;
      const from=t.y+t.height/2,min=b.y+13+t.height/2,max=b.y+b.height-13-t.height/2;
      const to=top?min:fraction!==null?min+(max-min)*fraction:Math.min(max,from+Math.max(4,t.height*.65));
      if(max<=min||Math.abs(to-from)<1)return false;
      await this.smoothDrag(t.x+t.width/2,from,to,true);
      let after=await rect(thumb);
      if(after&&Math.abs(after.y-t.y)<.5){
        // Some Nexacro skins ignore a quick drag or apply it on a later paint.
        await this.page.waitForTimeout(150);after=await rect(thumb);
        if(after&&Math.abs(after.y-t.y)<.5){
          await this.smoothDrag(after.x+after.width/2,after.y+after.height/2,to,false);
          after=await rect(thumb);
        }
        if(after&&Math.abs(after.y-t.y)<.5){
          const arrow=this.page.locator('[id="'+barId+(to<from?'_decbutton':'_incbutton')+'"]').filter({visible:true}).last();
          if(await arrow.count()){await arrow.click({timeout:2000});await this.page.waitForTimeout(100);after=await rect(thumb);}
        }
      }
      if(!after){
        const reopen=this.page.locator('[id="'+barId.replace(/_combolist_vscrollbar$/,'_dropbutton')+'"]').filter({visible:true}).last();
        if(!await list.isVisible()&&await reopen.count()){
          await reopen.click();await list.waitFor({state:'visible',timeout:4000});return true;
        }
        // A re-rendered list may no longer need a scrollbar.
        if(await list.isVisible())return false;
        throw Error('스크롤 중 옵션 목록이 닫혔습니다. 다시 입력을 시작해 주세요.');
      }
      if(Math.abs(after.y-t.y)<.5){
        // Near an endpoint the control may round its position to whole rows.
        if(to<from&&after.y<=b.y+15||to>from&&after.y+after.height>=b.y+b.height-15)return false;
        throw Error('옵션 목록 이동을 재시도했지만 반영되지 않았습니다. 다른 창이 드롭다운을 가리는지 확인해 주세요.');
      }
      return true;
    }
    const box=await list.boundingBox();if(!box)return false;
    const position=()=>list.evaluate(e=>[e,...e.querySelectorAll('*')].map(n=>n.scrollTop).join(','));
    const before=await position();
    await this.page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await this.page.mouse.wheel(0,top?-100000:Math.max(80,box.height*.65));
    await this.page.waitForTimeout(120);return await position()!==before;
  }
  async scanComboLabels(list){
    await this.scrollComboList(list,true);
    const all=new Set();
    for(let scan=0;scan<120;scan++){
      this.check();
      for(const label of await this.comboLabels(list))all.add(label);
      if(!all.size&&scan<30){await this.page.waitForTimeout(150);continue;}
      // Nexacro may preload all labels, or retain the same recycled page while
      // its thumb advances. New-label count does not indicate scroll completion.
      if(!await this.scrollComboList(list)){
        await this.page.waitForTimeout(120);
        for(const label of await this.comboLabels(list))all.add(label);
        if(!all.size)throw Error('옵션 목록이 비어 있습니다. 옵션유형과 로딩 상태를 확인해 주세요.');
        return [...all];
      }
    }
    throw Error('옵션 목록 스크롤 완료를 확인하지 못했습니다.');
  }
  async modalConfirm(expected,button='확인'){
    const notice=this.page.getByText(expected,{exact:false}).filter({visible:true}).last();
    await notice.waitFor({state:'visible',timeout:45000});
    const popupId=await notice.evaluate(el=>{for(let p=el;p;p=p.parentElement){if(/(?:commAlert|commConfirm|commMessage|popConfirmPreSet)$/.test(p.id))return p.id;if(p.id?.endsWith('_form')&&el.ownerDocument.getElementById(p.id.slice(0,-5)))return p.id.slice(0,-5);}return null;});
    const scope=popupId?this.page.locator('[id="'+popupId+'"]'):this.page;
    const body=popupId?scope.locator('[id$="_form"]').first():scope;
    await body.getByText(button,{exact:true}).filter({visible:true}).last().click();
    // The modal's backdrop can outlive its text; never type through it.
    if(popupId)await scope.waitFor({state:'hidden',timeout:10000});
    else await notice.waitFor({state:'hidden',timeout:10000});
    await this.settle();await this.pace();
  }
  async gridCell(grid,row,column){
    const cell=this.page.locator(`[id$="${grid}_body_gridrow_${row}_cell_${row}_${column}"]`).filter({visible:true}).last();
    await this.click(cell);return cell;
  }
  async activateGridEditor(grid,row,column,kind){
    const cell=await this.optionCell(grid,row,column);
    if(grid==='grd_OptnDtlNew')await this.revealOptionCell(grid,cell);
    const editor=this.locator(grid+(kind==='combo'?'_controlcombo_comboedit_input':'_controledit_input'));
    const matches=async()=>{if(!await editor.count())return false;const e=await editor.boundingBox(),c=await cell.boundingBox();return !!e&&!!c&&Math.abs(e.y-c.y)<10&&e.x+e.width/2>=c.x&&e.x+e.width/2<=c.x+c.width;};
    if(await matches())return editor;
    const active=this.page.locator('[id*="'+grid+'"][id$="controledit_input"],[id*="'+grid+'"][id$="controlcombo_comboedit_input"]').filter({visible:true}).last();
    if(await active.count()){await this.page.keyboard.press('Enter');await this.pace();}
    if(grid!=='grd_OptnDtlNew')await this.reveal(cell);await cell.click();await this.pace();
    if(!await matches()){await cell.dblclick();await this.pace();}
    await editor.waitFor({state:'visible',timeout:4000});return editor;
  }
  async revealOptionCell(grid,cell){
    await this.reveal(this.locator(grid+'_head'));
    const bar=this.locator(grid+'_vscrollbar'),thumb=this.locator(grid+'_vscrollbar_trackbar');
    for(let attempt=0;attempt<40;attempt++){
      this.check();
      const pos=await cell.evaluate(e=>{const r=e.getBoundingClientRect();const prefix=e.id.split('_body_gridrow_')[0];const all=Array.from(document.querySelectorAll('[id]'));const body=all.findLast(n=>n.id===prefix+'_body')?.getBoundingClientRect();const head=all.findLast(n=>n.id===prefix+'_head')?.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {ready:!!hit&&(hit===e||e.contains(hit)),y,top:Math.max(body?.top||0,head?.bottom||0)+4,bottom:Math.min(body?.bottom||innerHeight,innerHeight)-4};});
      const inGrid=await cell.evaluate(e=>{const r=e.getBoundingClientRect(),prefix=e.id.split('_body_gridrow_')[0],body=document.getElementById(prefix+'_body')?.getBoundingClientRect(),head=document.getElementById(prefix+'_head')?.getBoundingClientRect();return !!body&&r.y+r.height/2>Math.max(body.top,head?.bottom||0)+4&&r.y+r.height/2<body.bottom-4;});
      if(inGrid){await this.reveal(cell);return;}
      if(pos.ready&&pos.y>pos.top&&pos.y<pos.bottom)return;
      if(!await bar.count()||!await thumb.count())break;
      const b=await bar.boundingBox(),t=await thumb.boundingBox();if(!b||!t)break;
      const direction=pos.y<=pos.top?-1:1;
      const arrow=this.locator(grid+'_vscrollbar_'+(direction<0?'decbutton':'incbutton'));
      if(!await arrow.count())break;
      await arrow.click();await this.page.waitForTimeout(60);
    }
    throw Error('옵션 표의 작은 스크롤로 행을 표시하지 못했습니다. 제목 아래 행 위치 확인이 필요합니다.');
  }
  async editCell(grid,row,column,value){
    const editor=await this.activateGridEditor(grid,row,column,'text');
    await editor.fill(value);await this.pace();await editor.press('Enter');await this.pace();
  }
  async gridCombo(grid,row,column,value){
    const editor=await this.activateGridEditor(grid,row,column,'combo');
    if((await editor.inputValue()).trim()!==value)await this.combo(grid+'_controlcombo',value);
    await editor.press('Enter');await this.pace();
  }
  async readCell(grid,row,col){
    const loc=await this.optionCell(grid,row,col);return (await loc.innerText()).trim();
  }
  async optionCell(grid,row,col){
    const cells=this.page.locator(`[id$="${grid}_body_gridrow_${row}_cell_${row}_${col}"]`);
    const index=await cells.evaluateAll(es=>es.findIndex(e=>{
      const r=e.getBoundingClientRect(),prefix=e.id.split('_body_gridrow_')[0];
      const body=e.ownerDocument.getElementById(prefix+'_body')?.getBoundingClientRect();
      const head=e.ownerDocument.getElementById(prefix+'_head')?.getBoundingClientRect();
      return r.width>0&&r.height>0&&(!body||(r.y+r.height/2>Math.max(body.top,head?.bottom||0)&&r.y+r.height/2<body.bottom));
    }));
    if(index<0)throw Error('표 안에 표시된 옵션 행을 찾지 못했습니다: '+grid+' / '+row+' / '+col);
    return cells.nth(index);
  }
  async snapshot(folder,name){
    await mkdir(folder,{recursive:true});await this.page.screenshot({path:path.join(folder,name+'.png')});
  }
  async run(p,folder,finalize){
    validateStyle(p.style);this.stopped=false;
    const catalogMatch=resolveCatalogCategory(p);if(catalogMatch.path){p.category=catalogMatch.category;this.log('실제 분류 매칭표 적용: '+p.category.commonSmall+' / '+p.category.channelMiddle+' > '+p.category.channelSmall)}
    if(!this.page||this.page.isClosed()||this.browser&&!this.browser.isConnected())await this.open();
    const start=Date.now();
    this.log('자동입력 시작');
    try{
      await this.activateRegistration();
      const channelOpen=await this.locator('cbo_preSet_comboedit_input').count()>0;
      if(channelOpen){
        const style=await this.page.locator('[id$="edt_style_input"]').last().inputValue();
        if(style.replace(/\s/g,'')!==p.style+'(DT)')throw Error('다른 상품의 채널 창이 열려 있습니다. 현재 창 품번: '+style);
        this.log('같은 품번의 채널 창 확인 — 신규 생성 없이 채널 설정부터 이어갑니다.');
      }else{
      // The user opens 상품등록 and resolves the initial store/product-code popup.
      if(!await this.locator('cbo_PrdcClCd_comboedit_input').count())await this.wait('브라우저에서 로그인 → 온라인 채널연계 → 상품관리 → 상품등록을 열고 매장 품번 241142를 선택한 후 계속을 눌러 주세요.');
      await this.combo('cbo_PrdcClCd','온라인 전용');
      await this.combo('cbo_StatsCd','온라인 상품 등록');
      await this.combo('div_Chnl_cbo_Chnl','파트너오피스');
      await this.combo('cbo_Prdc','파트너오피스');
      await this.textClick('신규');await this.settle();
      await this.set('edt_style_input',p.style+'(DT)');
      await this.textClick('중복확인');
      await this.modalConfirm('등록가능한 스타일코드');
      await this.set('edt_prdc_input',p.name);
      await this.click(this.locator('btn_RppluClsfP'));
      await this.combo('cobPrdcClsfLCd',p.category.commonMajor||(p.gender==='여성'?'L0011 : 여성의류':'L0014 : 남성의류'));
      // Common category labels include codes. User-reviewed full labels avoid guessed mappings.
      await this.combo('cobPrdcClsfMCd',p.category.commonMiddle);
      await this.combo('cobPrdcClsfSCd',p.category.commonSmall,true);
      const categoryPopup=this.page.locator('[id$="rppluClsf"]').filter({visible:true}).last();
      await this.textClick('조회',categoryPopup);await this.settle();
      const n=categoryPopup.getByText('N',{exact:true}).filter({visible:true});
      if(await n.count()!==1)throw Error('해외배송 N 분류가 여러 개이거나 없습니다. 상품분류를 직접 확인해 주세요.');
      await n.click();await this.textClick('확인',categoryPopup);
      await this.set('msk_fstSprcAmt_input',p.consumerPrice);
      await this.combo('cbo_nmltyMrgnCd','1 | 정상마진');await this.combo('cbo_mrtr','34');
      await this.combo('cbo_PchAgeRstCd','전체연령');await this.set('edt_SrchKwrdCont_input',p.keywords);
      await this.combo('cbo_PintfcnPrsCd','의류');await this.settle();
      this.log('상품정보고시 입력');
      // Nexacro merged grid cells use separate columns. Calibrate once rather than guessing.
      await this.fillNotices(p);
      await this.fillHTML(p);
      const add=this.locator('ful_prd00_upfile0_fileitembutton');
      const imageButton=await add.count()?add:this.page.locator('[id*="ful_prd00"]').getByText('추가',{exact:true}).last();
      await this.reveal(imageButton);
      const mainUpload=await prepareMainImage(folder);this.check();
      this.log('대표이미지 1500×1500 변환 완료 · 원본 비율 유지 · 흰색 여백');
      const chooser=this.page.waitForEvent('filechooser');await imageButton.click();await (await chooser).setFiles(mainUpload);await this.settle();
      let uploadSlot=0;
      for(const key of ['extra1','extra2']){
        if(!p.images[key])continue;
        const slot=++uploadSlot;
        this.check();const button=this.locator('ful_prd0'+slot+'_upfile0_fileitembutton');
        const extraUpload=await prepareMainImage(folder,key);this.check();
        this.log('추가 상품이미지 '+slot+' 1500×1500 변환 완료');
        await this.reveal(button);const extraChooser=this.page.waitForEvent('filechooser');await button.click();
        await (await extraChooser).setFiles(extraUpload);await this.settle();await this.pace();
        this.log('추가 상품이미지 '+slot+' 업로드 완료');
      }
      await this.textClick('임시저장');await this.modalConfirm('임시 저장되었습니다');
      this.log('공통상품 저장 완료. 채널 설정');
      const stylePattern=new RegExp(String.raw`^\s*${p.style}\s*\(DT\)\s*$`);
      const row=this.page.locator('[id*="grd_rpplu_body_gridrow_"][id$="GridCellTextContainerElement"]').filter({hasText:stylePattern}).last();
      await row.waitFor({state:'attached',timeout:20000});
      await this.click(row);await row.dblclick();await this.settle();
      }
      await this.channel(p,folder);
      if(!finalize){await this.textClick('임시저장');await this.modalConfirm('저장하시겠습니까');this.log('최종 상품확정 전에서 중단했습니다.');return;}
      await this.textClick('상품확정');await this.modalConfirm('저장하시겠습니까');
      await this.modalConfirm('온라인 상품 확정 확인','확인완료');
      const success=this.page.getByText('온라인 상품 등록 요청 하였습니다.',{exact:true});await success.waitFor({timeout:60000});
      await this.snapshot(folder,'completed');await this.textClick('확인');
      const seconds=Math.round((Date.now()-start)/1000);this.log(`등록 요청 완료 (${Math.floor(seconds/60)}분 ${seconds%60}초)`);
      await writeFile(path.join(folder,'result.json'),JSON.stringify({style:p.style,status:'requested',seconds,at:new Date().toISOString()},null,2));
    }catch(e){if(this.stopped)throw Error('사용자가 중단했습니다. 입력된 내용은 크롬에 남아 있습니다.');await this.snapshot(folder,'stopped').catch(()=>{});throw Error(e.message+' 입력된 내용은 브라우저에 남아 있습니다. 신규를 다시 실행하기 전에 중복 여부를 확인해 주세요.');}
  }
  async fillNotices(p){
    const grid='grd_PintfcnItem';
    // Use row labels and the right-hand content area. This survives changing merged-cell IDs.
    for(const [label,value] of [['제품 소재',p.material],['색상',p.colors.join(',')],['치수',p.sizes.join(',')],['제조국',p.country],['세탁방법 및 취급시 주의사항',p.washing]]){
      this.log('고시 입력: '+label);
      const labelLoc=this.page.getByText(label,{exact:true}).filter({visible:true}).last();await this.reveal(labelLoc);
      const contentId=await labelLoc.evaluate(el=>{for(let p=el;p;p=p.parentElement){const m=p.id?.match(/^(.*_cell_\d+_)(\d+)$/);if(m)return m[1]+(Number(m[2])+2);}return null;});
      if(!contentId)throw Error('고시 항목의 내용 칸을 찾지 못했습니다: '+label);
      const cell=this.page.locator('[id="'+contentId+'"]');
      let applied=false;
      for(let attempt=0;attempt<2;attempt++){
        await this.reveal(cell);await cell.dblclick();await this.pace();
        // Nexacro leaves duplicate editor IDs behind. Only type into its focused editor.
        const focused=this.page.locator('input[id*="'+grid+'"][id$="controledit_input"]:focus,textarea[id*="'+grid+'"][id$="controltextarea_textarea"]:focus');
        await focused.waitFor({state:'visible',timeout:4000});await focused.fill(value);await this.pace();
        await labelLoc.click();await this.pace();
        const actual=await cell.evaluate(e=>(e.querySelector('input,textarea')?.value||e.innerText).replace(/\s/g,''));
        if(actual===String(value).replace(/\s/g,'')){applied=true;break;}
      }
      if(!applied)throw Error('고시 입력값 반영 확인 실패: '+label);
    }
    await this.completeNoticeSettings(p.manufactured);
  }
  async completeNoticeSettings(manufactured){
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(manufactured))throw Error('제조연월 형식을 확인해 주세요.');
    const makerCell=this.locator('grd_PintfcnItem_body_gridrow_0_cell_0_15');
    const makerValue=()=>makerCell.evaluate(e=>(e.querySelector('input')?.value||e.innerText).trim());
    if(await makerValue()!=='사용'){
      const maker=this.locator('grd_PintfcnItem_controlcombo_comboedit_input');
      const existing=await maker.count()?await maker.boundingBox():null;const target=await makerCell.boundingBox();
      if(!existing||!target||Math.abs(existing.y-target.y)>8){await this.reveal(makerCell);await makerCell.dblclick();await this.pace();}
      if((await maker.inputValue()).trim()!=='사용')await this.combo('grd_PintfcnItem_controlcombo','사용');
      await maker.press('Enter');await this.pace();
    }
    if(await makerValue()!=='사용')throw Error('제조자 사용 선택이 반영되지 않았습니다.');
    const date=this.locator('grd_PintfcnItem_body_gridrow_0_cell_0_32');
    if((await date.innerText()).trim()!==manufactured){
      const prefix='pdv_Monthgrd_PintfcnItem_';
      if(await this.locator(prefix+'sta_Year').count())await date.click();
      await this.reveal(date);
      const bar=this.locator('tpg_PrdcInfoRgstT_vscrollbar'),thumb=this.locator('tpg_PrdcInfoRgstT_vscrollbar_trackbar');
      if(await bar.count()&&await thumb.count()){
        const br=await bar.boundingBox(),tr=await thumb.boundingBox(),dr=await date.boundingBox();
        const delta=(dr.y-(br.y+br.height*.3))*tr.height/br.height;
        const target=Math.max(br.y+13+tr.height/2,Math.min(br.y+br.height-13-tr.height/2,tr.y+tr.height/2+delta));
        await this.page.mouse.move(tr.x+tr.width/2,tr.y+tr.height/2);await this.page.mouse.down();await this.page.mouse.move(tr.x+tr.width/2,target,{steps:5});await this.page.mouse.up();await this.pace();
      }
      await this.locator('grd_PintfcnItem_body_gridrow_0_cell_0_32_controlexpand').click();
      const targetYear=Number(manufactured.slice(0,4));
      for(let n=0;n<100;n++){this.check();const year=Number((await this.locator(prefix+'sta_Year').innerText()).trim());if(year===targetYear)break;if(!Number.isInteger(year)||Math.abs(year-targetYear)>50)throw Error('제조연월 달력의 연도를 확인할 수 없습니다.');await this.locator(prefix+(year<targetYear?'btn_NextYear':'btn_PreYear')).click();await this.pace();}
      await this.locator(prefix+'btn_Month'+Number(manufactured.slice(5))).click();await this.pace();
    }
    if((await date.innerText()).trim()!==manufactured)throw Error('제조연월 입력값이 반영되지 않았습니다: '+manufactured);
    this.log('제조자 사용 · 제조연월 '+manufactured+' 자동 입력 및 반영 확인 완료');
  }

  async fillHTML(p){
    this.log('공식 상세 HTML 및 대표이미지 입력');
    const {html,sources}=buildDetailContent(p.images,p.colors,p.colorImages,p.originalDetailUrl);
    if(!p.images.detail)this.log('상세 이미지가 없어 대표컷·추가컷으로 상세페이지를 구성합니다.');
    // Resolve editor iframe from the actual document rather than global JS editor objects.
    let frame;
    for(const candidate of this.page.frames()){
      if(!/\/SmartEditor2Skin\.html(?:[?#]|$)/.test(candidate.url()))continue;
      let visible=true;
      for(let current=candidate;current.parentFrame();current=current.parentFrame()){
        if(!await (await current.frameElement()).isVisible()){visible=false;break;}
      }
      if(visible){
        if(frame)throw Error('표시된 상세 HTML 편집기가 여러 개입니다. 상품등록 창을 확인해 주세요.');
        frame=candidate;
      }
    }
    if(!frame)throw Error('상세 HTML 편집기를 찾지 못했습니다.');
    let host=frame;while(host.parentFrame()&&host.parentFrame()!==this.page.mainFrame())host=host.parentFrame();
    await this.reveal(await host.frameElement());
    const owner=frame.parentFrame();
    if(owner){
      const result=await owner.evaluate(html=>{
        const editor=window.oEditors?.getById?.ir1;
        if(typeof editor?.setIR!=='function'||typeof editor?.getIR!=='function'||typeof editor?.exec!=='function')return null;
        editor.setIR(html);
        editor.exec('UPDATE_CONTENTS_FIELD',[]);
        const doc=new DOMParser().parseFromString(editor.getIR(),'text/html');
        return [...doc.images].map(image=>image.getAttribute('src'));
      },html);
      if(result){
        const expected=sources;
        if(result.length!==expected.length||result.some((src,i)=>src!==expected[i]))throw Error('상세 편집기에 입력된 이미지 주소가 원본과 다릅니다.');
        this.log('상세 편집기 내용 입력 및 이미지 '+expected.length+'개 반영 확인 완료');
        await this.pace();return;
      }
    }
    const htmlButton=frame.locator('button.se2_to_html');
    const area=frame.locator('textarea.se2_input_htmlsrc');
    if(!await area.isVisible()){
      await htmlButton.click();
      try{await area.waitFor({state:'visible',timeout:8000});}
      catch{throw Error('상세 편집기의 HTML 모드 전환이 완료되지 않았습니다. 브라우저의 편집기 또는 안내창을 확인해 주세요. 입력 내용은 유지됩니다.');}
    }
    await area.fill(html);
    if(await area.inputValue()!==html)throw Error('상세 HTML 입력 내용이 반영되지 않았습니다.');
    await frame.locator('button.se2_to_editor').click();await this.pace();
  }
  async similarCategoryClick(choice,level){
    if(!level)throw Error('채널분류 단계가 지정되지 않았습니다.');
    await this.reveal(this.locator('grd_Dspctgr'+level+'_head')); // Bring category panel into the popup viewport before using its own scrollbar.
    const scope=this.page.locator('[id*="grd_Dspctgr'+level+'_body_gridrow_"][id$="GridCellTextContainerElement"]');
    const thumb=this.page.locator('[id$="grd_Dspctgr'+level+'_vscrollbar_trackbar"]').filter({visible:true}).last();
    const bar=this.page.locator('[id$="grd_Dspctgr'+level+'_vscrollbar"]').filter({visible:true}).last();
    const move=async(top)=>{
      if(!await thumb.count()||!await bar.count())return false;
      const t=await thumb.boundingBox(),b=await bar.boundingBox();if(!t||!b||!t.height)return false;
      const from=t.y+t.height/2,min=b.y+13+t.height/2,max=b.y+b.height-13-t.height/2;
      if(max<=min)return false;const to=top?min:Math.min(max,from+Math.max(15,t.height*.85));
      if(Math.abs(to-from)<2)return false;
      const before=(await scope.allTextContents()).join('|');
      await this.smoothDrag(t.x+t.width/2,from,to);
      // Wait for virtual rows to repaint before judging whether the list stopped.
      for(let retry=0;retry<8;retry++){
        this.check();await this.page.waitForTimeout(150);
        if((await scope.allTextContents()).join('|')!==before)break;
      }
      return true;
    };
    await this.settle();await this.pace();await move(true);
    const labels=new Set();let previous='',stagnant=0;
    const clickVisible=async(value)=>{
      const candidates=scope.getByText(value,{exact:true});
      for(let i=0;i<await candidates.count();i++){
        const target=candidates.nth(i);
        const ready=await target.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&!!hit&&(hit===e||e.contains(hit)||hit.contains(e));});
        if(ready){await target.click({timeout:1500});await this.settle();await this.pace();return true;}
      }
      return false;
    };
    for(let scan=0;scan<40;scan++){
      this.check();const texts=(await scope.allTextContents()).map(x=>x.trim()).filter(x=>x&&!/^BC\d+$/.test(x));
      for(const value of texts)labels.add(value);
      // Prefer an exact visible match without first scrolling to the bottom.
      if(await clickVisible(choice)){this.log('채널분류 선택: '+choice);return choice;}
      const signature=texts.join('|');stagnant=signature===previous?stagnant+1:0;previous=signature;
      if(stagnant>=2||!await move(false))break;
    }
    const selected=similarCategory(choice,[...labels]);
    if(!selected)throw Error('같거나 유사한 채널분류를 찾지 못했습니다: '+choice+' (목록: '+[...labels].join(', ')+')');
    await move(true);previous='';stagnant=0;
    for(let scan=0;scan<40;scan++){
      this.check();if(await clickVisible(selected)){this.log('유사 채널분류 선택: '+choice+' → '+selected);return selected;}
      const signature=(await scope.allTextContents()).join('|');stagnant=signature===previous?stagnant+1:0;previous=signature;
      if(stagnant>=2||!await move(false))break;
    }
    throw Error('채널분류 목록에서 선택 항목으로 이동하지 못했습니다: '+selected);
  }
  async matchLotteOptions(p){
    const grid='grd_OptnDtlNew';
    const coverage=new OptionCoverage(p);const optionLabels=new Map();
    await this.scrollOptionGrid(grid,0);
    let stagnant=0,rewound=false;
    for(let pass=0;pass<Math.max(60,coverage.expected.size*8);pass++){
    const before=coverage.done.size;
    const rows=await this.locator(grid).locator('[id]').evaluateAll(es=>es.filter(e=>/body_gridrow_\d+_cell_\d+_0$/.test(e.id)).filter(e=>{const r=e.getBoundingClientRect(),prefix=e.id.split('_body_gridrow_')[0],body=document.getElementById(prefix+'_body')?.getBoundingClientRect(),head=document.getElementById(prefix+'_head')?.getBoundingClientRect();return body&&r.height>0&&r.y+r.height/2>Math.max(body.top,head?.bottom||0)+2&&r.y+r.height/2<body.bottom-2;}).map(e=>({row:Number(e.id.match(/gridrow_(\d+)/)[1]),kind:e.textContent.trim(),y:e.getBoundingClientRect().y})).sort((a,b)=>a.y-b.y));
    if(!rows.length){await this.scrollOptionGrid(grid,0);await this.pace();continue;}
    const lower=p.sourceCategory?.includes('PANTS')||/바지|팬츠|슬랙스/.test(p.name);
    for(const {row,kind:displayKind} of rows){
      this.check();
      const sourceCell=this.page.locator('[id$="'+grid+'_body_gridrow_'+row+'_cell_'+row+'_2"]');
      if(!await sourceCell.count())continue;
      const source=await this.readCell(grid,row,2);
      if(!source.trim())continue; // Virtualized grids retain blank recycled row shells.
      const compact=x=>String(x).replace(/\s/g,'');
      const kind=p.sizes.some(x=>compact(x)===compact(source))?'사이즈':p.colors.some(x=>compact(x)===compact(source))?'색상':displayKind;
      if(!['색상','사이즈'].includes(kind))throw Error('알 수 없는 옵션유형: '+kind);
      if(coverage.has(kind,source))continue;
      const type=kind==='색상'?'통합색상':lower?'성인 하의 사이즈':'성인 상의 사이즈';
      for(let attempt=0;attempt<2&&await this.readCell(grid,row,1)!==type;attempt++){
        await this.gridCombo(grid,row,1,type);
        await this.click(await this.optionCell(grid,row,0));
      }
      if(await this.readCell(grid,row,1)!==type)throw Error('롯데ON 사이즈/색상 유형 반영 실패: '+source+' / '+type);
      const raw=await this.readCell(grid,row,2);
      await this.activateGridEditor(grid,row,11,'combo');
      await this.locator(grid+'_controlcombo_dropbutton').click();
      const list=this.page.locator('[id$="'+grid+'_controlcombo_combolistScrollableContainerElement"]').filter({visible:true}).last();
      await list.waitFor({state:'visible',timeout:4000});
      // Nexacro renders only the currently visible part of a combo list.
      // Read every page before considering a similar-color fallback.
      let labels=optionLabels.get(type);
      if(!labels){
      labels=await this.scanComboLabels(list);if(labels.length)optionLabels.set(type,labels);
      }
      const normal=x=>x.replace(/\s/g,'').toUpperCase().replace(/^XXL$/,'2XL').replace(/^XXXL$/,'3XL');
      const selected=kind==='색상'?matchColor(raw,labels):labels.find(x=>normal(x)===normal(raw))||labels.find(x=>/^\d+인치$/.test(x)&&x===raw+'인치')||normal(raw);
      await this.page.keyboard.press('Escape');
      if(!selected)throw Error('유사한 롯데ON 옵션값을 찾지 못했습니다: '+raw+' / 옵션유형: '+type+' / 읽은 후보: '+(labels.join(', ')||'없음 — 옵션 목록이 로딩되었는지 확인해 주세요.'));
      await this.combo(grid+'_controlcombo',selected,false,labels);await this.locator(grid+'_controlcombo_comboedit_input').press('Enter');
      const checkbox=(await this.optionCell(grid,row,12)).locator('[id$="_12_controlcheckbox"]');
      const image=checkbox.locator('[id$="chkimgImageElement"]');
      if(!await image.count())continue; // Row was recycled while scrolling; revisit it in the next pass.
      const checked=()=>checkbox.locator('[id$="chkimgImageElement"]').evaluate(e=>getComputedStyle(e).visibility!=='hidden'&&!!e.querySelector('img')?.getAttribute('src'));
      if(!await checked())await this.click(checkbox);
      if(!await image.count())continue;
      if(!await checked())throw Error('직접입력 사용 체크가 반영되지 않았습니다: '+raw);
      coverage.mark(kind,raw);
      this.log('롯데ON 옵션 '+coverage.done.size+'/'+coverage.expected.size+': '+raw+' → '+type+' / '+selected+' / 직접입력 사용');
      break; // Refresh virtualized rows after every edit, preserving top-to-bottom order.
    }
    if(coverage.complete){await this.auditLotteOptions(p);this.log('전체 색상·사이즈 '+coverage.done.size+'개 매칭 및 체크 확인 완료');return;}
    if(coverage.done.size>before){stagnant=0;continue;}
    stagnant++;
    if(stagnant>=3){if(rewound)break;await this.scrollOptionGrid(grid,0);rewound=true;stagnant=0;}else await this.scrollOptionGrid(grid,null);
    }
    throw Error('옵션 누락 '+coverage.missing.length+'개: '+coverage.missing.join(', ')+'. 일부 옵션만 적용하지 않고 중단합니다.');
  }
  async auditLotteOptions(p){
    await this.checkAllDirectInputs(p);
  }
  async auditOptionRows(grid){
    return this.page.locator('[id*="'+grid+'_body_gridrow_"][id$="_12_controlcheckbox"]').evaluateAll(es=>es.map((e,index)=>{
      const doc=e.ownerDocument,r=e.getBoundingClientRect(),y=r.y+r.height/2;
      const nodes=Array.from(doc.querySelectorAll('[id]'));
      const base=e.id.replace(/12_controlcheckbox$/,'');
      const text=col=>nodes.find(n=>{if(n.id!==base+col)return false;const c=n.getBoundingClientRect();return c.width>0&&c.height>0&&y>=c.top&&y<=c.bottom;})?.innerText.trim();
      const img=e.querySelector('[id$="chkimgImageElement"]'),hit=doc.elementFromPoint(r.x+r.width/2,y);
      return {id:e.id,index,source:text('2'),type:text('1'),value:text('11'),checked:!!img&&getComputedStyle(img).visibility!=='hidden'&&!!img.querySelector('img')?.getAttribute('src'),clickable:r.width>0&&r.height>0&&!!hit&&(hit===e||e.contains(hit))};
    }).filter(row=>row.source&&row.clickable));
  }
  async checkAllDirectInputs(p){
    const g='grd_OptnDtlNew',expected=new Set([...p.colors,...p.sizes].map(x=>x.replace(/\s/g,''))),seen=new Set();
    const bar=this.locator(g+'_vscrollbar'),thumb=this.locator(g+'_vscrollbar_trackbar');
    const move=async(mode)=>{if(!await bar.count()||!await thumb.count())return false;const t=await thumb.boundingBox(),r=await bar.boundingBox();if(!t||!r)return false;const from=t.y+t.height/2,top=r.y+13+t.height/2,bottom=r.y+r.height-13-t.height/2;const to=mode==='top'?top:mode==='bottom'?bottom:Math.min(bottom,from+Math.max(10,t.height*.85));if(Math.abs(to-from)<2)return false;await this.smoothDrag(t.x+t.width/2,from,to);await this.pace();return true;};
    for(let sweep=0;sweep<1;sweep++){
      await move('top');
      const up=this.locator(g+'_vscrollbar_decbutton');if(await up.count()){for(let n=0;n<12;n++){this.check();await up.click();}}
      for(let page=0;page<Math.max(40,expected.size*2);page++){
        this.check();
        for(let attempt=0;attempt<Math.max(20,expected.size);attempt++){
          const rows=await this.auditOptionRows(g);
          for(const r of rows){
            const source=r.source.replace(/\s/g,'');if(!expected.has(source))continue;
            const size=p.sizes.some(x=>x.replace(/\s/g,'')===source);
            const lower=p.sourceCategory?.includes('PANTS')||/바지|팬츠|슬랙스/.test(p.name);
            const required=size?(lower?'성인 하의 사이즈':'성인 상의 사이즈'):'통합색상';
            const normalize=x=>String(x||'').replace(/\s/g,'').toUpperCase().replace(/^XXL$/,'2XL').replace(/^XXXL$/,'3XL');
            if(r.checked&&r.type===required&&r.value&&(!size||normalize(r.value)===normalize(source)))seen.add(source);
          }
          const missing=rows.find(r=>expected.has(r.source.replace(/\s/g,''))&&!r.checked);
          if(!missing)break;await this.page.locator('[id*="'+g+'_body_gridrow_"][id$="_12_controlcheckbox"]').nth(missing.index).click();await this.pace();
        }
        if(!await move('next'))break;
      }
      await move('bottom');
    }
    await move('top');
    const missing=[...expected].filter(x=>!seen.has(x));if(missing.length)throw Error('직접입력 사용여부 전체 점검 누락: '+missing.join(', '));
    this.log('작은 세로 스크롤 전체 점검: '+seen.size+'/'+expected.size+'개 직접입력 체크 확인');
  }
  async scrollOptionGrid(grid,position){
    const element=this.locator(grid);
    await this.reveal(this.locator(grid+'_head'));
    const bar=this.locator(grid+'_vscrollbar'),thumb=this.locator(grid+'_vscrollbar_trackbar');
    if(await bar.count()&&await thumb.count()){
      await this.reveal(thumb);
      const b=await bar.boundingBox(),t=await thumb.boundingBox();if(b&&t&&t.height>0&&t.height<b.height-26){
        const top=b.y+13+t.height/2,bottom=b.y+b.height-13-t.height/2;
        const target=position===0?top:Math.min(bottom,t.y+t.height/2+Math.max(12,t.height*.85));
        await this.smoothDrag(t.x+t.width/2,t.y+t.height/2,target);
        if(position===0){const up=this.locator(grid+'_vscrollbar_decbutton');if(await up.count())for(let n=0;n<40;n++){this.check();await up.click();}}
        return;
      }
    }
    this.check(); // No page-wheel fallback: only the option table's vertical scrollbar is used.
  }
  async addStandardCategory(major,middle,small){
    const grid=this.locator('div_input05_div_body_grd_Dspctgr');
    const contains=async()=>{const text=await grid.innerText();return [major,middle,small].every(x=>text.includes(x));};
    if(await contains()){this.log('표준카테고리가 이미 추가되어 있습니다. 중복 추가를 건너뜁니다.');return;}
    await this.click(this.locator('div_input05_div_body_btn_Dspctgr_AddRow'));await this.settle();
    for(let n=0;n<20;n++){this.check();if(await contains()){this.log('표준카테고리 자동 추가 확인: '+major+' > '+middle+' > '+small);return;}await this.page.waitForTimeout(200);}
    throw Error('표준카테고리 추가가 아래 목록에 반영되지 않았습니다. 중복 추가하지 않고 중단합니다.');
  }
  async waitChannelReady(){
    this.log('채널 화면과 즐겨찾기 입력란 준비 확인 중');
    const field=this.page.locator('[id$="cbo_preSet_comboedit_input"]').filter({visible:true}).last();
    const deadline=Date.now()+30000;let identity='',stableSince=0;
    while(Date.now()<deadline){
      this.check();
      const fields=await this.page.locator('[id$="cbo_preSet_comboedit_input"]').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map(e=>({id:e.id,value:e.value})));
      const current=fields.at(-1);const key=current?current.id+':'+current.value:'';
      if(key&&key===identity){if(Date.now()-stableSince>=800){await field.waitFor({state:'visible',timeout:4000});this.log('채널 즐겨찾기 입력란 준비 완료');return;}}
      else{identity=key;stableSince=Date.now();}
      await this.page.waitForTimeout(200);
    }
    throw Error('채널 화면 준비를 30초 동안 확인하지 못했습니다. 채널 창이 열려 있는지 확인해 주세요.');
  }
  async applyChannelPreset(){
    await this.waitChannelReady();
    this.log('채널 즐겨찾기 신규 26년 자동 적용');
    if((await this.locator('cbo_preSet_comboedit_input').inputValue()).trim()!=='신규 26년'){
      await this.combo('cbo_preSet','신규 26년');
      await this.modalConfirm('즐겨찾기 정보를 적용하시겠습니까');
    }
    const grid=this.locator('div_input05_div_body_grd_Dspctgr');
    for(let n=0;n<20;n++){
      const ids=await grid.locator('[id]').evaluateAll(es=>es.filter(e=>/body_gridrow_\d+GridAreaContainerElement_inner$/.test(e.id)).map(e=>e.id));
      if(!ids.length){this.log('즐겨찾기의 기존 표준카테고리 삭제 완료');return;}
      const row=this.page.locator('[id="'+ids.at(-1)+'"]');
      await this.click(row);await this.click(this.locator('btn_Dspctgr_DeleteRow'));await this.modalConfirm('삭제하시겠습니까');await this.settle();await this.pace();
      const remaining=await grid.locator('[id]').evaluateAll(es=>es.filter(e=>/body_gridrow_\d+GridAreaContainerElement_inner$/.test(e.id)).length);
      if(remaining>=ids.length)throw Error('기존 카테고리 행삭제가 반영되지 않았습니다. 화면을 확인해 주세요.');
    }
    throw Error('기존 카테고리가 너무 많아 확인이 필요합니다.');
  }
  async channel(p,folder){
    // Suffix names for channel controls vary between portal versions. Collect the actual list.
    await this.applyChannelPreset();
    const major=p.category.channelMajor||(p.gender==='여성'?'브랜드여성의류':'브랜드남성의류');
    if(/패딩|푸퍼|다운/.test(p.name+' '+(p.sourceCategory||[]).join(' '))&&!/코트/.test(p.name)){
      p.category.channelMiddle='점퍼/패딩/야상';p.category.channelSmall='패딩/다운점퍼';
    }
    const correctedPath=channelCategoryPath(p.category);
    if(correctedPath.channelMiddle!==p.category.channelMiddle)this.log('하위 분류에 맞춰 상위 분류 보정: '+p.category.channelMiddle+' → '+correctedPath.channelMiddle);
    p.category=correctedPath;
    const verifiedPath=resolveCatalogCategory(p);if(verifiedPath.path)p.category=verifiedPath.category;
    const matchKey=categoryKey(p);
    const known=(await loadCategoryCache(this.root)).matches.find(m=>m.key===matchKey&&m.actual.major===major);
    if(known){p.category.channelMiddle=known.actual.middle;p.category.channelSmall=known.actual.small;this.log('검증된 분류 매칭표 사용: '+major+' > '+known.actual.middle+' > '+known.actual.small);}
    await this.similarCategoryClick(major,'L');p.category.channelMiddle=await this.similarCategoryClick(p.category.channelMiddle,'M');await this.settle();p.category.channelSmall=await this.similarCategoryClick(p.category.channelSmall,'S');await this.settle();
    if(p.category.channelDetail)p.category.channelDetail=await this.similarCategoryClick(p.category.channelDetail,'D');
    // Select category's own add button by its visible enclosing block.
    await this.addStandardCategory(major,p.category.channelMiddle,p.category.channelSmall);
    await saveCategoryMatch(this.root,matchKey,{major,middle:p.category.channelMiddle,small:p.category.channelSmall},p.style);
    this.log('실제 선택·추가 확인된 분류 경로를 매칭표에 저장했습니다.');
    const optionBlock=this.page.locator('[id$="div_input12_div_body"]').filter({visible:true}).last();
    if(!await optionBlock.count())throw Error('옵션등록 영역을 찾지 못했습니다.');
    await this.textClick('행추가',optionBlock);await this.textClick('행추가',optionBlock);
    await this.gridCombo('grd_OptnDtl',2,0,'직접입력1');await this.gridCombo('grd_OptnDtl',3,0,'직접입력2');
    await this.editCell('grd_OptnDtl',2,1,'색상');await this.editCell('grd_OptnDtl',3,1,'사이즈');
    await this.editCell('grd_OptnDtl',2,2,p.colors.join(','));await this.editCell('grd_OptnDtl',3,2,p.sizes.join(','));await this.textClick('옵션적용',optionBlock);
    this.log('색상·사이즈 매칭');
    // Portal grid column order can change; do not silently apply to a guessed checkbox column.
    await this.matchLotteOptions(p);
    await this.textClick('롯데ON옵션적용',optionBlock);await this.modalConfirm('저장하시겠습니까');
    await this.set('mae_OnlnStkQtyAllApply_input','10');await this.textClick('온라인재고일괄등록',optionBlock);await this.modalConfirm('일괄 적용');
    const limit=this.page.locator('[id$="div_ComnPrdcSleRstYn"]').filter({visible:true}).last();await this.textClick('제한',limit);
    await this.snapshot(folder,'ready');
  }
}
