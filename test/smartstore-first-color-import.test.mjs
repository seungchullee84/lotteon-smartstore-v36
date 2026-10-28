import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {prepareSmartstoreWithColorRecovery,importSmartstoreColorPhotos} from '../smartstore-color-recovery.mjs';
import {prepareSmartstoreAuto} from '../smartstore-auto-prepare.mjs';
import {readIsolatedPhotoSource} from '../smartstore-photo-import.mjs';

async function fixture(style){
 const root=await mkdtemp(path.join(os.tmpdir(),'color-recovery-'));
 const folder=path.join(root,'collected'),dataRoot=path.join(root,'data'),desktop=path.join(root,'desktop'),photos=path.join(desktop,'상품등록기사진폴더',style);
 await mkdir(folder,{recursive:true});await mkdir(photos,{recursive:true});
 const product={style,sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+style,rawName:'여성 경량 상의',name:'여성 경량 상의 '+style,colors:['01크림','02블랙'],images:{}};
 await writeFile(path.join(folder,'smartstore-official.html'),'<body>STYLE. 05'+style+'<div class="prd_detail_content_gio">가볍고 편안하게 입는 상의입니다.</div></body>');
 const bytes=await Promise.all(['#bcbcbc','#dfdfdf','#191919','#242424'].map(background=>sharp({create:{width:360,height:480,channels:3,background}}).jpeg().toBuffer()));
 for(const [i,b]of bytes.entries())await writeFile(path.join(photos,i===0?'1.jpg':'20261028_00'+i+'.jpg'),b);
 const source={...product,sellerCode:style+' 상의',candidates:bytes.map((_,i)=>({url:'https://shop-phinf.pstatic.net/'+i+'.jpg',colorHint:product.colors[Math.floor(i/2)]}))};
 const options={dataRoot,desktop,apiKey:'',recognizePhoto:async()=>'',fetchImpl:async url=>{assert.equal(new URL(url).hostname,'shop-phinf.pstatic.net');return new Response(bytes[Number(new URL(url).pathname.slice(1,-4))],{headers:{'Content-Type':'image/jpeg'}});}};
 return {root,folder,product,source,options,bytes,photos};
}

