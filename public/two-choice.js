(()=>{
 const el=id=>document.getElementById(id),panel=el('twoChoicePanel');if(!panel)return;
 let packages=[],busy=false,pending=false,uploadPending=false;
 const current=()=>packages.find(p=>p.id===el('twoChoiceSelect').value);
 function sync(){const item=current();for(const id of ['twoChoicePreview','twoChoiceSave','twoChoiceParts'])el(id).disabled=busy||pending||!item;el('twoChoiceUpload').disabled=busy||pending||!item||document.body.dataset.channel!=='smartstore';el('twoChoiceSelect').disabled=busy||pending;el('twoChoiceChannelHint').hidden=document.body.dataset.channel==='smartstore';}
 async function request(endpoint,body){const response=await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,channel:document.body.dataset.channel})});const data=await response.json();if(!response.ok)throw Error(data.error||'요청 실패');return data;}
 async function action(fn){pending=true;sync();try{await fn();}catch(error){el('twoChoiceStatus').textContent=error.message;}finally{pending=false;sync();}}
 el('twoChoiceSelect').onchange=()=>{el('twoChoiceFrame').hidden=true;el('twoChoiceFrame').removeAttribute('src');el('twoChoiceStatus').textContent='선택한 구성의 미리보기를 확인해 주세요.';};
 el('twoChoicePreview').onclick=()=>action(async()=>{const p=current();el('twoChoiceFrame').src='/smartstore-two-choice/'+encodeURIComponent(p.id)+'/preview.html?v='+p.revision;el('twoChoiceFrame').hidden=false;el('twoChoiceStatus').textContent=p.label+' · 저장한 두 상품 상세 미리보기';});
 for(const [id,kind] of [['twoChoiceSave','full'],['twoChoiceParts','parts']])el(id).onclick=()=>action(async()=>{const p=current(),result=await request('smartstore-two-choice-save',{id:p.id,revision:p.revision,kind});el('twoChoiceStatus').textContent='바탕화면 이미지다운에 '+result.count+'개 파일 저장 완료 · '+result.folder;});
 el('twoChoiceUpload').onclick=()=>action(async()=>{const p=current();await request('smartstore-two-choice-upload',{id:p.id,revision:p.revision});busy=true;uploadPending=true;el('twoChoiceStatus').textContent='조회/수정 화면의 판매자 상품코드 확인 후 상세만 첨부 중입니다.';});
 document.addEventListener('register-state',event=>{const s=event.detail;busy=s.busy;if(uploadPending&&!s.busy){uploadPending=false;el('twoChoiceStatus').textContent=s.error||'두 상품 상세 편집기 준비 완료 · 편집기 등록과 상품 저장은 누르지 않았습니다.';}sync();});
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-channel']});
 fetch('/api/smartstore-two-choice').then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);packages=data.packages;const select=el('twoChoiceSelect');select.replaceChildren();for(const p of packages){const option=document.createElement('option');option.value=p.id;option.textContent=p.label;select.append(option);}el('twoChoiceStatus').textContent=packages.length?'저장한 두 상품 구성을 선택해 미리보기를 열어 주세요.':'저장된 두 상품 상세가 없습니다.';sync();}).catch(e=>{el('twoChoiceStatus').textContent=e.message;sync();});sync();
})();
