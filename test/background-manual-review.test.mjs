import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createBackgroundWorkflow} from '../background-workflow.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pictures=Promise.all(['#224466','#6688aa','#aabbcc'].map(background=>sharp({create:{width:1500,height:1500,channels:3,background}}).jpeg().toBuffer()));
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'manual-review-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'product'),cacheRoot=path.join(root,'cache'),source=await sharp({create:{width:80,height:120,channels:3,background:'#445566'}}).jpeg().toBuffer(),outputs=await pictures;
 await mkdir(folder);const product={style:'416971',sourceUrl:'https://example.test/416971',images:{main:'main-source',extra1:'extra-source',extra2:'other-source'}};
 for(const key of ['main','extra1','extra2'])await writeFile(path.join(folder,key+'.jpg'),source);
 await writeFile(path.join(folder,'product.json'),JSON.stringify(product));await writeFile(path.join(folder,'background-selection.json'),JSON.stringify({style:product.style,key:'extra1'}));
 const generatedPath=path.join(root,'generated.jpg');await writeFile(generatedPath,outputs[0]);
 const state={folder,product,busy:false,revision:1};let count=0;
 const options={getState:()=>state,cacheRoot,compose:async()=>outputs[count++%3]},workflow=createBackgroundWorkflow(options);
 const prepared=await workflow.prepare({style:product.style,key:'extra1',sourceUrl:product.sourceUrl,revision:1,requestId:'request_manual_fixture'}),jobId=prepared.jobId;
 const stage=()=>workflow.stage({jobId,generatedPath});
 const fail=()=>workflow.fail({jobId,message:'경계 품질을 확인해 주세요.'});
 const reviewFile=path.join(folder,'background-review.json');
 const two=async()=>{for(let n=1;n<=2;n++){await stage();if(n<2)workflow.retry({jobId,reason:n+'회차 경계 보완'});}fail();};
 const unapplied=()=>assert.rejects(readFile(path.join(folder,'background-image.json')),{code:'ENOENT'});
 return {root,folder,cacheRoot,source,outputs,state,options,workflow,jobId,stage,fail,two,reviewFile,unapplied};
}

test('failed attempts remain viewable with reasons; explicit approval applies the selected extra-source attempt only to main without automatic cache',async t=>{
 const f=await fixture(t);await f.two();const view=f.workflow.status();assert.equal(view.status,'error');assert.equal(view.manualAvailable,true);assert.deepEqual(view.previews.map(p=>p.attempt),[1,2]);assert(view.previews.every(p=>p.url.startsWith('/api/background-preview?')&&p.reason));
 for(let attempt=1;attempt<=2;attempt++)assert.deepEqual(f.workflow.preview({jobId:f.jobId,attempt}),f.outputs[attempt-1]);
 await f.unapplied();
 for(const userApproved of [undefined,false,'true',1])assert.throws(()=>f.workflow.manualApply({jobId:f.jobId,attempt:1,userApproved}),/승인/);
 const result=f.workflow.manualApply({jobId:f.jobId,attempt:1,userApproved:true}),entry=JSON.parse(await readFile(path.join(f.folder,'background-image.json')));
 assert.equal(result.manual,true);assert.equal(result.selectedAttempt,1);assert.equal(entry.outputHash,hash(f.outputs[0]));assert.equal(entry.sourceKey,'extra1');assert.equal(entry.reviewer,'user');assert.equal(entry.cacheKey,undefined);
 assert.equal(f.workflow.status().attempt,1);assert.equal(f.workflow.status().selectedAttempt,1);await assert.rejects(readdir(f.cacheRoot),{code:'ENOENT'});
 for(const key of ['main','extra1','extra2'])assert.deepEqual(await readFile(path.join(f.folder,key+'.jpg')),f.source);
});

test('restart restores manual-only history, accepts old recipe previews, and never resurrects automatic completion or failure',async t=>{
 const f=await fixture(t);await f.two();const saved=JSON.parse(await readFile(f.reviewFile));saved.previews[1].recipe='old-preserved-recipe-v2';await writeFile(f.reviewFile,JSON.stringify(saved));
 const restored=createBackgroundWorkflow(f.options);assert.deepEqual(restored.restoreReview(),{ok:true,restored:true,jobId:f.jobId});assert.equal(restored.status().manualAvailable,true);
 assert.throws(()=>restored.inspect({jobId:f.jobId}),/변경/);assert.throws(()=>restored.complete({jobId:f.jobId,attempt:3,reviewed:true}),/변경/);
 const before=restored.status();restored.fail({jobId:f.jobId,message:'late old worker failure'});assert.deepEqual(restored.status(),before);
 restored.manualApply({jobId:f.jobId,attempt:2,userApproved:true});const entry=JSON.parse(await readFile(path.join(f.folder,'background-image.json')));assert.equal(entry.outputHash,hash(f.outputs[1]));assert.equal(entry.settings.composition,'old-preserved-recipe-v2');await assert.rejects(readdir(f.cacheRoot),{code:'ENOENT'});
});

