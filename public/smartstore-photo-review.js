(()=>{
 const css=document.createElement('link');css.rel='stylesheet';css.href='/smartstore-photo-review.css';document.head.append(css);
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='사진 색상·구도 수정';button.id='manualPhotoReviewOpen';button.dataset.channelOnly='smartstore';
 const anchor=document.getElementById('photoPreparationStatus');if(!anchor)return;anchor.after(button);
 const dialog=document.createElement('dialog');dialog.id='manualPhotoReviewDialog';dialog.setAttribute('aria-labelledby','manualPhotoReviewTitle');
 dialog.innerHTML=`<div class="photo-selection-toolbar">
  <div class="photo-review-heading"><h2 id="manualPhotoReviewTitle">사진 색상·구도 확인</h2><span id="manualPhotoReviewSummary"></span></div>
  <div class="photo-review-actions"><button type="button" id="manualPhotoReviewApply">사진 반영</button><button type="button" class="secondary" id="manualPhotoReviewClose">닫기</button></div>
  <p id="manualPhotoSelectionStatus" role="status"></p>
 </div><div class="photo-review-body">
  <div class="photo-review-order">
   <p class="photo-order-guide">같은 색상끼리 끌어 순서를 바꾸세요. 1번 정면 · 2번 옆면 · 3번부터 디테일</p>
   <button type="button" class="secondary" id="manualPhotoReviewSort" title="수정한 색상에 맞춰 사진을 다시 모아요">색상별 정렬</button>
  </div>
  <div id="manualPhotoReviewLegend" aria-label="상품 색상 구분"></div>
  <div id="manualPhotoReviewGrid"></div>
  <p id="manualPhotoReviewMessage" role="status"></p>
  <details id="photoPointPicker"><summary>소구점 선택</summary><p>공식 근거에서 구매 장점 2~4개를 고르세요.</p><div id="photoPointCandidates"></div><p id="photoPointMessage" role="status"></p><button id="photoPointApply" type="button">소구점 반영</button></details>
 </div>`;
 document.body.append(dialog);let current=null,loading=false;const grid=dialog.querySelector('#manualPhotoReviewGrid'),message=dialog.querySelector('#manualPhotoReviewMessage'),apply=dialog.querySelector('#manualPhotoReviewApply');
 const sortButton=dialog.querySelector('#manualPhotoReviewSort');
 let draftTimer=null,draftQueue=Promise.resolve(),pendingDraft=null,draftVersion=0;
 let photoDrag=null;
 const dragGroup=card=>{const role=card?.querySelector('[data-field=role]')?.value,color=card?.querySelector('[data-field=color]')?.value;return color&&!['care-label','excluded'].includes(role)?color:null;};
 function assignOrderedRoles(){const counts=new Map();for(const card of grid.querySelectorAll(':scope > [data-photo-id]')){const color=dragGroup(card);if(!color)continue;const index=counts.get(color)||0;counts.set(color,index+1);const role=card.querySelector('[data-field=role]'),value=index===0?'front':index===1?'side':'detail';if(role.value!==value){role.value=value;card.refreshPhotoView?.();}}}
 function photoDropAt(x,y,drag){
  const hit=document.elementFromPoint(x,y);
  if(!grid.contains(hit))return null;
  let target=hit.closest('[data-photo-id]');
  const accepts=card=>card!==drag.card&&dragGroup(card)===drag.color;
  if(target&&!accepts(target))return null;
  if(hit===grid){
   // In the gaps, use the nearest eligible card instead of DOM order.
   let closest=Infinity;
   for(const card of grid.querySelectorAll(':scope > [data-photo-id]')){
    if(!accepts(card))continue;
    const box=card.getBoundingClientRect();
    const dx=Math.max(box.left-x,x-box.right,0);
    const dy=Math.max(box.top-y,y-box.bottom,0);
    const distance=dx*dx+dy*dy;
    if(dx>drag.columnGap||dy>drag.rowGap||distance>=closest)continue;
    target=card;
    closest=distance;
   }
  }
  if(!target)return null;
  const box=target.getBoundingClientRect();
  const vertical=matchMedia('(max-width: 480px)').matches;
  let after=y>box.bottom;
  if(y>=box.top&&y<=box.bottom)after=vertical?y>box.top+box.height/2:x>box.left+box.width/2;
  return {target,after};
 }
 function clearPhotoDrag(){
  if(!photoDrag)return;
  const {card,pointerId,highlight,preview}=photoDrag;
  photoDrag=null;
  card.classList.remove('photo-dragging');
  highlight?.classList.remove('photo-drop-target');
  preview?.remove();
  if(grid.hasPointerCapture(pointerId))grid.releasePointerCapture(pointerId);
 }
 grid.addEventListener('pointerdown',event=>{
  if(photoDrag||loading||event.button!==0||event.pointerType==='touch'||event.target.closest('label,input,select,button'))return;
  const card=event.target.closest('[data-photo-id]');
  const color=dragGroup(card);
  if(!color||card.querySelector('[data-field=role]').disabled)return;
  event.preventDefault();
  grid.setPointerCapture(event.pointerId);
  const {columnGap,rowGap}=getComputedStyle(grid);
  photoDrag={card,color,pointerId:event.pointerId,x:event.clientX,y:event.clientY,columnGap:(parseFloat(columnGap)||0)/2+1,rowGap:(parseFloat(rowGap)||0)/2+1};
 });
 grid.addEventListener('pointermove',event=>{
  const drag=photoDrag;
  if(drag?.pointerId!==event.pointerId)return;
  if(!drag.preview){
   if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<3)return;
   const image=drag.card.querySelector(':scope > img');
   const box=image.getBoundingClientRect();
   drag.preview=image.cloneNode();
   drag.preview.className='photo-drag-preview';
   drag.preview.alt='';
   drag.preview.loading='eager';
   drag.preview.style.width=box.width+'px';
   drag.preview.style.height=box.height+'px';
   drag.offsetX=box.left-drag.x;
   drag.offsetY=box.top-drag.y;
   dialog.append(drag.preview);
   drag.card.classList.add('photo-dragging');
  }
  drag.preview.style.transform='translate('+ (event.clientX+drag.offsetX)+'px,'+(event.clientY+drag.offsetY)+'px)';
  const target=photoDropAt(event.clientX,event.clientY,drag)?.target;
  if(drag.highlight===target)return;
  drag.highlight?.classList.remove('photo-drop-target');
  drag.highlight=target;
  target?.classList.add('photo-drop-target');
 });
 grid.addEventListener('pointerup',event=>{
  const drag=photoDrag;
  if(drag?.pointerId!==event.pointerId)return;
  const drop=drag.preview&&!loading?photoDropAt(event.clientX,event.clientY,drag):null;
  clearPhotoDrag();
  if(!drop)return;
  const before=drop.after?drop.target.nextSibling:drop.target;
  if(before===drag.card||before===drag.card.nextSibling)return;
  const top=dialog.scrollTop;
  grid.insertBefore(drag.card,before);
  updatePhotoSummary();
  dialog.scrollTop=top;
  rememberSelection();
  message.textContent='사진 순서를 저장했습니다. 사진 반영을 눌러 주세요.';
 });
 for(const type of ['pointercancel','lostpointercapture'])grid.addEventListener(type,event=>{
  if(photoDrag?.pointerId===event.pointerId)clearPhotoDrag();
 });
 dialog.addEventListener('close',clearPhotoDrag);

 const selectionStatus=dialog.querySelector('#manualPhotoSelectionStatus');
 function selectionSnapshot(){return {style:current.style,sourceUrl:current.sourceUrl,revision:current.revision,mainId:current.mainId,channel:'smartstore',items:[...grid.querySelectorAll(':scope > [data-photo-id]')].map(c=>({id:c.dataset.photoId,color:c.querySelector('[data-field=color]').value,role:c.querySelector('[data-field=role]').value,colorOverride:c.dataset.colorOverride==='true',roleOverride:c.dataset.roleOverride==='true'}))};}
 function queueDraft(payload){const version=++draftVersion;draftQueue=draftQueue.catch(()=>{}).then(async()=>{const r=await fetch('/api/smartstore-photo-review-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await r.json();if(!r.ok)throw Error(result.error);return result;});draftQueue.then(()=>{if(current?.style===payload.style&&version===draftVersion)selectionStatus.textContent='✓ 선택 저장됨 · 사진 반영을 눌러 주세요.';},e=>{if(current?.style===payload.style&&version===draftVersion)selectionStatus.textContent='선택 저장 확인 필요: '+e.message+' · 이 브라우저에는 임시 보관했습니다.';});return draftQueue;}
 function rememberSelection(){pendingDraft=selectionSnapshot();try{localStorage.setItem('smartstore.photo-selection.v1.'+current.style,JSON.stringify({...pendingDraft,savedAt:new Date().toISOString()}));}catch{}selectionStatus.textContent='선택 저장 중…';clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;const payload=pendingDraft;pendingDraft=null;queueDraft(payload);},400);}
 async function flushSelection(){if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}if(pendingDraft){const payload=pendingDraft;pendingDraft=null;queueDraft(payload);}await draftQueue;}
 function editingDisabled(disabled){apply.disabled=disabled;for(const c of grid.querySelectorAll(':scope > [data-photo-id]')){const role=c.querySelector('[data-field=role]');role.disabled=disabled;const radio=c.querySelector('input[type=radio]');if(radio)radio.disabled=disabled||['care-label','excluded'].includes(role.value);c.querySelector('[data-field=color]').disabled=disabled||['care-label','excluded'].includes(role.value);}}

 let pointData=null,pointRequest=0;
 async function loadPointChoices(style){
  const sequence=++pointRequest,list=dialog.querySelector('#photoPointCandidates'),status=dialog.querySelector('#photoPointMessage'),save=dialog.querySelector('#photoPointApply');pointData=null;list.replaceChildren();save.disabled=true;status.textContent='공식 소구점 후보를 확인하고 있습니다…';
  try{const r=await fetch('/api/smartstore-point-picker?channel=smartstore&style='+style),data=await r.json();if(sequence!==pointRequest||current?.style!==style)return;if(!r.ok)throw Error(data.error);pointData=data;
   for(const candidate of data.candidates){const label=document.createElement('label'),box=document.createElement('input'),body=document.createElement('span'),title=document.createElement('strong'),description=document.createElement('span'),evidence=document.createElement('small');box.type='checkbox';box.value=candidate.id;box.checked=data.selectedIds.includes(candidate.id);title.textContent=candidate.title;description.textContent=candidate.displayDescription??candidate.description;evidence.textContent='공식 근거: '+candidate.evidence;body.append(title,description,evidence);label.append(box,body);list.append(label);box.onchange=()=>{const selected=list.querySelectorAll('input:checked').length;if(selected>4){box.checked=false;status.textContent='최대 4개까지 적용할 수 있습니다.';return;}status.textContent=selected+'개 선택 · 적용 버튼을 눌러 저장하세요.';};}
   dialog.querySelector('#photoPointPicker summary').textContent='소구점 선택 · 후보 '+data.candidates.length+'개';status.textContent=data.message;save.disabled=data.candidates.length<2;
  }catch(e){if(sequence===pointRequest)status.textContent=e.message;}
 }
 dialog.querySelector('#photoPointApply').onclick=async()=>{if(!current||!pointData||current.style!==pointData.style)return;const button=dialog.querySelector('#photoPointApply'),status=dialog.querySelector('#photoPointMessage');const selectedIds=[...dialog.querySelectorAll('#photoPointCandidates input:checked')].map(e=>e.value);if(selectedIds.length<2||selectedIds.length>4){status.textContent='공식 근거에서 서로 다른 구매 장점 2~4개를 선택해 주세요.';return;}button.disabled=true;try{const r=await fetch('/api/smartstore-point-selection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({style:current.style,channel:'smartstore',revision:pointData.revision,selectedIds})}),result=await r.json();if(!r.ok)throw Error(result.error);pointData.selectedIds=selectedIds;status.textContent='✓ 구매 장점 '+result.count+'개 저장 완료 · '+(result.previewReady?'템플릿에 반영했습니다.':'사진 선택·반영 시 템플릿에 적용됩니다.');if(typeof refresh==='function')refresh();}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
 function decorateColor(node,index){
  const color=current?.colors?.[index],chip=current?.colorChips?.[color],tone=/^#[a-f0-9]{6}$/i.test(chip?.color||'')?chip.color:'#b8beb9';
  node.style.setProperty('--photo-accent',tone);node.style.setProperty('--photo-tint','#fff');
  const old=node.querySelector(':scope > .photo-official-chip');if(old)old.remove();
  if(!node.dataset.photoId&&chip?.image&&/^data:image\/jpeg;base64,/.test(chip.image)){const image=document.createElement('img');image.className='photo-official-chip';image.src=chip.image;image.alt=color+' 공식 색상칩';image.draggable=false;node.prepend(image);}
 }
 function arrangePhotoGroups(movedCard){
  const sectionNames=[...current.colors,'색상 선택 필요','케어라벨','사용 안 함'];
  const unassigned=current.colors.length;
  const groups=sectionNames.map(()=>[]);
  const orderedCards=[...grid.querySelectorAll(':scope > [data-photo-id]')];
  const movedIndex=orderedCards.indexOf(movedCard);
  if(movedIndex>=0)orderedCards.push(...orderedCards.splice(movedIndex,1));
  for(const card of orderedCards){
   const role=card.querySelector('[data-field=role]').value;
   const index=current.colors.indexOf(dragGroup(card));
   let section=index<0?unassigned:index;
   if(role==='care-label')section=unassigned+1;
   if(role==='excluded')section=unassigned+2;
   groups[section].push(card);
  }
  const fragment=document.createDocumentFragment();
  for(const [index,cards] of groups.entries()){
   if(!cards.length)continue;
   const heading=document.createElement('h3');
   heading.className='photo-group-heading';
   heading.textContent=sectionNames[index];
   decorateColor(heading,index);
   fragment.append(heading,...cards);
  }
  grid.replaceChildren(fragment);
  updatePhotoSummary();
 }
 sortButton.onclick=()=>{if(!loading&&current)arrangePhotoGroups();};

 function updatePhotoSummary(){
  const cards=grid.querySelectorAll(':scope > [data-photo-id]');
  assignOrderedRoles();
  const counts=new Map();for(const card of cards){const color=dragGroup(card);if(color)counts.set(color,(counts.get(color)||0)+1);}
  for(const badge of dialog.querySelectorAll('#manualPhotoReviewLegend [data-color]')){const count=counts.get(badge.dataset.color)||0,label=count+'장'+(count?'':' · 사진 없음'),node=badge.querySelector('.photo-color-count');if(node.textContent!==label)node.textContent=label;}
 }
 const channel=()=>document.body.dataset.channel||document.querySelector('[data-channel].active')?.dataset.channel;
 function isSmartstore(){return typeof activeChannel==='function'?activeChannel()==='smartstore':channel()==='smartstore';}
 function sync(){button.hidden=!isSmartstore();if(!isSmartstore()&&dialog.open)dialog.close();}
 let openAfterCollect=false;document.addEventListener('register-state',event=>{const state=event.detail;if(!isSmartstore())return;if(state.phase==='collect'&&state.busy)openAfterCollect=true;if(openAfterCollect&&!state.busy){openAfterCollect=false;if(state.phase==='done'&&state.productStyle&&!dialog.open)button.click();}});const styleInput=document.getElementById('style');styleInput?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&isSmartstore()){event.preventDefault();event.stopImmediatePropagation();document.getElementById('collect')?.click();}},true);
 let automaticStamp='',automaticRequest=false;
 document.addEventListener('register-state',async event=>{
  const status=event.detail?.photoColorDraft;
  if(!dialog.open||loading||!current||status?.style!==current.style)return;
  if(['running','needs-review'].includes(status.status)){
   if(!draftTimer)selectionStatus.textContent=status.message;
   return;
  }
  if(status.status!=='ready'||automaticStamp===status.updatedAt||automaticRequest||photoDrag)return;
  automaticRequest=true;
  const requested=current;
  try{
   const response=await fetch('/api/smartstore-photo-review?channel=smartstore&style='+current.style);
   const data=await response.json();
   if(!response.ok||!dialog.open||loading||photoDrag||current!==requested||data.revision!==current.revision)return;
   automaticStamp=status.updatedAt;
   let changed=false;
   const cardsById=new Map([...grid.querySelectorAll(':scope > [data-photo-id]')].map(card=>[card.dataset.photoId,card]));
   for(const item of data.items){
    const card=cardsById.get(item.id);
    if(!card||card.dataset.colorOverride==='true')continue;
    const color=card.querySelector('[data-field=color]'),role=card.querySelector('[data-field=role]');
    if(card.dataset.roleOverride!=='true'&&item.role==='care-label'&&!['care-label','excluded'].includes(role.value)){
     role.value='care-label';
     color.value='';
    }else if(!color.value&&item.color){
     color.value=item.color;
    }else continue;
    card.refreshPhotoView?.();
    changed=true;
   }
   if(changed){
    const top=dialog.scrollTop;
    arrangePhotoGroups();
    dialog.scrollTop=top;
   }
   selectionStatus.textContent=status.message;
  }catch{}finally{automaticRequest=false;}
 });
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-channel','class']});document.addEventListener('register-state',sync);sync();
 dialog.querySelector('#manualPhotoReviewClose').onclick=()=>dialog.close();
 button.onclick=async()=>{
  if(loading||dialog.open||!isSmartstore())return;loading=true;button.disabled=true;message.textContent='사진 목록을 불러오는 중…';selectionStatus.textContent='사진 목록을 불러오는 중…';grid.replaceChildren();apply.disabled=true;dialog.showModal();
  try{const state=await(await fetch('/api/state?channel=smartstore')).json();if(state.busy)throw Error('현재 작업이 끝난 뒤 열어 주세요.');if(!state.product)throw Error('상품을 먼저 수집해 주세요.');const r=await fetch('/api/smartstore-photo-review?channel=smartstore&style='+encodeURIComponent(state.product.style));const data=await r.json();if(!r.ok)throw Error(data.error);current=data;loadPointChoices(data.style);let localSelection=null;try{localSelection=JSON.parse(localStorage.getItem('smartstore.photo-selection.v1.'+data.style));}catch{}const restoreLocal=localSelection?.sourceUrl===data.sourceUrl&&localSelection.revision===data.revision&&Date.parse(localSelection.savedAt)>Date.parse(data.selectionSavedAt||'1970-01-01');if(restoreLocal&&localSelection.mainId&&data.items.some(i=>i.id===localSelection.mainId)){data.mainId=localSelection.mainId;for(const i of data.items)i.main=i.id===data.mainId;}if(restoreLocal)for(const item of data.items){const saved=localSelection.items?.find(i=>i.id===item.id);if(saved){if(saved.color||saved.colorOverride)item.color=saved.color;if(saved.role&&(!item.labelSuggested||saved.roleOverride!==false||saved.colorOverride)){item.role=saved.role;item.roleDefaulted=false;}item.colorOverride=!!saved.colorOverride;item.roleOverride=saved.roleOverride??true;}}selectionStatus.textContent=restoreLocal?'브라우저에 보관한 선택을 복원했습니다.':data.selectionSavedAt?'✓ 저장한 선택을 불러왔습니다.':'선택은 자동 저장됩니다. 확인 후 사진 반영을 눌러 주세요.';
   if(restoreLocal){const order=new Map(localSelection.items.map((item,index)=>[item.id,index]));data.items.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));}
   const legend=dialog.querySelector('#manualPhotoReviewLegend');legend.replaceChildren();for(const [index,c] of data.colors.entries()){const badge=document.createElement('span');badge.className='photo-color-badge';badge.dataset.color=c;badge.textContent=c;decorateColor(badge,index);const count=document.createElement('small');count.className='photo-color-count';badge.append(count);legend.append(badge);}
   dialog.querySelector('#manualPhotoReviewSummary').textContent=data.style+' · '+data.items.length+'장';
   const cardFragment=document.createDocumentFragment();for(const item of data.items){
    const card=document.createElement('div');
    card.className='photo-review-card';
    card.dataset.photoId=item.id;
    card.dataset.colorOverride=String(!!item.colorOverride);
    card.dataset.roleOverride=String(item.roleOverride??(!!item.role&&!item.roleDefaulted));
    card.dataset.main=String(item.main);
    const img=document.createElement('img');
    img.draggable=false;img.loading='lazy';img.decoding='async';
    img.src='/smartstore-review-photo/'+item.id+'?channel=smartstore&style='+data.style;
    img.alt=item.name;
    const mainLabel=document.createElement('label'),mainRadio=document.createElement('input');
    mainLabel.className='photo-main-choice';mainLabel.title='상품 대표사진으로 사용';
    mainRadio.type='radio';mainRadio.name='photo-main-choice';mainRadio.checked=item.main;
    mainRadio.setAttribute('aria-label',item.name+' 대표사진 선택');
    mainLabel.append(mainRadio,document.createTextNode('대표'));
    mainRadio.onchange=()=>{
     current.mainId=item.id;
     for(const c of grid.querySelectorAll(':scope > [data-photo-id]'))c.dataset.main=String(c.dataset.photoId===item.id);
     rememberSelection();
    };
    const name=document.createElement('p');
    name.className='photo-file-name';name.textContent=item.name;name.title=item.name;
    const color=document.createElement('select');
    color.setAttribute('aria-label',item.name+' 색상');color.dataset.field='color';
    color.add(new Option('색상 선택',''));
    for(const c of data.colors)color.add(new Option(c,c));
    color.value=item.color;
    const role=document.createElement('select');
    role.setAttribute('aria-label',item.name+' 구도');role.dataset.field='role';
    for(const [value,label] of [['','구도 선택'],['front','정면'],['side','옆면'],['back','후면'],['detail','디테일'],['care-label','케어라벨'],['excluded','사용 안 함']])role.add(new Option(label,value));
    role.value=item.role;
    const badge=document.createElement('strong');badge.className='photo-color-badge';
    const update=()=>{
     mainRadio.disabled=['care-label','excluded'].includes(role.value);
     color.disabled=['care-label','excluded'].includes(role.value);
     card.classList.toggle('photo-unused',role.value==='excluded');
     const neutral=['care-label','excluded'].includes(role.value);
     card.dataset.reorderable=String(!neutral&&!!color.value);
     decorateColor(card,neutral?-1:data.colors.indexOf(color.value));
     badge.textContent=role.value==='excluded'?'사용 안 함':role.value==='care-label'?'케어라벨':color.value||'색상 선택 필요';
     decorateColor(badge,neutral?-1:data.colors.indexOf(color.value));
    };
    role.onchange=()=>{
     card.dataset.roleOverride='true';
     const top=dialog.scrollTop;update();updatePhotoSummary();rememberSelection();dialog.scrollTop=top;
    };
    color.onchange=()=>{
     const focused=document.activeElement===color;
     card.dataset.colorOverride='true';
     update();
     arrangePhotoGroups(card);
     rememberSelection();
     if(focused)color.focus({preventScroll:true});
     card.scrollIntoView({block:'nearest',inline:'nearest'});
    };
    card.refreshPhotoView=update;update();
    const cardTop=document.createElement('div');cardTop.className='photo-card-top';cardTop.append(badge,mainLabel);
    const fields=document.createElement('div');fields.className='photo-card-fields';
    const colorLabel=document.createElement('label');colorLabel.append(document.createTextNode('색상'),color);
    const roleLabel=document.createElement('label');roleLabel.append(document.createTextNode('구도·사용'),role);
    fields.append(colorLabel,roleLabel);
    card.append(cardTop,img,fields,name);cardFragment.append(card);
   }
   grid.append(cardFragment);arrangePhotoGroups();
   message.textContent='확인 필요 '+data.items.filter(i=>!i.role||(!['care-label','excluded'].includes(i.role)&&!data.colors.includes(i.color))).length+'장';apply.disabled=!data.items.length;if(restoreLocal)rememberSelection();
  }catch(e){message.textContent=e.message;selectionStatus.textContent=e.message;}finally{loading=false;button.disabled=false;}
 };
 apply.onclick=async()=>{
  if(loading||!current||!isSmartstore())return;rememberSelection();try{await flushSelection();}catch(e){selectionStatus.textContent='선택 저장 실패: '+e.message;return;}const items=[...grid.querySelectorAll(':scope > [data-photo-id]')].map(card=>({id:card.dataset.photoId,color:card.querySelector('[data-field=color]').value,role:card.querySelector('[data-field=role]').value}));
  if(items.some(i=>!i.role||(!['care-label','excluded'].includes(i.role)&&!current.colors.includes(i.color)))){const missing=items.filter(i=>!i.role||(!['care-label','excluded'].includes(i.role)&&!current.colors.includes(i.color)));selectionStatus.textContent='선택은 저장됐습니다. 템플릿 반영 전 '+missing.length+'장의 색상·구도를 선택하거나 사용 안 함으로 지정해 주세요.';message.textContent=selectionStatus.textContent;grid.querySelector('[data-photo-id="'+missing[0].id+'"]')?.scrollIntoView({block:'center'});return;}
  loading=true;apply.disabled=true;editingDisabled(true);message.textContent='선택한 연결을 저장하고 미리보기를 준비합니다…';selectionStatus.textContent=message.textContent;
  try{const r=await fetch('/api/smartstore-photo-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...current,channel:'smartstore',items})});const result=await r.json();if(!r.ok)throw Error(result.error);let state;for(let n=0;n<180;n++){await new Promise(resolve=>setTimeout(resolve,1000));state=await(await fetch('/api/state?channel=smartstore')).json();if(state.product?.style!==current.style)throw Error('현재 상품이 변경됐습니다. 다시 열어 주세요.');if(!state.busy)break;}if(state?.busy)throw Error('미리보기 준비가 계속 진행 중입니다. 등록기 상태를 확인해 주세요.');if(state.error)throw Error(state.error);message.textContent=state.photoPreparation?.status==='ready'?'저장·반영 완료 · 템플릿과 추가이미지를 확인해 주세요.':'사진 연결 저장 완료 · '+(state.photoPreparation?.message||'남은 확인 항목을 검토해 주세요.');selectionStatus.textContent=message.textContent;if(state.phase==='done'&&state.photoPreparation?.status==='ready')dialog.close();if(typeof refresh==='function')refresh();
  }catch(e){message.textContent='반영 확인: '+e.message;selectionStatus.textContent=message.textContent;}finally{loading=false;apply.disabled=false;editingDisabled(false);}
 };
 const collectPhotos=document.getElementById('smartstoreCombinePhotos');if(collectPhotos){collectPhotos.textContent='📁 사진 불러오기·직접 선택';collectPhotos.onclick=async()=>{if(!isSmartstore()||loading)return;const input=document.getElementById('style').value.trim();try{let st=await(await fetch('/api/state?channel=smartstore')).json();if(st.busy)throw Error('현재 작업이 끝난 뒤 열어 주세요.');if(!st.product||(input&&input!==st.product.style&&input!==st.product.sourceUrl)){const r=await fetch('/api/collect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({style:input,channel:'smartstore'})});const result=await r.json();if(!r.ok)throw Error(result.error);collectPhotos.disabled=true;for(let i=0;i<240;i++){await new Promise(resolve=>setTimeout(resolve,1000));st=await(await fetch('/api/state?channel=smartstore')).json();if(!st.busy)break;}if(st.busy)throw Error('공식 정보 수집이 진행 중입니다. 완료 후 다시 눌러 주세요.');if(st.error)throw Error(st.error);}button.click();}catch(e){document.getElementById('error').textContent=e.message;}finally{collectPhotos.disabled=false;}};}
 if(location.hash==='#smartstore-photo-review'){document.getElementById('channelSmartstore')?.click();button.click();}
})();
