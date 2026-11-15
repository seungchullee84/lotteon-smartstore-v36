import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createBackgroundWorkflow} from '../background-workflow.mjs';
import {composeBackground} from '../background-composite.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const stale=/변경되어 합성을 적용하지 않았습니다/;
const images=Promise.all([
 sharp({create:{width:80,height:120,channels:3,background:'#9b364b'}}).jpeg().toBuffer(),
 sharp({create:{width:100,height:80,channels:3,background:'#28496b'}}).jpeg().toBuffer(),
 sharp({create:{width:96,height:96,channels:3,background:'#b8cdb1'}}).png().toBuffer(),
 sharp({create:{width:1500,height:1500,channels:3,background:'#b8cdb1'}}).jpeg().toBuffer()
]);

async function fixture(t,{compose,realCompose=false,onInvalidate}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'background-workflow-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const [original,extra,generated,output]=await images;
 const folder=path.join(root,'product'),cacheRoot=path.join(root,'cache'),generatedPath=path.join(root,'generated.png');
 const product={style:'116926',sourceUrl:'https://example.test/product/116926',images:{main:'main-source',extra1:'extra-source',extra2:'extra-source-2'}};
 const state={product,folder,revision:1,busy:false,photoPreparation:null};
 async function seedFolder(target){
  await mkdir(target,{recursive:true});
  await Promise.all([
   writeFile(path.join(target,'product.json'),JSON.stringify(product)),
   writeFile(path.join(target,'background-selection.json'),JSON.stringify({style:product.style,key:'main'})),
   writeFile(path.join(target,'main.jpg'),original),
   writeFile(path.join(target,'extra1.jpg'),extra),
   writeFile(path.join(target,'extra2.jpg'),extra)
  ]);
 }
 await seedFolder(folder);
 await writeFile(generatedPath,generated);
 let calls=0,sequence=0;
 const composeImpl=async input=>{calls++;return compose?compose(input):realCompose?composeBackground(input):output;};
 const options={getState:()=>state,cacheRoot,compose:composeImpl,onInvalidate};
 const workflow=createBackgroundWorkflow(options);
 const prepare=(overrides={})=>workflow.prepare({style:state.product.style,key:'main',sourceUrl:state.product.sourceUrl,revision:state.revision,requestId:'request_'+String(++sequence).padStart(8,'0'),...overrides});
 const stage=request=>workflow.stage({jobId:request.jobId,generatedPath});
 const complete=request=>workflow.complete({jobId:request.jobId,reviewed:true,attempt:workflow.inspect({jobId:request.jobId}).attempt});
 const manifest=()=>readFile(path.join(state.folder,'background-image.json'),'utf8').then(JSON.parse);
 const unapplied=()=>assert.rejects(readFile(path.join(state.folder,'background-image.json')),{code:'ENOENT'});
 return {root,folder,cacheRoot,generatedPath,original,extra,output,state,workflow,options,prepare,stage,complete,manifest,unapplied,seedFolder,calls:()=>calls};
}

test('original wall-clock start survives every phase while terminal elapsed time uses the monotonic clock',async t=>{
 let now=1800000000000,release;t.mock.method(Date,'now',()=>now);
 const f=await fixture(t,{compose:()=>new Promise(resolve=>{release=()=>resolve(f.output);})});
 const preparing=f.prepare(),startedAt=now;
 const check=phase=>{const status=f.workflow.status();assert.equal(status.status,phase);assert.equal(status.startedAt,startedAt);return status;};
 check('checking');const request=await preparing;now+=60000;check('waiting');
 f.workflow.dispatch({jobId:request.jobId});now+=60000;check('generating');
 const staging=f.stage(request);now+=60000;check('processing');release();await staging;check('review');
 now+=60000;const result=f.complete(request),complete=check('complete');assert.equal(complete.elapsedMs,result.elapsedMs);assert(Number.isFinite(complete.elapsedMs)&&complete.elapsedMs>=0&&complete.elapsedMs<60000,'elapsed time must not follow the simulated wall-clock jump');
 now+=60000;assert.deepEqual(f.workflow.status(),complete,'terminal timer remains frozen');
 const reused=await f.prepare();assert.equal(reused.cached,true);assert.equal(f.workflow.status().startedAt,now);assert.notEqual(f.workflow.status().startedAt,startedAt);
 f.workflow.complete({jobId:reused.jobId,reuse:true});assert.equal(f.workflow.status().startedAt,now);assert(Number.isFinite(f.workflow.status().elapsedMs));
});

