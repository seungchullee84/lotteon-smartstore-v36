(()=>{
 const button=document.getElementById('smartstoreStart');if(!button)return;
 const panel=document.createElement('div');panel.id='smartstoreUploadProgress';panel.dataset.channelOnly='smartstore';panel.hidden=true;
 const heading=document.createElement('div');heading.className='upload-progress-heading';
 const stage=document.createElement('strong');stage.setAttribute('role','status');stage.setAttribute('aria-live','polite');
 const clock=document.createElement('span');clock.className='upload-progress-clock';clock.setAttribute('role','timer');clock.setAttribute('aria-live','off');
 const message=document.createElement('p');message.className='upload-progress-message';
 heading.append(stage,clock);panel.append(heading,message);button.closest('.register-actions').after(panel);
 const labels={request:'시작 요청 중',collect:'공식 정보 확인',prepare:'사진·색상 확인',connect:'판매자 화면 확인',compose:'사진 합성',detail:'상세이미지 준비',upload:'상품정보 입력·사진 업로드'};
 const duration=ms=>{const seconds=Math.max(0,Math.floor(ms/1000));return seconds>=60?Math.floor(seconds/60)+'분 '+String(seconds%60).padStart(2,'0')+'초':seconds+'초';};
 let progress=null,pending=false,previousId=null,requestAt=0,timer=null;
 function paint(){
  if(!progress)return;
  panel.hidden=false;panel.dataset.status=progress.status;
  const running=progress.status==='running',end=progress.finishedAt||Date.now();
  stage.textContent=running?labels[progress.step]||'작업 진행 중':({done:'편집기 준비 완료',error:'확인 필요',stopped:'중단됨'})[progress.status];
  clock.textContent='전체 '+duration(end-progress.startedAt)+(running&&progress.step!=='request'?' · 현재 단계 '+duration(end-progress.stepStartedAt):'');
  message.textContent=progress.message||'처리 중입니다.';
  panel.setAttribute('aria-busy',String(running));
  if(!running&&timer){clearInterval(timer);timer=null;}
 }
 function update(next){progress={...next};paint();if(progress.status==='running'&&!timer)timer=setInterval(paint,1000);}
 document.addEventListener('smartstore-auto-request',event=>{
  if(event.detail.status==='starting'){
   previousId=progress?.id;pending=true;const now=Date.now();requestAt=now;
   update({startedAt:now,stepStartedAt:now,step:'request',status:'running',message:'요청을 접수하고 있습니다.'});
  }else if(pending){pending=false;update({...progress,status:'error',finishedAt:Date.now(),message:event.detail.error});}
 });
 document.addEventListener('register-state',event=>{
  const next=event.detail.autoProgress;if(!next)return;
  // A poll already in flight can still contain the previous run's result.
  if(next.startedAt<requestAt||pending&&next.id===previousId)return;
  pending=false;update(next);
 });
})();
