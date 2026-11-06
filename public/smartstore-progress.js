(()=>{
 const button=document.getElementById('smartstoreStart');if(!button)return;
 const panel=document.createElement('div');panel.id='smartstoreUploadProgress';panel.dataset.channelOnly='smartstore';panel.hidden=true;
 const heading=document.createElement('div');heading.className='upload-progress-heading';
 const activity=document.createElement('span');activity.className='upload-progress-activity';activity.textContent='작업 중';
 const stage=document.createElement('strong');stage.setAttribute('role','status');stage.setAttribute('aria-live','polite');
 const clock=document.createElement('span');clock.className='upload-progress-clock';clock.setAttribute('role','timer');clock.setAttribute('aria-live','off');
 const message=document.createElement('p');message.className='upload-progress-message';
 const metrics=document.createElement('div');metrics.className='upload-progress-metrics';metrics.hidden=true;
 heading.append(activity,stage,clock);panel.append(heading,message,metrics);button.closest('.register-actions').after(panel);
 const labels={request:'시작 요청 중',collect:'공식 정보 확인',prepare:'사진·색상 확인',connect:'판매자 화면 확인',compose:'사진 합성',detail:'상세이미지 준비',upload:'상품정보 입력·사진 업로드'};
 const duration=ms=>{const seconds=Math.max(0,Math.floor(ms/1000));return seconds>=60?Math.floor(seconds/60)+'분 '+String(seconds%60).padStart(2,'0')+'초':seconds+'초';};
 let progress=null,pending=false,previousId=null,requestAt=0,timer=null;
 function paint(){
  if(!progress)return;
  panel.hidden=false;panel.dataset.status=progress.status;
  const running=progress.status==='running',end=progress.finishedAt||Date.now();
  activity.hidden=!running;
  stage.textContent=running?progress.stepLabel||labels[progress.step]||'작업 진행 중':({done:'편집기 준비 완료',error:'확인 필요',stopped:'중단됨'})[progress.status]+(progress.status==='error'&&progress.stepLabel?' · '+progress.stepLabel:'');
  clock.textContent='전체 '+duration(end-progress.startedAt)+(running&&progress.step!=='request'?' · 현재 단계 '+duration(end-progress.stepStartedAt):'');
  message.textContent=progress.message||'처리 중입니다.';
  const measured=Object.entries(progress.timings||{}).filter(([id])=>['options','mainImage','extraImages','productInfo','careLabels','editor','detailVideo','detailFinish','uploadFiles'].includes(id)||/^detailImage\d+$/.test(id));
  const groups=measured.filter(([id])=>!/^detailImage\d+$/.test(id)).map(([,value])=>value);
  const details=measured.filter(([id])=>/^detailImage\d+$/.test(id)).map(([,value])=>value);
  if(details.length)groups.push({label:'상세이미지 첨부',ms:details.reduce((sum,x)=>sum+x.ms,0),status:details.find(x=>x.status!=='done')?.status||'done'});
  const metricText=groups.map(x=>x.label+' '+(x.ms/1000).toFixed(1)+'초'+(x.status==='error'?' (확인 필요)':x.status==='stopped'?' (중단)':'')).join(' · ');
  metrics.hidden=!metricText;
  if(metrics.textContent!==metricText)metrics.textContent=metricText;
  panel.setAttribute('aria-busy',String(running));
  const floatingStage=document.querySelector('#clickFeedback.upload-working .upload-motion-stage');
  const floatingClock=document.querySelector('#clickFeedback.upload-working .upload-motion-clock');
  if(running&&floatingStage&&floatingStage.textContent!==stage.textContent)floatingStage.textContent=stage.textContent;
  if(running&&floatingClock)floatingClock.textContent='전체 '+duration(end-progress.startedAt);
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