test('cancellation, composition errors and worker errors retain original start and freeze elapsed time',async t=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);
 for(const mode of ['cancel','stage-error','worker-error'])await t.test(mode,async sub=>{
  const f=await fixture(sub,{compose:async()=>{throw Error('composition failed');}}),request=await f.prepare(),startedAt=f.workflow.status().startedAt;
  now+=60000;
  if(mode==='cancel')f.workflow.cancel({requestId:f.workflow.status().requestId});
  else if(mode==='stage-error')await assert.rejects(f.stage(request),/composition failed/);
  else f.workflow.fail({jobId:request.jobId,message:'worker failed'});
  const terminal=f.workflow.status();assert.equal(terminal.startedAt,startedAt);assert.equal(terminal.status,mode==='cancel'?'cancelled':'error');assert(Number.isFinite(terminal.elapsedMs)&&terminal.elapsedMs>=0&&terminal.elapsedMs<60000);
  now+=60000;assert.deepEqual(f.workflow.status(),terminal);
 });
});

test('reviewed composition from an extra source becomes the main image and preserves every original',async t=>{
 const f=await fixture(t,{realCompose:true});
 f.workflow.select({style:f.state.product.style,key:'extra2'});
 const request=await f.prepare({key:'extra2'});
 const preview=await f.stage(request);
 await f.unapplied();
 assert.equal(preview.originalPreserved,true);
 const result=f.complete(request),entry=await f.manifest();
 assert.equal(result.cached,false);
 assert.match(entry.file,/^main-composite-[a-f0-9]{24}\.jpg$/);
 assert.equal(entry.sourceKey,'extra2');
 assert.equal(entry.sourceHash,digest(f.extra));
 assert.equal(entry.reviewed,true);
 const bytes=await readFile(path.join(f.folder,entry.file));
 assert.equal(entry.outputHash,digest(bytes));
 const metadata=await sharp(bytes).metadata();
 assert.deepEqual([metadata.width,metadata.height,metadata.format],[1500,1500,'jpeg']);
 assert.deepEqual(await readFile(path.join(f.folder,'main.jpg')),f.original);
 for(const key of ['extra1','extra2'])assert.deepEqual(await readFile(path.join(f.folder,key+'.jpg')),f.extra);
 await assert.rejects(readFile(path.join(f.folder,'background-image-extra2.json')),{code:'ENOENT'});
 assert.throws(()=>f.complete(request),stale);
});

test('reviewed cache survives a new workflow and collection folder without composing again',async t=>{
 const f=await fixture(t),request=await f.prepare();
 await f.stage(request);f.complete(request);
 const previous=await f.manifest(),nextFolder=path.join(f.root,'collected-again');
 await f.seedFolder(nextFolder);
 f.state.folder=nextFolder;f.state.product={...f.state.product};f.state.revision++;
 const restarted=createBackgroundWorkflow(f.options);
 const result=await restarted.prepare({style:f.state.product.style,key:'main',requestId:'request_restart_01'});
 assert.equal(result.cached,true);
 assert.equal(result.applied,false);
 assert.ok(result.jobId);
 assert.throws(()=>restarted.dispatch({jobId:result.jobId}),/이미 진행 중이거나 재사용/);
 assert.equal(f.calls(),1);
 await f.unapplied();
 const applied=restarted.complete({jobId:result.jobId,reuse:true});
 assert.equal(applied.cached,true);
 assert.equal((await f.manifest()).outputHash,previous.outputHash);
 assert.deepEqual(await readFile(path.join(nextFolder,'main.jpg')),f.original);
});

