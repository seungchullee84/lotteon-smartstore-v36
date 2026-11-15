import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createPendingBackgroundApply} from '../background-pending-apply.mjs';
import {createBackgroundWorkflow} from '../background-workflow.mjs';

function fakeClock(){
 let sequence=0,unrefs=0;
 const timers=new Map(),history=[];
 const setTimeoutImpl=(callback,delay)=>{
  const timer={id:++sequence,callback,delay,unref(){unrefs++;}};
  timers.set(timer.id,timer);history.push(timer);return timer;
 };
 const clearTimeoutImpl=timer=>timers.delete(timer.id);
 const tick=()=>{
  const timer=timers.values().next().value;assert.ok(timer,'a retry timer must be scheduled');
  timers.delete(timer.id);timer.callback();
 };
 return {setTimeoutImpl,clearTimeoutImpl,tick,history,count:()=>timers.size,unrefs:()=>unrefs};
}
function mockFixture(){
 const clock=fakeClock(),completed=[],failed=[],calls=[],manualCalls=[],failCalls=[],manualFailCalls=[];
 let status={jobId:'job-old-001',status:'applying-wait',attempt:1},busy=true,guardError=null;
 const workflow={status:()=>status,complete(payload){
  calls.push({...payload});
  if(guardError)throw guardError;
  if(busy)return {ok:true,waiting:true,jobId:payload.jobId};
  status={...status,status:'complete'};return {ok:true,file:'main-result.jpg'};
 },manualApply(payload){
  manualCalls.push({...payload});
  if(guardError)throw guardError;
  if(busy)return {ok:true,waiting:true,jobId:payload.jobId,attempt:payload.attempt};
  status={...status,status:'complete'};return {ok:true,file:'manual-preview-attempt-'+payload.attempt+'.jpg'};
 },fail(value){failCalls.push(value);if(status.jobId===value.jobId)status={...status,status:'error'};},
 manualFail(value){manualFailCalls.push(value);if(status.jobId===value.jobId)status={...status,status:'error'};}};
 const pending=createPendingBackgroundApply({workflow,...clock,onComplete:value=>completed.push(value),onFailure:value=>failed.push(value)});
 return {clock,workflow,pending,completed,failed,calls,manualCalls,failCalls,manualFailCalls,
  setStatus:value=>{status=value;},idle:()=>{busy=false;},guardFails:()=>{guardError=Error('source changed');}};
}

test('busy retries retain approved payload, unref every timer and finish once idle',()=>{
 const f=mockFixture(),payload={jobId:'job-old-001',reviewed:true,attempt:1};
 assert.equal(f.pending.schedule(payload),true);
 assert.equal(f.pending.has(payload.jobId),true);
 f.clock.tick();f.clock.tick();
 assert.equal(f.completed.length,0);assert.equal(f.clock.count(),1);
 f.idle();f.clock.tick();
 assert.equal(f.calls.length,3);assert.equal(f.completed.length,1);
 assert.equal(f.completed[0].jobId,payload.jobId);
 assert.equal(f.pending.has(payload.jobId),false);assert.equal(f.clock.count(),0);
 assert.equal(f.clock.unrefs(),3);
 assert(f.clock.history.every(timer=>timer.delay===1200));
});

test('schedule snapshots approval fields and ignores later caller mutation and extra input',()=>{
 const f=mockFixture(),payload={jobId:'job-old-001',reviewed:true,reuse:false,attempt:1,generatedPath:'must-not-forward'};
 f.pending.schedule(payload);
 payload.jobId='job-new-002';payload.reviewed=false;payload.reuse=true;payload.attempt=2;
 f.idle();f.clock.tick();
 assert.deepEqual(f.calls,[{jobId:'job-old-001',reviewed:true,reuse:false,attempt:1}]);
 assert.equal(f.completed[0].jobId,'job-old-001');
});

test('cancel prevents an already queued callback from invoking the workflow',()=>{
 const f=mockFixture();f.pending.schedule({jobId:'job-old-001',reviewed:true});
 const oldCallback=f.clock.history[0].callback;
 assert.equal(f.pending.cancel(),true);assert.equal(f.pending.cancel(),false);
 assert.equal(f.pending.has(),false);
 oldCallback();assert.equal(f.calls.length,0);assert.equal(f.clock.count(),0);
 assert.equal(f.completed.length,0);assert.equal(f.failed.length,0);
});

