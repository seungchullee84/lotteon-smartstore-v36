import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';import {checkNewListing,parseNewListing} from '../homepage-new-list.mjs';
const card=(id,name)=>`<div class="box"><a href="https://www.giordano.co.kr/shop/detail.php?pno=${id}"><img src="ignored.jpg"></a><div class="name">${name}</div></div>`;
test('baseline, new adult only, no duplicate; failures preserve checkpoint and never request detail/images',async()=>{
 const root=await mkdtemp('D:/new-list-test-'),file=path.join(root,'state.json');let html=card('a'.repeat(32),'남성 076930');let requests=[];
 const fetchImpl=async url=>{requests.push(String(url));assert.ok(String(url).includes('big_section.php'));return new Response(html);};
 try{
  let s=await checkNewListing({file,fetchImpl});assert.equal(s.batches[0].events.length,0);
  html+=card('b'.repeat(32),'여성 375908')+card('c'.repeat(32),'주니어 123456');s=await checkNewListing({file,fetchImpl});assert.deepEqual(s.batches.at(-1).events.map(p=>p.style),['375908']);
  s=await checkNewListing({file,fetchImpl});assert.equal(s.batches.at(-1).events.length,0);const saved=await readFile(file,'utf8');html='<title>Request Rejected</title>';await assert.rejects(checkNewListing({file,fetchImpl}));assert.equal(await readFile(file,'utf8'),saved);assert.equal(requests.length,4);
 }finally{await rm(root,{recursive:true,force:true});}
});