test('a prepared cache hit stays unapplied if product or selection changes before reuse completion',async t=>{
 for(const mode of ['style','selection','selectionRoundTrip'])await t.test(mode,async t=>{
  const f=await fixture(t),request=await f.prepare();
  await f.stage(request);f.complete(request);
  const previous=await readFile(path.join(f.folder,'background-image.json'),'utf8');
  const cached=await f.prepare();
  assert.equal(cached.cached,true);assert.equal(cached.applied,false);
  assert.equal(await readFile(path.join(f.folder,'background-image.json'),'utf8'),previous);
  if(mode==='style')f.state.product.style='416971';
  else{
   f.workflow.select({style:f.state.product.style,key:'extra1'});
   if(mode==='selectionRoundTrip')f.workflow.select({style:f.state.product.style,key:'main'});
  }
  assert.throws(()=>f.workflow.complete({jobId:cached.jobId,reuse:true}),stale);
  assert.equal(await readFile(path.join(f.folder,'background-image.json'),'utf8'),previous);
  assert.equal(f.calls(),1);
 });
});

test('current product identity and stored official identity must still match at completion',async t=>{
 const changes={
  style:async f=>{f.state.product.style='416971';},
  sourceUrl:async f=>{f.state.product.sourceUrl='https://example.test/other';},
  selectedImageUrl:async f=>{f.state.product.images.main='different-main-source';},
  selectedImageExcluded:async f=>{f.state.product.images.main=null;},
  productInstance:async f=>{f.state.product={...f.state.product};},
  folder:async f=>{const next=path.join(f.root,'other');await f.seedFolder(next);f.state.folder=next;},
  revision:async f=>{f.state.revision++;},
  storedStyle:async f=>writeFile(path.join(f.folder,'product.json'),JSON.stringify({...f.state.product,style:'416971'})),
  storedSourceUrl:async f=>writeFile(path.join(f.folder,'product.json'),JSON.stringify({...f.state.product,sourceUrl:'https://example.test/other'}))
 };
 for(const [name,change] of Object.entries(changes))await t.test(name,async t=>{
  const f=await fixture(t),request=await f.prepare();await f.stage(request);
  await change(f);
  assert.throws(()=>f.complete(request),stale);
  await f.unapplied();
 });
});

test('changing selection away and back or invalidating a product round trip never revives a job',async t=>{
 for(const mode of ['selection','product'])await t.test(mode,async t=>{
  const f=await fixture(t),request=await f.prepare();await f.stage(request);
  if(mode==='selection'){
   f.workflow.select({style:f.state.product.style,key:'extra1'});
   f.workflow.select({style:f.state.product.style,key:'main'});
  }else{
   f.state.product.style='416971';f.workflow.invalidate();f.state.product.style='116926';
  }
  assert.throws(()=>f.complete(request),stale);
  await f.unapplied();
 });
});

test('changed source bytes, replaced selection file and edited preview cannot be applied',async t=>{
 for(const mode of ['source','selectionReplacement','preview'])await t.test(mode,async t=>{
  const f=await fixture(t),request=await f.prepare(),preview=await f.stage(request);
  if(mode==='source')await writeFile(path.join(f.folder,'main.jpg'),f.extra);
  if(mode==='selectionReplacement'){
   const target=path.join(f.folder,'background-selection.json');
   await writeFile(target+'.replacement',await readFile(target));
   await rename(target+'.replacement',target);
  }
  if(mode==='preview')await writeFile(preview.previewPath,f.extra);
  assert.throws(()=>f.complete(request),stale);
  await f.unapplied();
 });
});

test('busy and photo preparation block requests and invalidate completion, including a completed busy episode',async t=>{
 for(const mode of ['busy','photoPreparation','busyRoundTrip'])await t.test(mode,async t=>{
  const f=await fixture(t),request=await f.prepare();await f.stage(request);
  if(mode==='photoPreparation')f.state.photoPreparation={status:'preparing'};
  else f.state.busy=true;
  if(mode==='busyRoundTrip'){f.workflow.invalidate();f.state.busy=false;}
  assert.throws(()=>f.complete(request),stale);
  if(mode!=='busyRoundTrip')await assert.rejects(f.prepare(),/진행 중인 작업/);
  await f.unapplied();
 });
});

test('a restarted workflow cannot stage or complete an old server job',async t=>{
 const f=await fixture(t),request=await f.prepare();await f.stage(request);
 const restarted=createBackgroundWorkflow(f.options);
 await assert.rejects(restarted.stage({jobId:request.jobId,generatedPath:f.generatedPath}),stale);
 assert.throws(()=>restarted.complete({jobId:request.jobId,reviewed:true}),stale);
 await f.unapplied();
});

