// Keep reviewed results in the server after the image worker exits. The
// workflow owns all source guards and the synchronous final manifest commit.
export function createPendingBackgroundApply({workflow,onComplete=()=>{},onFailure=()=>{},delayMs=1200,setTimeoutImpl=setTimeout,clearTimeoutImpl=clearTimeout}){
 if(!workflow||['status','complete','fail'].some(name=>typeof workflow[name]!=='function'))throw Error('합성 적용 작업을 확인해 주세요.');
 if(!Number.isFinite(delayMs)||delayMs<=0)throw Error('합성 적용 확인 간격을 확인해 주세요.');
 let pending=null;
 const notify=(callback,value)=>{try{callback(value)?.catch?.(()=>{});}catch{}};
 function matches(record){
  const status=workflow.status();
  return status?.jobId===record.payload.jobId&&status.status==='applying-wait'&&
   (record.payload.attempt===undefined||status.attempt===undefined||status.attempt===record.payload.attempt);
 }
 function cancel(){
  const record=pending;pending=null;
  if(record?.timer!==null&&record?.timer!==undefined)clearTimeoutImpl(record.timer);
  return !!record;
 }
 function failure(record,error){
  if(pending!==record)return;
  cancel();
  const result={jobId:record.payload.jobId,message:error?.message||'합성 결과를 적용하지 못했습니다.'};
  try{workflow.fail(result);}catch{}
  notify(onFailure,result);
 }
 function arm(record){
  record.timer=setTimeoutImpl(()=>{
   if(pending!==record)return;
   record.timer=null;
   try{
    if(!matches(record)){cancel();return;}
    // Do not await between checking ownership and invoking the workflow.
    const result=workflow.complete(record.payload);
    if(pending!==record)return;
    if(result?.waiting===true){
     if(matches(record))arm(record);else cancel();
     return;
    }
    if(result?.ok!==true)throw Error('합성 결과 적용 완료를 확인하지 못했습니다.');
    cancel();
    notify(onComplete,{...result,jobId:record.payload.jobId});
   }catch(error){failure(record,error);}
  },delayMs);
  record.timer?.unref?.();
 }
 function schedule({jobId,reviewed,reuse,attempt}={}){
  if(typeof jobId!=='string'||!jobId||(reviewed!==true&&reuse!==true)||
   (attempt!==undefined&&(!Number.isInteger(attempt)||attempt<1)))throw Error('검수한 합성 적용 요청을 확인해 주세요.');
  const record={payload:Object.freeze({jobId,reviewed,reuse,attempt}),timer:null};
  if(!matches(record))return false;
  cancel();pending=record;
  try{arm(record);}catch(error){failure(record,error);return false;}
  return true;
 }
 function has(jobId){return pending?.payload.jobId===jobId&&matches(pending);}
 return {schedule,cancel,has};
}
