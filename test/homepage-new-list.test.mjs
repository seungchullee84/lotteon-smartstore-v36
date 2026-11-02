import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';import {checkNewListing,parseNewListing} from '../homepage-new-list.mjs';
const card=(id,name)=>`<div class="box"><a href="https://www.giordano.co.kr/shop/detail.php?pno=${id}"><img src="ignored.jpg"></a><div class="name">${name}</div></div>`;
test('failed checks back off, preserve last success, and manual recovery performs a real check',async()=>{
 const {startNewListingMonitor,retryDelay}=await import('../homepage-new-list.mjs');
 const root=await mkdtemp('D:/new-list-test-');let calls=0,fail=false;
 const monitor=startNewListingMonitor(root,{check:async()=>{calls++;if(fail)throw Error('공식몰 목록 접근 제한');return {checkedAt:'2026-11-02T00:00:00Z',nextCheckAt:'2099-01-01T00:00:00Z'};}});
 try{await monitor.ready;const previous=monitor.state.website;fail=true;await monitor.refresh();assert.equal(calls,2);assert.equal(monitor.state.website,previous);assert.equal(monitor.state.consecutiveErrors,1);assert.match(monitor.state.message,/재확인 예정/);fail=false;await monitor.refresh();assert.equal(calls,3);assert.equal(monitor.state.lastError,null);assert.equal(monitor.state.consecutiveErrors,0);assert.match(monitor.state.message,/25분/);assert.deepEqual([1,2,3,4].map(retryDelay),[300000,600000,1200000,1500000]);}finally{monitor.stop();await rm(root,{recursive:true,force:true});}
});
test('baseline, new adult only, no duplicate; failures preserve checkpoint and never request detail/images',async()=>{
 const root=await mkdtemp('D:/new-list-test-'),file=path.join(root,'state.json');let html=card('a'.repeat(32),'남성 076930');let requests=[];
 const fetchImpl=async url=>{requests.push(String(url));assert.ok(String(url).includes('big_section.php'));return new Response(html);};
 try{
  let s=await checkNewListing({file,fetchImpl});assert.equal(s.batches[0].events.length,0);
  html+=card('b'.repeat(32),'여성 375908')+card('c'.repeat(32),'주니어 123456');s=await checkNewListing({file,fetchImpl});assert.deepEqual(s.batches.at(-1).events.map(p=>p.style),['375908']);
  s=await checkNewListing({file,fetchImpl});assert.equal(s.batches.at(-1).events.length,0);const saved=await readFile(file,'utf8');html='<title>Request Rejected</title>';await assert.rejects(checkNewListing({file,fetchImpl}));assert.equal(await readFile(file,'utf8'),saved);assert.equal(requests.length,4);
 }finally{await rm(root,{recursive:true,force:true});}
});
