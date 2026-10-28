import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,utimes} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createReleaseTracker,formatReleaseDate} from '../app-release.mjs';

test('최종 수정일은 한국 시간과 요일로 표시',()=>{
 assert.equal(formatReleaseDate('2026-10-22T13:20:00Z'),'2026.10.22 (목) 22:20');
 assert.equal(formatReleaseDate('2026-10-22T15:00:00Z'),'2026.10.23 (금) 00:00');
});
test('소스 변경만 버전 증가, 재실행과 자동 버전 기록은 증가 제외',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'release-tracker-'));
 try{
  await writeFile(path.join(root,'package.json'),JSON.stringify({version:'0.38.0',name:'test'}));
  await mkdir(path.join(root,'public'));await mkdir(path.join(root,'data'));
  const source=path.join(root,'public','app.js');await writeFile(source,'first');
  const tracker=createReleaseTracker(root,{interval:0});
  const first=await tracker.get();assert.equal(first.version,39);
  assert.equal(JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,'0.39.0');
  assert.equal((await tracker.get()).version,39);
  await writeFile(path.join(root,'data','product.json'),'{}');
  for(const dir of ['runtime-browsers','node_modules-copied-backup','exports']){await mkdir(path.join(root,dir));await writeFile(path.join(root,dir,'generated.json'),'{"changed":true}');}
  assert.equal((await tracker.get()).version,39,'설치 런타임·의존성 백업·생성물은 코드 버전에서 제외');
  await utimes(source,new Date(),new Date());
  assert.equal((await tracker.get()).version,39);
  await writeFile(source,'second');
  const concurrent=await Promise.all([tracker.get(),tracker.get()]);
  assert.deepEqual(concurrent.map(x=>x.version),[40,40]);
  assert.equal((await tracker.get()).version,40);
  assert.equal((await createReleaseTracker(root,{interval:0}).get()).version,40);
  await writeFile(source,'changed while stopped');
  assert.equal((await createReleaseTracker(root,{interval:0}).get()).version,41);
 }finally{await rm(root,{recursive:true,force:true});}
});
