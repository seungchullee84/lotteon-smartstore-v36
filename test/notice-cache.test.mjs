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
