import test from 'node:test';import assert from 'node:assert/strict';
import {startSmartstoreProgress,advanceSmartstoreProgress,finishSmartstoreProgress} from '../smartstore-job-progress.mjs';
test('단계 전환은 전체 시작 시간을 유지하고 완료와 실패 및 중단 시간을 고정한다',()=>{
 for(const phase of ['done','error','stopped']){
  const p=startSmartstoreProgress(1000);advanceSmartstoreProgress(p,'upload',4000);
  assert.equal(p.startedAt,1000);assert.equal(p.stepStartedAt,4000);
  finishSmartstoreProgress(p,phase,'사진 오류',9000);finishSmartstoreProgress(p,'done',null,12000);
  advanceSmartstoreProgress(p,'detail',14000);
  assert.equal(p.finishedAt,9000);assert.equal(p.status,phase);assert.equal(p.step,'upload');
  if(phase==='error')assert.equal(p.message,'사진 오류');
 }
});
