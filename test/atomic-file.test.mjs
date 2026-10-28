import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {atomicWrite} from '../atomic-file.mjs';

test('overlapping checkpoints finish in order without competing for a temporary file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'benefit-checkpoint-'));
 try{
  const file=path.join(dir,'progress.json');
  await Promise.all(Array.from({length:100},(_,done)=>atomicWrite(file,JSON.stringify({done,padding:'x'.repeat(10000)}))));
  assert.equal(JSON.parse(await readFile(file,'utf8')).done,99);
  assert.deepEqual(await readdir(dir),['progress.json']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
