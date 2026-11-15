// Local registrar selection only. Seller-centre actions remain on the Start button.
(()=>{
 const byId=id=>document.getElementById(id);
 const panel=byId('lotteCategoryValidation');if(!panel)return;
 const labels=['대분류','중분류','소분류','세분류'];
 const clean=value=>String(value||'').replace(/^[A-Z0-9]+\s*[:：]\s*/i,'').replace(/\s/g,'');
 const tools=document.createElement('div');tools.className='lotte-category-picker-tools';tools.dataset.channelOnly='lotte';
 const openButton=document.createElement('button');openButton.id='lotteCategoryEdit';openButton.type='button';openButton.className='secondary';openButton.textContent='분류 수정';
 const hint=document.createElement('span');hint.textContent='자동으로 연결해 두었어요. 다르면 목록에서 수정하세요.';tools.append(openButton,hint);panel.before(tools);
 const dialog=document.createElement('dialog');dialog.id='lotteCategoryPicker';dialog.className='lotte-category-dialog';dialog.setAttribute('aria-labelledby','lotteCategoryPickerTitle');
 dialog.innerHTML='<header><div><small id="lotteCategoryPickerStyle"></small><h2 id="lotteCategoryPickerTitle">상품분류 선택</h2><p>대분류부터 순서대로 선택하세요. 1차를 바꾸면 2차가 자동으로 연결돼요.</p></div><button type="button" class="secondary" id="lotteCategoryPickerClose" aria-label="분류 선택 닫기">×</button></header><div class="lotte-category-modal-body"><section><div class="lotte-category-picker-heading"><h3>1차 공통분류</h3><span>상품의 기본 종류</span></div><div id="lotteCommonColumns" class="lotte-category-columns common"></div><p id="lotteCommonChoice" class="lotte-category-choice-path"></p></section><section><div class="lotte-category-picker-heading"><h3>2차 채널분류</h3><button id="lotteCategoryReconnect" type="button" class="secondary">1차 기준으로 다시 연결</button></div><div id="lotteChannelColumns" class="lotte-category-columns"></div><p id="lotteChannelChoice" class="lotte-category-choice-path"></p></section><p id="lotteCategoryPickerMessage" role="status" aria-live="polite"></p><p id="lotteCategoryPickerScope" class="note"></p></div><footer><span>등록기 분류에만 반영돼요.</span><div><button type="button" class="secondary" id="lotteCategoryPickerCancel">취소</button><button type="button" id="lotteCategoryPickerApply">선택한 분류 적용</button></div></footer>';
 document.body.append(dialog);
 let catalog=null,draft={common:[],channel:[]},snapshot=null,signature='',epoch=0,pending=false,watch=null;
 const controls={common:[],channel:[]};
 for(const [kind,count,container] of [['common',3,'lotteCommonColumns'],['channel',4,'lotteChannelColumns']]){
  for(let i=0;i<count;i++){
   const label=document.createElement('label');label.textContent=labels[i];
   const select=document.createElement('select');select.size=8;select.setAttribute('aria-label',(kind==='common'?'1차 ':'2차 ')+labels[i]);
   select.addEventListener('change',()=>change(kind,i,select.value));label.append(select);byId(container).append(label);controls[kind].push(select);
  }
 }
 function current(){return dialog.open&&snapshot&&activeChannel()==='lotte'&&!serverBusy&&JSON.stringify(lotteCategorySnapshot())===signature;}
 function message(text,error=false){const box=byId('lotteCategoryPickerMessage');box.textContent=text;box.classList.toggle('is-error',error);}
 function selectedNodes(kind){
  const nodes=[];let siblings=catalog?.[kind]||[];
  for(const code of draft[kind]){const node=siblings.find(item=>item.code===code);if(!node)break;nodes.push(node);siblings=node.children||[];}
  return nodes;
 }
 function complete(kind){const nodes=selectedNodes(kind);return kind==='common'?nodes.length===3:nodes.length>=3&&!(nodes.at(-1)?.children||[]).length;}
 function render(){
  for(const kind of ['common','channel']){
   let siblings=catalog?.[kind]||[];
   for(const [index,select] of controls[kind].entries()){
    const rows=siblings,selected=rows.find(n=>n.code===draft[kind][index]);
    const options=rows.map(item=>new Option(item.name+'  ·  '+item.code,item.code));
    select.replaceChildren(...options);select.value=selected?.code||'';
    if(!rows.length)select.append(new Option(kind==='channel'&&index===3&&complete('channel')?'세분류 없음':'상위 분류를 먼저 선택하세요.',''));
    select.disabled=pending||!rows.length;
    siblings=selected?.children||[];
   }
   const path=selectedNodes(kind).map(n=>n.name).join(' → ');
   byId(kind==='common'?'lotteCommonChoice':'lotteChannelChoice').textContent=path||'분류를 선택해 주세요.';
  }
  byId('lotteCategoryPickerApply').disabled=!current()||pending||!complete('common')||!complete('channel');
  byId('lotteCategoryReconnect').disabled=!current()||pending||!complete('common');
 }
 function setChannel(category){
  const keys=['channelMajor','channelMiddle','channelSmall','channelDetail'],levels=['major','middle','small','detail'];let siblings=catalog.channel;draft.channel=[];
  for(let i=0;i<4;i++){
   const code=category.channelCodes?.[levels[i]],label=category[keys[i]];
   const item=siblings.find(n=>code?n.code===code&&(!label||clean(n.name)===clean(label)):label&&clean(n.name)===clean(label));
   if(!item)break;draft.channel.push(item.code);siblings=item.children||[];
  }
 }
 function draftCategory(){
  const category={...snapshot.category,manualSelection:null,channelCodes:{},channelMajor:'',channelMiddle:'',channelSmall:'',channelDetail:''};
  for(const [i,node] of selectedNodes('common').entries())category[['commonMajor','commonMiddle','commonSmall'][i]]=node.code+' : '+node.name;
  return category;
 }
 async function recommend(){
  if(!current()||!complete('common'))return;
  const id=++epoch;pending=true;draft.channel=[];render();message('선택한 1차 분류를 기준으로 2차를 연결하고 있어요.');
  try{
   const {input,...body}=snapshot;
   const result=await post('lotte-category-suggest',{...body,category:draftCategory(),validateOnly:true});
   if(id!==epoch||!current())return;
   setChannel(result.category||{});
   message(result.bridge?.complete?'2차를 자동으로 연결했어요. 다르면 아래 목록에서 직접 선택하세요.':result.bridge?.message||'2차 분류를 직접 선택해 주세요.',!result.bridge?.complete);
  }catch(error){if(id===epoch&&current())message(error.message,true);}
  finally{if(id===epoch){pending=false;render();}}
 }
 function change(kind,index,value){
  ++epoch;pending=false;draft[kind]=[...draft[kind].slice(0,index),value];
  if(kind==='common'){draft.channel=[];render();if(complete('common'))void recommend();else message('1차 소분류까지 선택하면 2차를 자동으로 연결해요.');}
  else{render();message(complete('channel')?'직접 고른 2차 분류를 적용할 준비가 됐어요.':'2차 분류를 끝까지 선택해 주세요.');}
 }
 function close(){++epoch;pending=false;clearInterval(watch);if(dialog.open)dialog.close();snapshot=null;openButton.focus();}
 async function open(){
  if(!product||activeChannel()!=='lotte'||serverBusy){if(typeof announce==='function')announce('상품을 수집하고 현재 작업이 끝난 뒤 분류를 수정해 주세요.','failed');return;}
  snapshot=lotteCategorySnapshot();signature=JSON.stringify(snapshot);const id=++epoch;pending=true;catalog=null;draft={common:[],channel:[]};
  byId('lotteCategoryPickerStyle').textContent='품번 '+snapshot.style+' · '+snapshot.name;
  byId('lotteCategoryPickerScope').textContent='';dialog.showModal();render();message('저장된 분류 목록을 불러오고 있어요.');
  clearInterval(watch);watch=setInterval(()=>{if(dialog.open&&!current()){++epoch;pending=false;render();message('상품 또는 입력값이 바뀌었어요. 닫고 현재 상품에서 다시 열어 주세요.',true);}},500);
  try{
   const response=await fetch('/api/lotte-category-choices');
   if(!response.ok)throw Error(response.status===404?'분류 선택창을 사용하려면 최신 등록기 서버를 실행해 주세요.':'분류 목록을 불러오지 못했어요.');
   const data=await response.json();if(id!==epoch||!current())return;
   if(data.version!==1||!Array.isArray(data.common)||!Array.isArray(data.channel))throw Error('분류 목록 형식을 확인해 주세요.');
   catalog=data;let siblings=data.common;
   for(const key of ['commonMajor','commonMiddle','commonSmall']){
    const value=snapshot.category[key]||(key==='commonMajor'?snapshot.gender+'의류':'');
    const code=String(value).match(/^([A-Z0-9]+)\s*[:：]/i)?.[1];
    const item=siblings.find(n=>(!code||n.code===code)&&clean(n.name)===clean(value));
    if(!item)break;draft.common.push(item.code);siblings=item.children||[];
   }
   setChannel(snapshot.category);
   byId('lotteCategoryPickerScope').textContent=(data.catalogDate?'목록 기준일 '+data.catalogDate.slice(0,10)+' · ':'')+data.scope+' · 판매처의 실제 선택 결과는 입력 단계에서 확인해요.';
   message(snapshot.category.manualSelection?'직접 선택한 분류예요. 필요한 부분만 바꾸세요.':'자동으로 연결된 현재 분류예요. 필요한 부분만 바꾸세요.');
  }catch(error){if(id===epoch&&current())message(error.message,true);}
  finally{if(id===epoch){pending=false;render();}}
 }
 async function apply(){
  if(!current()||pending||!complete('common')||!complete('channel'))return;
  const id=++epoch;pending=true;render();message('선택한 이름과 분류 코드를 확인하고 있어요.');
  try{
   const {input,...body}=snapshot;
   const result=await post('lotte-category-suggest',{...body,manualChoice:{common:draft.common,channel:draft.channel}});
   if(id!==epoch||!current())return;
   if(!result.manualSupported||!result.bridge?.complete||!result.category?.manualSelection)throw Error('직접 선택한 분류의 반영을 확인하지 못했어요. 기존 분류를 유지합니다.');
   product.category={...product.category,...result.category};
   for(const key of lotteCategoryFields){byId('form').elements[key].value=result.category[key]||'';rememberProductField(key,result.category[key]||'');}
   rememberProductField('lotteCategorySelection',JSON.stringify(result.category.manualSelection));
   clearTimeout(lotteCategoryTimer);++lotteCategoryRequest;lotteCategoryPending=false;byId('lotteCategorySuggest').disabled=false;
   lotteCategoryChecked=JSON.stringify(lotteCategorySnapshot());
   renderLotteCategoryValidation({...result.validation,summary:result.bridge.message},'manual');
   byId('lotteCategorySuggestionStatus').textContent='직접 고른 분류를 반영했어요. 다음 입력에도 이 선택을 유지해요.';
   highlightReviewFields();close();
  }catch(error){if(id===epoch&&current())message(error.message,true);}
  finally{if(id===epoch){pending=false;render();}}
 }
 openButton.addEventListener('click',()=>void open());
 byId('lotteCategoryPickerClose').onclick=close;byId('lotteCategoryPickerCancel').onclick=close;
 byId('lotteCategoryReconnect').onclick=()=>void recommend();byId('lotteCategoryPickerApply').onclick=()=>void apply();
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 document.addEventListener('register-state',()=>{openButton.disabled=serverBusy||!product;});
})();
