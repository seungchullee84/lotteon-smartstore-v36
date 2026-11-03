export function startSmartstoreProgress(now=Date.now()){
 return {id:String(now),startedAt:now,stepStartedAt:now,step:'collect',status:'running',message:'공식 정보 확인을 시작합니다.'};
}
export function advanceSmartstoreProgress(progress,step,now=Date.now()){
 if(progress?.status!=='running')return;
 progress.step=step;progress.stepStartedAt=now;progress.message='';
}
export function finishSmartstoreProgress(progress,phase,error,now=Date.now()){
 if(progress?.status!=='running')return;
 progress.status=phase==='done'?'done':phase==='stopped'?'stopped':'error';
 progress.finishedAt=now;
 progress.message=phase==='done'?'편집기 준비 완료 · 저장·등록 안 함':phase==='stopped'?'작업을 중단했습니다.':error||'진행 기록을 확인해 주세요.';
}
