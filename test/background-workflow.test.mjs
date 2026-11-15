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

async function fixture(t,{compose,realCompose=false}={}){
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
 const options={getState:()=>state,cacheRoot,compose:composeImpl};
 const workflow=createBackgroundWorkflow(options);
 const prepare=(overrides={})=>workflow.prepare({style:state.product.style,key:'main',sourceUrl:state.product.sourceUrl,revision:state.revision,requestId:'request_'+String(++sequence).padStart(8,'0'),...overrides});
 const stage=request=>workflow.stage({jobId:request.jobId,generatedPath});
 const complete=request=>workflow.complete({jobId:request.jobId,reviewed:true});
 const manifest=()=>readFile(path.join(state.folder,'background-image.json'),'utf8').then(JSON.parse);
 const unapplied=()=>assert.rejects(readFile(path.join(state.folder,'background-image.json')),{code:'ENOENT'});
 return {root,folder,cacheRoot,generatedPath,original,extra,output,state,workflow,options,prepare,stage,complete,manifest,unapplied,seedFolder,calls:()=>calls};
}

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

test('invalidating during asynchronous composition discards the result before preview or manifest writes',async t=>{
 let release,entered;
 const blocked=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const f=await fixture(t,{compose:async()=>{entered();return blocked;}}),request=await f.prepare();
 const stage=f.stage(request);await started;
 f.workflow.invalidate();release(f.output);
 await assert.rejects(stage,stale);
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