test('cache corruption and identity tampering cause cache misses without changing the applied main',async t=>{
 for(const mode of ['imageBytes','outputHash','sourceHash','reviewed','settings'])await t.test(mode,async t=>{
  const f=await fixture(t),request=await f.prepare();await f.stage(request);f.complete(request);
  const previous=await readFile(path.join(f.folder,'background-image.json'),'utf8');
  const manifestName=(await readdir(f.cacheRoot)).find(name=>name.endsWith('.json'));
  const manifestPath=path.join(f.cacheRoot,manifestName),entry=JSON.parse(await readFile(manifestPath,'utf8'));
  if(mode==='imageBytes')await writeFile(path.join(f.cacheRoot,entry.file),await sharp({create:{width:1500,height:1500,channels:3,background:'#426ba1'}}).jpeg().toBuffer());
  else{
   if(mode==='outputHash')entry.outputHash='0'.repeat(64);
   if(mode==='sourceHash')entry.sourceHash='0'.repeat(64);
   if(mode==='reviewed')entry.reviewed=false;
   if(mode==='settings')entry.settings.composition='unreviewed-recipe';
   await writeFile(manifestPath,JSON.stringify(entry));
  }
  const next=await f.prepare();
  assert.equal(next.cached,false);assert.ok(next.jobId);
  assert.equal(f.calls(),1);
  assert.equal(await readFile(path.join(f.folder,'background-image.json'),'utf8'),previous);
 });
});

test('review approval and a staged preview are required before completion',async t=>{
 const f=await fixture(t),request=await f.prepare();
 assert.throws(()=>f.workflow.complete({jobId:request.jobId,reuse:true}),/재사용할 검수 결과가 없습니다/);
 assert.throws(()=>f.complete(request),/시각 검수/);
 await f.stage(request);
 for(const reviewed of [false,undefined,'true',1])assert.throws(()=>f.workflow.complete({jobId:request.jobId,reviewed}),/시각 검수/);
 await f.unapplied();
 f.complete(request);
 assert.equal((await f.manifest()).reviewed,true);
});

test('duplicate stage is rejected while processing and after the preview is ready',async t=>{
 let release,entered;
 const blocked=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const f=await fixture(t,{compose:async()=>{entered();return blocked;}}),request=await f.prepare();
 const first=f.stage(request);await started;
 try{await assert.rejects(f.stage(request),/이미 준비 중이거나 검수 대기/);}
 finally{release(f.output);}
 await first;
 await assert.rejects(f.stage(request),/이미 준비 중이거나 검수 대기/);
 assert.equal(f.calls(),1);
 await f.unapplied();
});

test('quality retry keeps the source and start time, retains prior previews and applies only a newly reviewed attempt',async t=>{
 const outputs=await Promise.all(['#112233','#667788','#aabbcc'].map(background=>sharp({create:{width:1500,height:1500,channels:3,background}}).jpeg().toBuffer()));let index=0;
 const f=await fixture(t,{compose:async()=>outputs[index++]}),request=await f.prepare(),startedAt=f.workflow.status().startedAt;
 assert.equal(f.workflow.status().attempt,1);assert.equal(f.workflow.inspect({jobId:request.jobId}).maxAttempts,3);
 const first=await f.stage(request),priorBytes=await readFile(first.previewPath);
 const retried=f.workflow.retry({jobId:request.jobId,reason:'  오른쪽\n경계 밝기 차이\u0000 보완  '});
 assert.equal(retried.attempt,2);assert.equal(retried.maxAttempts,3);assert.equal(retried.reason,'오른쪽 경계 밝기 차이 보완');assert.equal(retried.previewPath,undefined);
 assert.equal(f.workflow.status().startedAt,startedAt);assert.equal(f.workflow.status().status,'generating');assert.match(f.workflow.status().message,/2\/3회.*경계 밝기/);
 assert.throws(()=>f.complete(request),/시각 검수/);await f.unapplied();assert.deepEqual(await readFile(first.previewPath),priorBytes);
 const second=await f.stage(request);assert.notEqual(second.previewPath,first.previewPath);assert.equal(second.attempt,2);
 assert.throws(()=>f.workflow.complete({jobId:request.jobId,reviewed:false}),/시각 검수/);
 for(const attempt of [undefined,1,3,'2',NaN])assert.throws(()=>f.workflow.complete({jobId:request.jobId,reviewed:true,attempt}),e=>e.code==='BACKGROUND_REVIEW_ATTEMPT_CHANGED');
 await f.unapplied();
 f.complete(request);const entry=await f.manifest();assert.equal(entry.outputHash,digest(outputs[1]));assert.notEqual(entry.outputHash,digest(outputs[0]));
 assert.equal(f.workflow.status().attempt,2);assert.equal(f.workflow.status().startedAt,startedAt);assert.deepEqual(await readFile(path.join(f.folder,'main.jpg')),f.original);assert.deepEqual(await readFile(first.previewPath),priorBytes);
});

