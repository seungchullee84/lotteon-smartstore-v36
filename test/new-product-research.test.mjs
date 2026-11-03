import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {appendNewProducts,resourcePause,startNewProductResearch} from '../new-product-research.mjs';
const start=Date.parse('2026-11-03T13:00:00Z');
const event=(id='a',extra={})=>({type:'new',id:id.repeat(32),style:'356955',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+id.repeat(32),name:'여성 니트',firstCheckedAt:new Date(start+1000).toISOString(),...extra});
const snapshot=events=>({batches:[{events}]});
const light=()=>({cpuPercent:20,freeBytes:8*1024**3,totalBytes:16*1024**3});
test('only newly observed adults after enabling enter queue, deduplicated across snapshots',()=>{
 const q={enabledAt:new Date(start).toISOString(),items:[]};
 const s=snapshot([event(),event('b',{type:'changed'}),event('c',{name:'주니어 니트'}),event('d',{firstCheckedAt:'2026-11-02T00:00:00Z'}),event('e',{sourceUrl:'https://example.com'})]);
 appendNewProducts(q,s);appendNewProducts(q,s);assert.deepEqual(q.items.map(x=>x.id),['a'.repeat(32)]);
});
test('foreground, CPU and memory gates never start a heavy job',()=>{
 assert.equal(resourcePause(light(),true),'상품등록·사진 작업 우선');
 assert.equal(resourcePause({...light(),cpuPercent:80},false),'CPU 사용량 높음');
 assert.equal(resourcePause({...light(),freeBytes:1e9},false),'메모리 여유 부족');
 assert.equal(resourcePause(light(),false),null);
});
test('missing D preserves queue, resumes serially, cooldown and restart do not duplicate completed work',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'new-product-'));let drive=false,busy=false,now=start,calls=0,active=0,maxActive=0;
 const options={clock:()=>now,storage:path.join(root,'artifacts'),storageReady:async()=>{if(!drive)throw Error('missing');},isBusy:()=>busy,sample:light,runWorker:async()=>{calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,10));active--;return {pointCount:3,metrics:{elapsedMs:10}};}};
 const runner=startNewProductResearch(root,options);
 try{
  await runner.ready;assert.equal(runner.state.status,'waiting-storage');
  await runner.observe(snapshot([event(),event('b')]));assert.equal(runner.state.queued,2);assert.equal(calls,0);
  drive=true;busy=true;await runner.tick();assert.equal(calls,0);busy=false;
  await Promise.all([runner.tick(),runner.tick()]);assert.equal(calls,1);assert.equal(maxActive,1);await runner.tick();assert.equal(calls,1);
  now+=61000;await runner.tick();assert.equal(calls,2);runner.stop();
  const resumed=startNewProductResearch(root,options);try{await resumed.ready;await resumed.observe(snapshot([event(),event('b')]));assert.equal(calls,2);assert.equal(resumed.state.completed,2);}finally{resumed.stop();}
 }finally{runner.stop();await rm(root,{recursive:true,force:true});}
});
test('paused foreground work is retriable, short evidence is review-needed, errors are not completed',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'new-product-pause-'));let now=start,runner,mode='pause';
 runner=startNewProductResearch(root,{clock:()=>now,storage:path.join(root,'artifacts'),storageReady:async()=>{},sample:light,runWorker:async(_root,_item,_storage,{signal})=>{
  if(mode==='pause'){runner.pause();throw signal.reason;}
  if(mode==='error')throw Error('OCR failed');return {pointCount:2};
 }});
 try{await runner.ready;await runner.observe(snapshot([event()]));let q=JSON.parse(await readFile(path.join(root,'data/new-product-research.json'),'utf8'));assert.equal(q.items[0].status,'queued');assert.equal(q.items[0].attempts,0);
  now+=301000;mode='error';await runner.tick();q=JSON.parse(await readFile(path.join(root,'data/new-product-research.json'),'utf8'));assert.equal(q.items[0].status,'queued');assert.equal(q.items[0].attempts,1);
  now+=301000;mode='short';await runner.tick();assert.equal(runner.state.completed,0);assert.equal(runner.state.needsReview,1);
 }finally{runner.stop();await rm(root,{recursive:true,force:true});}
});
