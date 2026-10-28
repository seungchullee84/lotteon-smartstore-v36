import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {websiteCheckDue,BENEFIT_CHECK_INTERVAL,officialProductFingerprint,fetchOfficialDetailVersion,saveWebsiteCheck,changedOfficialProducts} from '../benefit-updates.mjs';
import {sharedWebsiteState} from '../benefit-sharing.mjs';
const id='a'.repeat(32),url='https://www.giordano.co.kr/shop/detail.php?pno='+id+'&ctype=1',hash='b'.repeat(64);
const item=(extra={})=>({style:'375908',rawName:'여성 경량 패딩 자켓',sourceUrl:url,pageHash:'c'.repeat(64),detailHash:hash,...extra});
test('상품정보만 바뀌면 제외하고 확인된 상세 추가만 변경으로 표시',()=>{
 assert.deepEqual(changedOfficialProducts({[id]:{pageHash:'c'.repeat(64),detailHash:hash}},[item({pageHash:'d'.repeat(64)})]),[]);
 assert.deepEqual(changedOfficialProducts({[id]:{pageHash:null,detailHash:null,detailPresent:false}},[item()])[0].changes,['공식 상세페이지 추가']);
});
test('20분 경과 시에만 다음 확인이 필요하다',()=>{const at=Date.parse('2026-10-27T11:00:00Z');assert.equal(BENEFIT_CHECK_INTERVAL,1200000);assert(websiteCheckDue(null,at));assert(!websiteCheckDue({checkedAt:new Date(at).toISOString()},at+1199999));assert(websiteCheckDue({checkedAt:new Date(at).toISOString()},at+1200000));});
test('상품 본문·옵션·상세주소 변화는 감지하고 비상품 필드는 무시한다',()=>{const p={style:'375908',rawName:'여성 패딩',sourceCategory:['WOMEN'],images:{detail:'a'},sizes:['S']};const first=officialProductFingerprint(p,'따뜻합니다');assert.notEqual(first,officialProductFingerprint(p,'가볍습니다'));assert.notEqual(first,officialProductFingerprint({...p,sizes:['S','M']},'따뜻합니다'));assert.equal(first,officialProductFingerprint({...p,folder:'C:/private'},'따뜻합니다'));});
test('같은 주소의 이미지도 조건부 요청으로 재확인하고 변경된 바이트의 해시를 갱신',async()=>{
 const previous={detailUrl:'https://www.giordano.co.kr/a.jpg',detailHash:hash,imageScanComplete:true,detailValidators:{etag:'"old"',lastModified:'Mon, 26 Oct 2026 00:00:00 GMT'}};let sent;
 const same=await fetchOfficialDetailVersion(previous.detailUrl,previous,async(u,h)=>{sent=h;return {status:304};});assert.equal(sent['If-None-Match'],'"old"');assert.equal(same.bytes,null);assert.equal(same.detailHash,hash);
 const changed=await fetchOfficialDetailVersion(previous.detailUrl,previous,async()=>({status:200,headers:{etag:'"new"'},bytes:Buffer.from('new-image')}));assert.notEqual(changed.detailHash,hash);assert.equal(changed.detailValidators.etag,'"new"');
 await assert.rejects(fetchOfficialDetailVersion(previous.detailUrl,{...previous,imageScanComplete:false},async()=>({status:304})),/検証|검증/);
});
test('최초 기준선은 알리지 않고 이후 신상품·본문·이미지 변경만 별도 배치로 기록',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'benefit-update-'));try{
  await writeFile(path.join(dir,'queue.json'),JSON.stringify([{pno:id,sourceUrl:url}]));
  const baseline=await saveWebsiteCheck(dir,[item()],{now:'2026-10-27T11:00:00Z'});assert.equal(baseline.batches[0].events.length,0);
  const next=[item({detailHash:'d'.repeat(64)}),item({style:'123456',sourceUrl:url.replace(id,'e'.repeat(32))})];
  const state=await saveWebsiteCheck(dir,next,{now:'2026-10-27T11:30:00Z'});assert.deepEqual(state.batches.at(-1).events.map(e=>e.type),['changed','new']);assert.deepEqual(state.batches.at(-1).events[0].changes,['공식 상세이미지 변경']);assert.equal(state.nextCheckAt,'2026-10-27T11:50:00.000Z');
  const same=await saveWebsiteCheck(dir,next,{now:'2026-10-27T12:00:00Z'});assert.equal(same.batches.at(-1).events.length,0);
  const publicState=sharedWebsiteState(state,next.map(r=>({...r,imageScanComplete:true,points:[{title:'따뜻함'}]})));assert.equal(publicState.batches.at(-1).events[0].status,'ready');assert.doesNotMatch(JSON.stringify(publicState),/folder|token|password/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('첫 확인에서 읽지 못한 기존 상품이 나중에 복구돼도 신상품으로 알리지 않는다',()=>{assert.deepEqual(changedOfficialProducts({[id]:{pageHash:null,detailHash:null}},[item()]),[]);});

test('소구점 분석·OCR 완료나 분석 결과 변경은 홈페이지 변경이 아니다',()=>{
 const old={[id]:{pageHash:'c'.repeat(64),detailHash:hash}};
 assert.deepEqual(changedOfficialProducts(old,[item({imageScanComplete:true,imageText:'새 OCR 결과',points:[{title:'보온'}],status:'automatic-source-reviewed',analyzedAt:new Date().toISOString()})]),[]);
});
test('확인 실패·최초 해시 확보는 실제 변경으로 집계하지 않는다',()=>{
 assert.deepEqual(changedOfficialProducts({[id]:{pageHash:'c'.repeat(64),detailHash:hash}},[item({pageHash:null,detailHash:null})]),[]);
 assert.deepEqual(changedOfficialProducts({[id]:{pageHash:'c'.repeat(64),detailHash:null}},[item()]),[]);
});
test('일시적 확인 실패에도 마지막 확인된 원본 해시를 보존한다',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'benefit-hash-'));try{
  await saveWebsiteCheck(dir,[item()]);
  const failed=await saveWebsiteCheck(dir,[item({pageHash:null,detailHash:null})]);
  assert.equal(failed.products[id].detailHash,hash);assert.equal(failed.batches.at(-1).events.length,0);
  const changed=await saveWebsiteCheck(dir,[item({detailHash:'d'.repeat(64)})]);
  assert.deepEqual(changed.batches.at(-1).events[0].changes,['공식 상세이미지 변경']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