for(const style of ['326921','376911'])test('첫 수집: 기록 없는 숫자 파일명을 기존 상품 색상 구간으로 연결하고 재수집에 재사용 · '+style,async()=>{
 const f=await fixture(style);try{
  await assert.rejects(access(path.join(f.options.dataRoot,'smartstore-details',style,'draft.json')));
  await assert.rejects(access(path.join(f.options.dataRoot,'smartstore-photo-mappings',style+'.json')));
  let reads=0,recoveries=0,completed=0;
  const options={...f.options,readSource:async(p,sourceOptions)=>{assert.equal(sourceOptions.isolated,true);reads++;return f.source;},onRecovery:p=>{recoveries++;assert.equal(p.smartstoreDetail.pendingPhotoCount,4);},onImported:()=>completed++};
  const prepared=await prepareSmartstoreWithColorRecovery(f.product,f.folder,options);
  assert.equal(prepared.smartstoreDetail.pendingPhotoCount,0);
  assert.equal(prepared.smartstoreDetail.photoCount,4);
  const digest=b=>createHash('sha256').update(b).digest('hex');
  for(const [i,color]of f.product.colors.entries())assert.deepEqual(prepared.smartstoreDetail.storeColorPhotoHashes[color],f.bytes.slice(i*2,i*2+2).map(digest));
  assert.deepEqual(await readFile(path.join(f.photos,'1.jpg')),f.bytes[0]);
  const again=await prepareSmartstoreWithColorRecovery(f.product,f.folder,{...options,readSource:()=>assert.fail('연결 완료 품번은 다시 가져오지 않아야 함')});
  assert.deepEqual(again.smartstoreDetail.storeColorPhotoHashes,prepared.smartstoreDetail.storeColorPhotoHashes);
  assert.deepEqual([reads,recoveries,completed],[1,1,1]);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('로그인 실패·틀린 품번·틀린 공식 출처·중단을 성공으로 처리하거나 사진에 적용하지 않는다',async()=>{
 const f=await fixture('326922');try{
  for(const source of [{...f.source,style:'376911'},{...f.source,sourceUrl:f.source.sourceUrl+'x'},{...f.source,sellerCode:'376911'}]){
   await assert.rejects(importSmartstoreColorPhotos(f.product,f.folder,{...f.options,readSource:async()=>source,fetchImpl:()=>assert.fail('출처가 틀리면 다운로드 전 중단')}));
  }
  let completed=0;
  await assert.rejects(prepareSmartstoreWithColorRecovery(f.product,f.folder,{...f.options,readSource:async()=>{throw Error('로그인 확인 필요');},onImported:()=>completed++}),/로그인 확인 필요/);
  const controller=new AbortController();
  await assert.rejects(prepareSmartstoreWithColorRecovery(f.product,f.folder,{...f.options,signal:controller.signal,readSource:async()=>{controller.abort();return f.source;},onImported:()=>completed++}),{name:'AbortError'});
  assert.equal(completed,0);assert.deepEqual(await readFile(path.join(f.photos,'1.jpg')),f.bytes[0]);
  const cache=JSON.parse(await readFile(path.join(f.options.dataRoot,'smartstore-photo-mappings',f.product.style+'.json'),'utf8'));
  assert.deepEqual(cache.files,[],'실패한 가져오기에서 색상 연결이 만들어지지 않아야 함');
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('색상 사진의 원본·순서 검증이 실패하면 완료 콜백을 실행하지 않는다',async()=>{
 const f=await fixture('326923');try{
  let prepares=0,completed=0;
  const prepare=async(...args)=>{const result=await prepareSmartstoreAuto(...args);if(++prepares===2)result.smartstoreDetail.storeColorPhotoHashes['01크림'].reverse();return result;};
  await assert.rejects(prepareSmartstoreWithColorRecovery(f.product,f.folder,{...f.options,prepare,readSource:async()=>f.source,onImported:()=>completed++}),/원본·순서/);
  assert.equal(completed,0);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('연속 품번 자동 가져오기는 기존 편집기에 접근하지 않고 별도 읽기 창을 성공·실패·중단 모두 정리한다',async()=>{
 for(const outcome of ['success','failure','abort']){
  let closed=0,read=0;const controller=new AbortController();
  const isolated={close:async()=>closed++};
  const context={pages:()=>assert.fail('사용자 편집기 탐색 금지'),storageState:async()=>({cookies:[{domain:'.naver.com',name:'session',value:'test-only'},{domain:'other.test',name:'unrelated',value:'excluded'}],origins:[{origin:'https://sell.smartstore.naver.com',localStorage:[]},{origin:'https://other.test',localStorage:[]}]}),browser:()=>({newContext:async({storageState})=>{assert.equal(storageState.cookies.length,1);assert.equal(storageState.origins.length,1);return isolated;}})};
  const product={style:'376911'},options={check:()=>controller.signal.throwIfAborted(),readSource:async(ctx,p)=>{read++;assert.equal(ctx,isolated);assert.equal(p,product);if(outcome==='failure')throw Error('읽기 실패');if(outcome==='abort')controller.abort();return {style:p.style};}};
  if(outcome==='success')assert.deepEqual(await readIsolatedPhotoSource(context,product,options),{style:'376911'});
  else await assert.rejects(readIsolatedPhotoSource(context,product,options),outcome==='failure'?/읽기 실패/:{name:'AbortError'});
  assert.equal(read,1);assert.equal(closed,1);
 }
});

test('닫힌 읽기 창은 한 번만 재시도하고 사용자 중단·끊긴 브라우저는 재시도하지 않는다',async()=>{
 for(const mode of ['recover','closed','abort','disconnected']){
  let created=0,closed=0,read=0;const controller=new AbortController();
  const context={storageState:async()=>({cookies:[],origins:[]}),browser:()=>({isConnected:()=>mode!=='disconnected',newContext:async()=>{created++;return {close:async()=>closed++};}})};
  const options={check:()=>controller.signal.throwIfAborted(),readSource:async()=>{read++;if(mode==='recover'&&read===2)return {style:'056933'};if(mode==='abort')controller.abort();throw Error('locator.waitFor: Target page, context or browser has been closed');}};
  if(mode==='recover')assert.deepEqual(await readIsolatedPhotoSource(context,{style:'056933'},options),{style:'056933'});
  else await assert.rejects(readIsolatedPhotoSource(context,{style:'056933'},options),mode==='abort'?{name:'AbortError'}:/크롬 연결이 닫혔습니다/);
  assert.equal(created,mode==='recover'||mode==='closed'?2:1);assert.equal(closed,created);
 }
});
