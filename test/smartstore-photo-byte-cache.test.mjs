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
