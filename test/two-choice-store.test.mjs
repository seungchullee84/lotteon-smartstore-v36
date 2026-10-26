import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {installTwoChoicePackage,listTwoChoicePackages,readTwoChoicePackage} from '../smartstore-two-choice-store.mjs';
import {smartstoreMediaOrder} from '../smartstore-detail-upload.mjs';import {twoChoiceSellerStyle} from '../smartstore-detail-only.mjs';import {requireChannel} from '../channel-routing.mjs';
test('보관 구성은 두 상품으로 분리 보관하고 변경 파일과 다른 버전·경로를 차단',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'two-choice-store-'));try{
  const png=path.join(root,'sample.png'),html=path.join(root,'sample.html'),video=path.join(root,'sample.mp4');await sharp({create:{width:860,height:20,channels:3,background:'#fff'}}).png().toFile(png);await writeFile(html,'<html>두 상품</html>');await writeFile(video,'test-video');
  const input={id:'two-products',label:'선택1 / 선택2',products:[{style:'116522'},{style:'116926'}],sources:{'preview.html':html,'overview.png':png,'full.png':png,'brand.mp4':video,'first.png':png,'second.png':png},parts:['first.png','second.png'],videoAfterIndex:0,bannerIndex:0,footerIndex:1};
  const saved=await installTwoChoicePackage(root,input);assert.equal((await listTwoChoicePackages(root)).length,1);assert.equal(saved.choiceCount,2);const b=await readTwoChoicePackage(root,saved.id,saved.revision);assert.equal(b.manifest.products[0].style,'116522');assert.equal(b.manifest.products[1].style,'116926');
  await assert.rejects(readTwoChoicePackage(root,saved.id,'old-version'),/변경/);await assert.rejects(readTwoChoicePackage(root,'../outside'),/선택값/);
  await writeFile(b.files['first.png'],'changed');await assert.rejects(readTwoChoicePackage(root,saved.id),/변경/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('일반 상품 영상 순서는 그대로 두고 두 상품 구성의 뒤쪽 영상 위치 지원',()=>{
 assert.deepEqual(smartstoreMediaOrder({files:['a','b']}),['image','video','image']);
 assert.deepEqual(smartstoreMediaOrder({files:['guide','autumn','winter','brand','banner','footer'],videoAfterIndex:3}),['image','image','image','image','video','image','image']);
 assert.deepEqual(smartstoreMediaOrder({files:['a','b'],includeVideo:false}),['image','image']);
 assert.throws(()=>smartstoreMediaOrder({files:['a'],videoAfterIndex:2}),/삽입 위치/);
});
test('두 상품 첨부는 저장 품번과 일치하는 판매자 코드만 허용하며 롯데ON 요청 차단',()=>{
 const products=[{style:'116522'},{style:'116926'}];assert.equal(twoChoiceSellerStyle('116522 + 116926',products),'116522');assert.equal(twoChoiceSellerStyle('겨울 116926',products),'116926');assert.throws(()=>twoChoiceSellerStyle('다른 상품 123456',products),/일치하지/);assert.throws(()=>requireChannel('smartstore-two-choice-upload','lotte'),/판매채널/);
});
