import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {analyzeNotice} from '../notice.mjs';
test('고시 OCR 준비와 인식이 멈춰도 중단 요청은 즉시 완료된다',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'notice-cancel-'));try{
  const file=path.join(dir,'info.png');await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toFile(file);
  for(const step of ['initialization','recognition']){
   const controller=new AbortController();let started;const ready=new Promise(r=>started=r);let terminated=0,resolveWorker;
   const worker={recognize:()=>{started();return new Promise(()=>{});},terminate:async()=>{terminated++;}};
   const createWorker=()=>step==='initialization'?(started(),new Promise(r=>resolveWorker=r)):Promise.resolve(worker);
   const job=analyzeNotice(file,()=>{},controller.signal,{createWorker});await ready;controller.abort();
   await assert.rejects(Promise.race([job,new Promise((_,reject)=>setTimeout(()=>reject(Error('중단 시간 초과')),1000))]),{name:'AbortError'});
   if(step==='initialization'){resolveWorker(worker);await new Promise(r=>setTimeout(r,10));}
   assert.ok(terminated>0);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