test('selection and product round trips remain permanently view-only after restart',async t=>{
 for(const mode of ['selection','product','new-request','cancel'])await t.test(mode,async sub=>{
  const f=await fixture(sub);await f.stage();f.fail();
  if(mode==='selection'){f.workflow.select({style:'416971',key:'extra2'});f.workflow.select({style:'416971',key:'extra1'});}
  if(mode==='product'){f.workflow.invalidate('다른 상품 선택');f.state.product.style='416972';f.state.product.style='416971';}
  if(mode==='new-request')await f.workflow.prepare({style:'416971',key:'extra1',requestId:'request_replacement'});
  if(mode==='cancel')f.workflow.cancel({requestId:'request_manual_fixture'});
  assert.equal(JSON.parse(await readFile(f.reviewFile)).allowed,false);
  const restored=createBackgroundWorkflow(f.options);assert.equal(restored.restoreReview().restored,true);assert.equal(restored.status().manualAvailable,false);assert.match(restored.status().manualUnavailableReason,/미리보기만/);
  assert.deepEqual(restored.preview({jobId:f.jobId,attempt:1}),f.outputs[0]);assert.throws(()=>restored.manualApply({jobId:f.jobId,attempt:1,userApproved:true}),/변경/);await f.unapplied();
 });
});

test('selection mismatch is viewable but disables approval persistently, including legacy allowed:false records',async t=>{
 for(const allowed of [true,false])await t.test(String(allowed),async sub=>{
  const f=await fixture(sub);await f.stage();f.fail();const record=JSON.parse(await readFile(f.reviewFile));record.allowed=allowed;await writeFile(f.reviewFile,JSON.stringify(record));
  await writeFile(path.join(f.folder,'background-selection.json'),JSON.stringify({style:'416971',key:'extra2'}));
  const restored=createBackgroundWorkflow(f.options);assert.equal(restored.restoreReview().restored,true);assert.equal(restored.status().manualAvailable,false);assert.deepEqual(restored.preview({jobId:f.jobId,attempt:1}),f.outputs[0]);assert.equal(JSON.parse(await readFile(f.reviewFile)).allowed,false);await f.unapplied();
 });
});

test('cancelling an active staged preview persists view-only history across restart',async t=>{
 const f=await fixture(t);await f.stage();assert.equal(JSON.parse(await readFile(f.reviewFile)).allowed,true);
 f.workflow.cancel({requestId:'request_manual_fixture'});assert.equal(JSON.parse(await readFile(f.reviewFile)).allowed,false);
 const restored=createBackgroundWorkflow(f.options);assert.equal(restored.restoreReview().restored,true);assert.equal(restored.status().manualAvailable,false);
 assert.deepEqual(restored.preview({jobId:f.jobId,attempt:1}),f.outputs[0]);
 assert.throws(()=>restored.manualApply({jobId:f.jobId,attempt:1,userApproved:true}),/변경/);
 assert.throws(()=>restored.complete({jobId:f.jobId,attempt:1,reviewed:true}),/변경/);await f.unapplied();
});

test('manual pending approval binds the selected attempt, retires old worker events, and applies after idle',async t=>{
 const f=await fixture(t);await f.stage();f.workflow.retry({jobId:f.jobId,reason:'보완'});await f.stage();f.state.busy=true;
 const payload={jobId:f.jobId,attempt:1,userApproved:true},waiting=f.workflow.manualApply(payload);assert.equal(waiting.waiting,true);assert.equal(waiting.attempt,1);assert.equal(waiting.manual,true);assert.equal(f.workflow.status().attempt,1);assert.equal(f.workflow.status().status,'applying-wait');
 await f.unapplied();await assert.rejects(readdir(f.cacheRoot),{code:'ENOENT'});
 const pending=f.workflow.status();f.workflow.fail({jobId:f.jobId,message:'old worker exited'});assert.deepEqual(f.workflow.status(),pending);assert.throws(()=>f.workflow.complete({jobId:f.jobId,attempt:2,reviewed:true}),/변경/);
 f.state.busy=false;f.workflow.manualApply(payload);assert.equal(JSON.parse(await readFile(path.join(f.folder,'background-image.json'))).outputHash,hash(f.outputs[0]));
});

test('manual pending cannot apply after changed selection, and manual failure leaves historical images visible',async t=>{
 const f=await fixture(t);await f.stage();f.fail();f.state.busy=true;const payload={jobId:f.jobId,attempt:1,userApproved:true};assert.equal(f.workflow.manualApply(payload).waiting,true);
 f.state.busy=false;f.workflow.select({style:'416971',key:'extra2'});assert.throws(()=>f.workflow.manualApply(payload),/변경/);f.workflow.manualFail({jobId:f.jobId,message:'사진 선택이 바뀌었습니다.'});assert.equal(f.workflow.status().manualAvailable,false);assert.deepEqual(f.workflow.preview({jobId:f.jobId,attempt:1}),f.outputs[0]);await f.unapplied();
});

test('preview paths, hashes, attempts and current product/source identity remain guarded',async t=>{
 for(const mode of ['path','hash','style','source','wrong-attempt'])await t.test(mode,async sub=>{
  const f=await fixture(sub);await f.stage();f.fail();
  if(mode==='path'){const record=JSON.parse(await readFile(f.reviewFile));record.previews[0].file='../other.jpg';await writeFile(f.reviewFile,JSON.stringify(record));assert.equal(createBackgroundWorkflow(f.options).restoreReview().restored,false);return;}
  if(mode==='hash'){const record=JSON.parse(await readFile(f.reviewFile));await writeFile(path.join(f.folder,record.previews[0].file),f.outputs[1]);}
  if(mode==='style')f.state.product.style='416972';
  if(mode==='source')await writeFile(path.join(f.folder,'extra1.jpg'),f.outputs[1]);
  const attempt=mode==='wrong-attempt'?2:1;assert.throws(()=>f.workflow.preview({jobId:f.jobId,attempt}));assert.throws(()=>f.workflow.manualApply({jobId:f.jobId,attempt,userApproved:true}));await f.unapplied();
 });
});
