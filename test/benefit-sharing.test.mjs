import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {shareableBenefit,exportBenefitSnapshot,restoreBenefitSnapshot,preferBenefit} from '../benefit-sharing.mjs';
import {startBenefitWorker} from '../benefit-research.mjs';
import {catalogImageSource,runCatalog} from '../official-benefit-catalog.mjs';
import {createReleaseTracker} from '../app-release.mjs';
const id='a'.repeat(32),other='b'.repeat(32),hash='c'.repeat(64);
const source='부드러운 원단으로 편안한 착용감을 제공합니다.';
const record=(extra={})=>({rule:'adult-official-benefits-1',style:'123456',rawName:'여성 니트',gender:'여성',sourceCategory:['WOMEN','TOP'],sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+id,detailUrl:'https://www.giordano.co.kr/123456.jpg',detailHash:hash,imageScanComplete:true,imageText:source,pageText:source,observedAt:'2026-10-27T05:00:00Z',analyzedAt:'2026-10-27T06:00:00Z',...extra});
async function seed(dir,records){await mkdir(path.join(dir,'by-source'),{recursive:true});for(const r of records){const pno=new URL(r.sourceUrl).searchParams.get('pno');await writeFile(path.join(dir,'by-source',pno+'.json'),JSON.stringify(r));}await writeFile(path.join(dir,'queue.json'),JSON.stringify(records.map(r=>({pno:new URL(r.sourceUrl).searchParams.get('pno'),sourceUrl:r.sourceUrl,categories:['여성 ALL']}))));}

test('공식 성인 자료만 공유하며 로그인·컴퓨터 경로·영상·주니어를 제외',()=>{
 const safe=shareableBenefit(record({folder:'C:\\Users\\private\\data',password:'private',token:'private',naverCredentials:{clientSecret:'private'}}));
 assert(safe);assert.doesNotMatch(JSON.stringify(safe),/private|folder|password|token|clientSecret/);assert.equal(safe.visualReview,false);
 for(const r of [record({rawName:'주니어 패딩'}),record({sourceCategory:['KIDS']}),record({sourceUrl:'https://example.com/?pno='+id}),record({detailHash:null,imageText:'근거 없는 OCR'})]){
  const value=shareableBenefit(r);if(value)assert.equal(value.imageScanComplete,false);else assert.equal(value,null);
 }
 assert.throws(()=>shareableBenefit(record({imageText:'sk-'+'a'.repeat(40)})),/비공개 정보/);
});

test('다른 컴퓨터에서 원본 파일 없이 결과·큐를 복원하고 같은 상품 해시로 등록기에 적용',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'benefit-other-pc-'));try{
  const a=path.join(root,'computer-a'),b=path.join(root,'computer-b','official-benefit-catalog'),shared=path.join(root,'github');
  await seed(a,[record({folder:'C:\\old-computer\\missing'}),record({style:'654321',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+other,imageScanComplete:false,imageText:''}),record({style:'111111',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+'d'.repeat(32),rawName:'주니어 니트',sourceCategory:['JUNIOR']})]);
  const snapshot=await exportBenefitSnapshot(a,shared);assert.equal(snapshot.sourceComplete,2);assert.equal(snapshot.queue.length,2);assert.equal(snapshot.imageComplete,1);
  assert.equal((await exportBenefitSnapshot(a,shared)).changedFiles,0,'변경 없는 체크포인트는 재업로드하지 않는다');
  const restored=await restoreBenefitSnapshot(shared,b);assert.equal(restored.complete,1);assert.equal(restored.total,2);
  const local=JSON.parse(await readFile(path.join(b,'by-source',id+'.json'),'utf8'));assert.equal(local.folder,path.join(b,'sources',id));assert.equal(local.restoredFromSnapshot,true);
  await assert.rejects(access(path.join(local.folder,'detail.jpg')));
  const applied=await catalogImageSource(record(),hash,{dataRoot:rootForCatalog(b)});assert(applied);assert.equal(applied.imageText,source);
  assert.equal(await catalogImageSource(record(),'different',{dataRoot:rootForCatalog(b)}),null);
  const queue=JSON.parse(await readFile(path.join(b,'queue.json'),'utf8'));assert.equal(queue.length,2);
 }finally{await rm(root,{recursive:true,force:true});}
});

function rootForCatalog(dir){return path.dirname(dir);}

test('이미 완료된 기록은 오래된 미완료 공유본으로 되돌리지 않으며 바뀐 원본은 다시 확인',()=>{
 const complete=shareableBenefit(record());const pending=shareableBenefit(record({imageScanComplete:false,imageText:'',analyzedAt:null}));
 assert.equal(preferBenefit(complete,pending),complete);
 const changed=shareableBenefit(record({detailHash:'e'.repeat(64),imageScanComplete:false,imageText:'',observedAt:'2026-10-28T00:00:00Z'}));assert.equal(preferBenefit(complete,changed),changed);
});

test('동일 컴퓨터의 살아 있는 분석 작업을 중복 실행하지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'benefit-worker-'));try{
  const storage={runtimeDir:root,catalogDir:root,sharedDir:root};let launched=0;
  const spawnImpl=()=>{launched++;const child=new EventEmitter();child.pid=12345;child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  const options={spawnImpl,alive:async info=>info?.pid===12345};
  assert.equal((await startBenefitWorker(root,storage,options)).reused,false);
  assert.equal((await startBenefitWorker(root,storage,options)).reused,true);assert.equal(launched,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('공유 체크포인트 갱신은 프로그램 버전을 올리지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'benefit-release-'));try{
  await writeFile(path.join(root,'package.json'),JSON.stringify({version:'0.1.0'}));await writeFile(path.join(root,'server.mjs'),'// app');const tracker=createReleaseTracker(root,{interval:0});const first=await tracker.get();
  await mkdir(path.join(root,'research','official-benefits'),{recursive:true});await writeFile(path.join(root,'research','official-benefits','manifest.json'),'{}');assert.equal((await tracker.get()).version,first.version);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('복원된 완료 기록은 다른 PC의 원본 폴더가 없어도 네트워크·OCR 재실행 없이 재개',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'benefit-resume-'));try{
  const a=path.join(root,'a'),shared=path.join(root,'github'),dataRoot=path.join(root,'b'),catalogDir=path.join(dataRoot,'official-benefit-catalog');
  await seed(a,[record({folder:'C:\\absent-original'})]);await exportBenefitSnapshot(a,shared);await restoreBenefitSnapshot(shared,catalogDir);
  const result=await runCatalog({dataRoot,catalogDir,resume:true,imageWorkers:1});assert.equal(result.sourceComplete,1);assert.equal(result.imageComplete,1);assert.equal(result.errors.length,0);
  await assert.rejects(access(path.join(catalogDir,'sources',id,'detail.jpg')));
 }finally{await rm(root,{recursive:true,force:true});}
});
