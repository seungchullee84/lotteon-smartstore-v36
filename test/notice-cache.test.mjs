import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {analyzeNoticeCached} from '../notice-cache.mjs';
test('고시 이미지 내용이 같을 때만 OCR·아이콘을 재사용하고 변경·중단은 재사용하지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'notice-cache-'));try{
  const cacheRoot=path.join(root,'cache'),one=path.join(root,'one'),two=path.join(root,'two');await mkdir(one);await mkdir(two);
  await writeFile(path.join(one,'info.jpg'),'same-official-image');await writeFile(path.join(two,'info.jpg'),'same-official-image');
  let calls=0;const analyze=async file=>{calls++;await writeFile(path.join(path.dirname(file),'wash-icon-1.png'),'verified-icon');return {ocrText:'상품고시',material:'면100%',washingIcons:[{key:'wash-icon-1'}]};};
  const first=await analyzeNoticeCached(path.join(one,'info.jpg'),{cacheRoot,analyze});
  assert.deepEqual(await analyzeNoticeCached(path.join(two,'info.jpg'),{cacheRoot,analyze}),first);assert.equal(calls,1);
  assert.equal(await readFile(path.join(two,'wash-icon-1.png'),'utf8'),'verified-icon');
  await writeFile(path.join(two,'info.jpg'),'changed-official-image');await analyzeNoticeCached(path.join(two,'info.jpg'),{cacheRoot,analyze});assert.equal(calls,2);
  const controller=new AbortController();controller.abort();await assert.rejects(analyzeNoticeCached(path.join(two,'info.jpg'),{cacheRoot,analyze,signal:controller.signal}));assert.equal(calls,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('스마트스토어 소재 OCR은 기존 고시 캐시와 분리하고 설치 실패 후 다시 시도한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'notice-material-cache-'));
 try{
  const file=path.join(root,'info.jpg'),cacheRoot=path.join(root,'cache');
  await writeFile(file,'same official image');
  const analyze=async(_file,_log,_signal,{recognizeMaterial})=>{
   if(!recognizeMaterial)return {ocrText:'기존 고시 OCR'};
   return await recognizeMaterial();
  };
  const legacy=await analyzeNoticeCached(file,{cacheRoot,analyze});
  const failure={ocrText:'기존 고시 OCR',rapidMaterialUnavailable:true};
  const failed=await analyzeNoticeCached(file,{cacheRoot,analyze,recognizeMaterial:async()=>failure});
  assert.deepEqual(failed,failure);
  const success={ocrText:'고시 OCR',material:'면 100%',rapidMaterialOCR:'면100%'};
  const fresh=await analyzeNoticeCached(file,{cacheRoot,analyze,recognizeMaterial:async()=>success});
  assert.deepEqual(fresh,success);
  const cached=await analyzeNoticeCached(file,{cacheRoot,analyze,recognizeMaterial:async()=>assert.fail('cached')});
  assert.deepEqual(cached,success);
  assert.deepEqual(await analyzeNoticeCached(file,{cacheRoot,analyze}),legacy);
 }finally{await rm(root,{recursive:true,force:true});}
});