test('quality retry allows at most three attempts and requires a bounded meaningful reason',async t=>{
 const f=await fixture(t),request=await f.prepare(),previews=[];await f.stage(request);
 for(const reason of [undefined,null,{},'', ' \n\u0000 '])assert.throws(()=>f.workflow.retry({jobId:request.jobId,reason}),/품질 문제/);
 assert.equal(f.workflow.status().attempt,1);
 previews.push(f.workflow.inspect({jobId:request.jobId}).previewPath);
 for(const attempt of [2,3]){
  const result=f.workflow.retry({jobId:request.jobId,reason:'색상과 경계 보완 '.repeat(100)});assert.equal(result.reason.length,160);assert.equal(result.attempt,attempt);assert.equal(result.maxAttempts,3);
  assert.throws(()=>f.workflow.retry({jobId:request.jobId,reason:'아직 새 결과 없음'}),/검수를 마친 뒤/);
  previews.push((await f.stage(request)).previewPath);
 }
 assert.equal(new Set(previews).size,3);for(const preview of previews)assert((await readFile(preview)).length);
 assert.throws(()=>f.workflow.retry({jobId:request.jobId,reason:'바닥 연결 부자연스러움'}),e=>e.code==='BACKGROUND_QUALITY_RETRY_LIMIT'&&/3회.*바닥 연결/.test(e.message));
 assert.equal(f.workflow.status().attempt,3);assert.equal(f.calls(),3);await f.unapplied();assert.deepEqual(await readFile(path.join(f.folder,'main.jpg')),f.original);
});

test('retry is unavailable before review, during composition and after original or job guards change',async t=>{
 const f=await fixture(t),request=await f.prepare();assert.throws(()=>f.workflow.retry({jobId:request.jobId,reason:'검수 전'}),/검수를 마친 뒤/);
 for(const mode of ['busy','source','selection','revision','cancelled','completed'])await t.test(mode,async sub=>{
  const f=await fixture(sub),request=await f.prepare();await f.stage(request);
  if(mode==='busy')f.state.busy=true;
  if(mode==='source')await writeFile(path.join(f.folder,'main.jpg'),f.extra);
  if(mode==='selection')f.workflow.select({style:f.state.product.style,key:'extra1'});
  if(mode==='revision')f.state.revision++;
  if(mode==='cancelled')f.workflow.cancel({requestId:f.workflow.status().requestId});
  if(mode==='completed')f.complete(request);
  assert.throws(()=>f.workflow.retry({jobId:request.jobId,reason:'경계 보완'}),stale);
 });
 let release;const blocked=await fixture(t,{compose:()=>new Promise(resolve=>{release=()=>resolve(blocked.output);})}),pending=await blocked.prepare(),staging=blocked.stage(pending);
 assert.throws(()=>blocked.workflow.retry({jobId:pending.jobId,reason:'합성 중'}),/검수를 마친 뒤/);await assert.rejects(blocked.stage(pending),/이미 준비 중/);release();await staging;
});

test('invalidating during asynchronous composition discards the result and preserves cancellation after stage and worker exit',async t=>{
 let release,entered;
 const blocked=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const f=await fixture(t,{compose:async()=>{entered();return blocked;}}),request=await f.prepare();
 const stage=f.stage(request);await started;
 f.workflow.invalidate();release(f.output);
 await assert.rejects(stage,stale);
 assert.equal(f.workflow.status().status,'cancelled');
 const cancelled=f.workflow.status();
 f.workflow.fail({jobId:request.jobId,message:'worker exited after cancellation'});
 assert.deepEqual(f.workflow.status(),cancelled);
 assert.equal((await readdir(f.folder)).some(name=>name.startsWith('background-preview-')),false);
 await f.unapplied();
});