test('an omitted first-attempt field still binds approval to the attempt present when scheduled',()=>{
 const f=mockFixture();f.pending.schedule({jobId:'job-old-001',reviewed:true});
 f.setStatus({jobId:'job-old-001',status:'applying-wait',attempt:2});
 f.clock.tick();
 assert.equal(f.calls.length,0);assert.equal(f.clock.count(),0);assert.equal(f.failed.length,0);
});

test('superseded job callbacks cannot apply, clear or report failure for the new job',()=>{
 const f=mockFixture();f.pending.schedule({jobId:'job-old-001',reviewed:true});
 const oldCallback=f.clock.history[0].callback;
 f.setStatus({jobId:'job-new-002',status:'applying-wait',attempt:1});
 f.pending.schedule({jobId:'job-new-002',reuse:true});
 oldCallback();assert.equal(f.calls.length,0);assert.equal(f.pending.has('job-new-002'),true);
 f.idle();f.clock.tick();
 assert.deepEqual(f.calls,[{jobId:'job-new-002',reviewed:undefined,reuse:true,attempt:undefined}]);
 assert.equal(f.completed[0].jobId,'job-new-002');assert.equal(f.failed.length,0);
});

test('changed workflow status, job or review attempt silently discards a pending apply',()=>{
 for(const status of [null,{jobId:'job-old-001',status:'cancelled',attempt:1},{jobId:'job-old-001',status:'generating',attempt:2},{jobId:'job-old-001',status:'applying-wait',attempt:2},{jobId:'job-new-002',status:'applying-wait',attempt:1}]){
  const f=mockFixture();f.pending.schedule({jobId:'job-old-001',reviewed:true,attempt:1});
  f.setStatus(status);assert.equal(f.pending.has('job-old-001'),false);
  f.clock.tick();assert.equal(f.calls.length,0);assert.equal(f.clock.count(),0);
  assert.equal(f.completed.length,0);assert.equal(f.failed.length,0);
 }
});

test('guard failure terminates only the scheduled job and reports one actionable failure',()=>{
 const f=mockFixture();f.pending.schedule({jobId:'job-old-001',reviewed:true});f.guardFails();
 f.clock.tick();
 assert.deepEqual(f.failCalls,[{jobId:'job-old-001',message:'source changed'}]);
 assert.deepEqual(f.failed,f.failCalls);assert.equal(f.clock.count(),0);
 assert.equal(f.pending.has('job-old-001'),false);assert.equal(f.completed.length,0);
 f.clock.history[0].callback();assert.equal(f.failCalls.length,1);
});

test('unapproved payload and a non-waiting job never get a timer',()=>{
 const f=mockFixture();
 for(const payload of [{jobId:'job-old-001'},{jobId:'job-old-001',reviewed:'true'},{jobId:'job-old-001',reviewed:true,attempt:0}])assert.throws(()=>f.pending.schedule(payload),/검수한 합성/);
 assert.equal(f.pending.schedule({jobId:'job-other-003',reviewed:true}),false);
 assert.equal(f.clock.count(),0);assert.equal(f.calls.length,0);
});

test('notification errors do not turn successful application into a workflow failure',()=>{
 const f=mockFixture(),pending=createPendingBackgroundApply({workflow:f.workflow,...f.clock,onComplete(){throw Error('display unavailable');}});
 pending.schedule({jobId:'job-old-001',reviewed:true});f.idle();
 assert.doesNotThrow(()=>f.clock.tick());
 assert.equal(f.workflow.status().status,'complete');assert.equal(f.failCalls.length,0);
});

test('manual queue snapshots explicit approval and applies the chosen earlier preview only when idle',()=>{
 const f=mockFixture();f.setStatus({jobId:'job-old-001',status:'applying-wait',attempt:1,latestAttempt:3});
 const payload={jobId:'job-old-001',attempt:1,userApproved:true,reviewed:true,reuse:true};
 assert.equal(f.pending.schedule(payload),true);
 payload.attempt=3;payload.userApproved=false;
 f.clock.tick();assert.equal(f.completed.length,0);assert.equal(f.pending.has('job-old-001'),true);
 f.idle();f.clock.tick();
 assert.deepEqual(f.manualCalls,[{jobId:'job-old-001',attempt:1,userApproved:true},{jobId:'job-old-001',attempt:1,userApproved:true}]);
 assert.equal(f.calls.length,0,'manual approval must never use automatic complete');
 assert.equal(f.completed[0].file,'manual-preview-attempt-1.jpg');
 assert.equal(f.clock.count(),0);
});

