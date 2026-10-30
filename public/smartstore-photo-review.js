(()=>{
 const css=document.createElement('link');css.rel='stylesheet';css.href='/smartstore-photo-review.css';document.head.append(css);
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='사진 색상·구도 수정';button.id='manualPhotoReviewOpen';button.dataset.channelOnly='smartstore';
 const anchor=document.getElementById('photoPreparationStatus');if(!anchor)return;anchor.after(button);
 const dialog=document.createElement('dialog');dialog.id='manualPhotoReviewDialog';
 dialog.innerHTML='<div class="bar"><h2>사진 색상·구도 확인</h2><button type="button" class="secondary" id="manualPhotoReviewClose">닫기</button></div><p id="manualPhotoReviewTitle"></p><p>틀린 사진만 수정하세요. 1번 사진은 대표로 유지됩니다. 비스듬한 정면은 “정면·다른 정면 구도”를 선택하세요.</p><div id="manualPhotoReviewGrid"></div><p id="manualPhotoReviewMessage" role="status"></p><button type="button" id="manualPhotoReviewApply">선택 저장·템플릿 및 추가이미지 반영</button><p>등록기 내부에만 저장합니다. 판매처 입력·업로드·상품 저장·등록은 실행하지 않습니다.</p>';
 document.body.append(dialog);let current=null,loading=false;const grid=dialog.querySelector('#manualPhotoReviewGrid'),message=dialog.querySelector('#manualPhotoReviewMessage'),apply=dialog.querySelector('#manualPhotoReviewApply');
 const channel=()=>document.body.dataset.channel||document.querySelector('[data-channel].active')?.dataset.channel;
 function isSmartstore(){return typeof activeChannel==='function'?activeChannel()==='smartstore':channel()==='smartstore';}
 function sync(){button.hidden=!isSmartstore();if(!isSmartstore()&&dialog.open)dialog.close();}
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-channel','class']});document.addEventListener('register-state',sync);sync();
 dialog.querySelector('#manualPhotoReviewClose').onclick=()=>dialog.close();
 button.onclick=async()=>{
  if(loading||!isSmartstore())return;loading=true;button.disabled=true;message.textContent='사진 목록을 불러오는 중…';grid.replaceChildren();apply.disabled=true;dialog.showModal();
  try{const state=await(await fetch('/api/state?channel=smartstore')).json();if(state.busy)throw Error('현재 작업이 끝난 뒤 열어 주세요.');if(!state.product)throw Error('상품을 먼저 수집해 주세요.');const r=await fetch('/api/smartstore-photo-review?channel=smartstore&style='+encodeURIComponent(state.product.style));const data=await r.json();if(!r.ok)throw Error(data.error);current=data;dialog.querySelector('#manualPhotoReviewTitle').textContent='품번 '+data.style+' · '+data.items.length+'장 · 원본은 보존합니다.';
   for(const item of data.items){const card=document.createElement('div');card.style.cssText='padding:10px;border:1px solid #c8decf;border-radius:10px;background:#fff';card.dataset.photoId=item.id;const img=document.createElement('img');img.src='/smartstore-review-photo/'+item.id+'?channel=smartstore&style='+data.style;img.alt=item.name;img.style.cssText='width:100%;height:230px;object-fit:contain;background:#f4f6f4';const name=document.createElement('p');name.textContent=(item.main?'대표 · ':'')+item.name;name.style.cssText='overflow-wrap:anywhere;font-size:12px';const color=document.createElement('select');color.setAttribute('aria-label',item.name+' 색상');color.dataset.field='color';color.add(new Option('색상 선택',''));for(const c of data.colors)color.add(new Option(c,c));color.value=item.color;const role=document.createElement('select');role.setAttribute('aria-label',item.name+' 구도');role.dataset.field='role';for(const [v,t] of [['','구도 선택'],['front','정면·다른 정면 구도'],['back','후면'],['side','완전 옆면'],['detail','디테일'],['care-label','케어라벨']])role.add(new Option(t,v));role.value=item.role;const update=()=>{color.disabled=role.value==='care-label';};role.onchange=update;update();card.append(img,name,color,role);grid.append(card);}
   message.textContent='확인 필요 '+data.items.filter(i=>!i.role||(i.role!=='care-label'&&!data.colors.includes(i.color))).length+'장 · 선택 후 아래 버튼으로 반영하세요.';apply.disabled=!data.items.length;
  }catch(e){message.textContent=e.message;}finally{loading=false;button.disabled=false;}
 };
 apply.onclick=async()=>{
  if(loading||!current||!isSmartstore())return;const items=[...grid.children].map(card=>({id:card.dataset.photoId,color:card.querySelector('[data-field=color]').value,role:card.querySelector('[data-field=role]').value}));
  if(items.some(i=>!i.role||(i.role!=='care-label'&&!current.colors.includes(i.color)))){message.textContent='모든 사진의 색상과 구도를 선택해 주세요.';return;}
  loading=true;apply.disabled=true;message.textContent='선택한 연결을 저장하고 미리보기를 준비합니다…';
  try{const r=await fetch('/api/smartstore-photo-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...current,channel:'smartstore',items})});const result=await r.json();if(!r.ok)throw Error(result.error);let state;for(let n=0;n<180;n++){await new Promise(resolve=>setTimeout(resolve,1000));state=await(await fetch('/api/state?channel=smartstore')).json();if(state.product?.style!==current.style)throw Error('현재 상품이 변경됐습니다. 다시 열어 주세요.');if(!state.busy)break;}if(state?.busy)throw Error('미리보기 준비가 계속 진행 중입니다. 등록기 상태를 확인해 주세요.');if(state.error)throw Error(state.error);message.textContent=state.photoPreparation?.status==='ready'?'저장·반영 완료 · 템플릿과 추가이미지를 확인해 주세요.':'사진 연결 저장 완료 · '+(state.photoPreparation?.message||'남은 확인 항목을 검토해 주세요.');if(typeof refresh==='function')refresh();
  }catch(e){message.textContent='반영 확인: '+e.message;}finally{loading=false;apply.disabled=false;}
 };
 if(location.hash==='#smartstore-photo-review'){document.getElementById('channelSmartstore')?.click();button.click();}
})();