test('cancellation before prepare, after stage and a newer request cannot resurrect stale work',async t=>{
 const f=await fixture(t);
 f.workflow.cancel({requestId:'request_cancelled_before'});
 await assert.rejects(f.prepare({requestId:'request_cancelled_before'}),stale);
 const cancelled=await f.prepare({requestId:'request_cancelled_after'});await f.stage(cancelled);
 f.workflow.cancel({requestId:'request_cancelled_after'});
 assert.throws(()=>f.complete(cancelled),stale);
 const older=await f.prepare();await f.stage(older);
 const newer=await f.prepare();
 assert.throws(()=>f.complete(older),stale);
 await f.stage(newer);f.complete(newer);
 assert.equal((await f.manifest()).reviewed,true);
});

test('dispatch returns the exact current source once and reports generation without applying anything',async t=>{
 const f=await fixture(t),request=await f.prepare();
 const dispatched=f.workflow.dispatch({jobId:request.jobId});
 assert.deepEqual(dispatched,f.workflow.inspect({jobId:request.jobId}));
 assert.equal(dispatched.sourcePath,path.join(f.folder,'main.jpg'));
 assert.equal(dispatched.sourceHash,digest(f.original));
 assert.equal(dispatched.style,f.state.product.style);
 assert.equal(dispatched.key,'main');
 assert.equal(f.workflow.status().status,'generating');
 assert.throws(()=>f.workflow.dispatch({jobId:request.jobId}),/이미 진행 중이거나 재사용/);
 assert.equal(f.calls(),0);
 await f.unapplied();
});

test('invalidation callbacks identify the displaced worker for explicit invalidation, cancellation and replacement',async t=>{
 for(const mode of ['invalidate','cancel','replacement'])await t.test(mode,async t=>{
  const invalidated=[];
  const f=await fixture(t,{onInvalidate:event=>invalidated.push(event)});
  const request=await f.prepare({requestId:'request_worker_callback'});
  f.workflow.dispatch({jobId:request.jobId});
  assert.deepEqual(invalidated,[]);
  if(mode==='invalidate')f.workflow.invalidate();
  if(mode==='cancel')f.workflow.cancel({requestId:'request_worker_callback'});
  if(mode==='replacement')await f.prepare();
  assert.deepEqual(invalidated,[{jobId:request.jobId}]);
  assert.throws(()=>f.workflow.inspect({jobId:request.jobId}),stale);
  await f.unapplied();
 });
});

test('a late old-worker failure leaves the new request intact while its own failure terminates it',async t=>{
 const f=await fixture(t),older=await f.prepare();
 f.workflow.dispatch({jobId:older.jobId});
 const newer=await f.prepare();
 f.workflow.dispatch({jobId:newer.jobId});
 const before=f.workflow.status();
 f.workflow.fail({jobId:older.jobId,message:'late old worker exit'});
 assert.deepEqual(f.workflow.status(),before);
 assert.equal(f.workflow.inspect({jobId:newer.jobId}).jobId,newer.jobId);
 f.workflow.fail({jobId:newer.jobId,message:'current worker failed'});
 assert.equal(f.workflow.status().status,'error');
 assert.equal(f.workflow.status().message,'current worker failed');
 assert.throws(()=>f.workflow.inspect({jobId:newer.jobId}),stale);
 assert.throws(()=>f.complete(newer),stale);
 await f.unapplied();
});

test('a worker exit reported after successful completion cannot replace success or the applied image',async t=>{
 const f=await fixture(t),request=await f.prepare();
 f.workflow.dispatch({jobId:request.jobId});
 await f.stage(request);f.complete(request);
 const completed=f.workflow.status(),manifest=await readFile(path.join(f.folder,'background-image.json'),'utf8');
 f.workflow.fail({jobId:request.jobId,message:'worker exited after apply'});
 assert.equal(f.workflow.status().status,'complete');
 assert.deepEqual(f.workflow.status(),completed);
 assert.equal(await readFile(path.join(f.folder,'background-image.json'),'utf8'),manifest);
});