test('manual approval must be literal true and include the selected attempt',()=>{
 const f=mockFixture();
 for(const userApproved of [false,'true',1])assert.throws(()=>f.pending.schedule({jobId:'job-old-001',attempt:1,userApproved,reviewed:true}),/검수한 합성/);
 assert.throws(()=>f.pending.schedule({jobId:'job-old-001',userApproved:true}),/검수한 합성/);
 assert.equal(f.clock.count(),0);assert.equal(f.manualCalls.length,0);assert.equal(f.calls.length,0);
});

test('cancelled manual callbacks and changed chosen attempts cannot fall back to automatic apply',()=>{
 for(const mode of ['cancel','attempt','job']){
  const f=mockFixture();f.pending.schedule({jobId:'job-old-001',attempt:1,userApproved:true});
  const callback=f.clock.history[0].callback;
  if(mode==='cancel'){f.pending.cancel();callback();}
  else{f.setStatus({jobId:mode==='job'?'job-new-002':'job-old-001',status:'applying-wait',attempt:2});f.clock.tick();}
  assert.equal(f.manualCalls.length,0);assert.equal(f.calls.length,0);assert.equal(f.completed.length,0);assert.equal(f.failed.length,0);assert.equal(f.clock.count(),0);
 }
});

test('manual preview guard failure ends the pending job without trying automatic completion',()=>{
 const f=mockFixture();f.pending.schedule({jobId:'job-old-001',attempt:1,userApproved:true});
 f.guardFails();f.clock.tick();
 assert.deepEqual(f.manualFailCalls,[{jobId:'job-old-001',message:'source changed'}]);
 assert.deepEqual(f.failed,f.manualFailCalls);assert.equal(f.failCalls.length,0);assert.equal(f.calls.length,0);assert.equal(f.completed.length,0);assert.equal(f.clock.count(),0);
});

async function actualFixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'pending-background-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'product');await mkdir(folder);
 const original=await sharp({create:{width:80,height:120,channels:3,background:'#546a38'}}).jpeg().toBuffer();
 const output=await sharp({create:{width:1500,height:1500,channels:3,background:'#8899aa'}}).jpeg().toBuffer();
 const product={style:'123456',sourceUrl:'https://example.test/current',images:{main:'official-main'}};
 const state={product,folder,revision:1,busy:false};
 const generatedPath=path.join(root,'generated.jpg');
 await Promise.all([writeFile(path.join(folder,'product.json'),JSON.stringify(product)),writeFile(path.join(folder,'background-selection.json'),JSON.stringify({style:product.style,key:'main'})),writeFile(path.join(folder,'main.jpg'),original),writeFile(generatedPath,output)]);
 const workflow=createBackgroundWorkflow({getState:()=>state,cacheRoot:path.join(root,'cache'),compose:async()=>output});
 const job=await workflow.prepare({style:product.style,key:'main',requestId:'request-pending-001'});
 await workflow.stage({jobId:job.jobId,generatedPath});
 const payload={jobId:job.jobId,reviewed:true,attempt:1};state.busy=true;
 assert.equal(workflow.complete(payload).waiting,true);
 const clock=fakeClock(),completed=[],failed=[];
 const pending=createPendingBackgroundApply({workflow,...clock,onComplete:value=>completed.push(value),onFailure:value=>failed.push(value)});
 pending.schedule(payload);
 return {folder,original,state,workflow,clock,pending,completed,failed,job};
}

test('real workflow queues through same-product edits and publishes only after idle without a worker',async t=>{
 const f=await actualFixture(t);
 f.clock.tick();f.clock.tick();
 await assert.rejects(readFile(path.join(f.folder,'background-image.json')),{code:'ENOENT'});
 f.state.product={...f.state.product,name:'edited name'};f.state.revision++;
 f.state.busy=false;f.clock.tick();
 const manifest=JSON.parse(await readFile(path.join(f.folder,'background-image.json'),'utf8'));
 assert.equal(manifest.reviewed,true);assert.equal(f.completed.length,1);assert.equal(f.failed.length,0);
 assert.deepEqual(await readFile(path.join(f.folder,'main.jpg')),f.original);
 assert.equal(f.workflow.status().status,'complete');assert.equal(f.pending.has(f.job.jobId),false);
});

test('real workflow rechecks changed original bytes before a deferred application',async t=>{
 const f=await actualFixture(t);
 await writeFile(path.join(f.folder,'main.jpg'),Buffer.from('source was replaced'));
 f.state.busy=false;f.clock.tick();
 await assert.rejects(readFile(path.join(f.folder,'background-image.json')),{code:'ENOENT'});
 assert.equal(f.workflow.status().status,'error');assert.equal(f.failed.length,1);assert.equal(f.completed.length,0);
 assert.equal(f.clock.count(),0);
});
