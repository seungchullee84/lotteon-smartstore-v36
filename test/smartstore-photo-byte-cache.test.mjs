import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,utimes} from 'node:fs/promises';
import path from 'node:path';
import {readPhotoBytes} from '../smartstore-photo-byte-cache.mjs';
test('unchanged photos reuse bytes; same-size replacements and deletion are detected',async()=>{
 const dir=await mkdtemp('D:/photo-cache-test-');const file=path.join(dir,'photo.jpg');
 try{
  await writeFile(file,'first');const first=await readPhotoBytes(file);
  assert.equal(await readPhotoBytes(file),first);
  await writeFile(file,'other');await utimes(file,new Date(),new Date(Date.now()+2000));
  const changed=await readPhotoBytes(file);assert.equal(changed.toString(),'other');assert.notEqual(changed,first);
  await rm(file);await assert.rejects(readPhotoBytes(file),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('concurrent reads of one large photo do not double-count or exhaust cache entries',async()=>{
 const dir=await mkdtemp('D:/photo-cache-concurrent-');const file=path.join(dir,'large.jpg');
 try{
  await writeFile(file,Buffer.alloc(8*1024*1024,7));
  const results=await Promise.allSettled(Array.from({length:8},()=>readPhotoBytes(file)));
  for(const result of results){assert.equal(result.status,'fulfilled',result.reason?.stack);assert.equal(result.value.length,8*1024*1024);}
  for(let i=0;i<5;i++){const next=path.join(dir,`other-${i}.jpg`);await writeFile(next,Buffer.alloc(12*1024*1024,i));assert.equal((await readPhotoBytes(next))[0],i);}
  assert.equal((await readPhotoBytes(file))[0],7);
 }finally{await rm(dir,{recursive:true,force:true});}
});
