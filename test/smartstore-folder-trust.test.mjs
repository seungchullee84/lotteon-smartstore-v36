import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {prepareSmartstoreAuto} from '../smartstore-auto-prepare.mjs';
import {prepareListingImages} from '../smartstore-listing-images.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {careLabelText} from '../smartstore-folder-trust.mjs';
test('품번 폴더를 API 없이 신뢰하되 미매칭 사진도 색상명 없이 자동 연결하고 라벨을 분리한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'trusted-folder-'));try{
  const folder=path.join(root,'collected'),pictures=path.join(root,'photos'),dataRoot=path.join(root,'data');await mkdir(folder);await mkdir(pictures);
  const product={style:'326931',rawName:'여성 경량 하프집업',name:'여성 경량 하프집업 326931',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=trusted',colors:['01그레이','02브라운'],images:{detail:'https://www.giordano.co.kr/detail.jpg'}};
  await writeFile(path.join(folder,'smartstore-official.html'),'<body>STYLE. 05326931<div class="prd_detail_content_gio">가벼운 하프집업 상품입니다.</div></body>');
  const bytes=await Promise.all(['#abc','#def','#123'].map(background=>sharp({create:{width:80,height:100,channels:3,background}}).jpeg().toBuffer()));
  for(const [i,name]of ['1.jpg','20261025_001.jpg','20261025_002.jpg'].entries())await writeFile(path.join(pictures,name),bytes[i]);await writeFile(path.join(folder,'detail.jpg'),bytes[0]);
  const digest=b=>createHash('sha256').update(b).digest('hex');let calls=0;const options={dataRoot,photoRoots:[pictures],apiKey:'',fetchImpl:()=>{throw Error('외부 사진분석 호출 금지');},recognizePhoto:async b=>{calls++;return digest(b)===digest(bytes[2])?'제조국 베트남 제조연월 2026.08 혼용률 면 60%':'';}};
  const prepared=await prepareSmartstoreAuto(product,folder,options),files=await prepareListingImages(prepared,folder,options);
  assert.equal(files.extras.length,0,'미확정 각도 사진은 추가에 섞지 않음');assert.equal(prepared.smartstoreDetail.photoCount,2);assert.equal(prepared.smartstoreDetail.providedImages.length,2);assert.equal(prepared.smartstoreDetail.pendingPhotoCount,2);assert.deepEqual(prepared.smartstoreDetail.colorImages,{});
  const draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));assert.equal(draft.careLabels.length,1);assert.equal(draft.trustedFolder,true);
  const html=buildSmartstoreDetail(prepared).html;assert(!html.includes('data-mannequin-unclassified'));assert(!html.includes('https://example.com/unmatched.jpg'));assert(prepared.smartstoreDetail.providedImages.every(src=>!html.includes(src)||src===prepared.smartstoreDetail.heroImage));
  for(const record of draft.photoMapping.files)if(record.role==='provided'){record.role=record.name==='1.jpg'?'front':'side';record.color='01그레이';}
  draft.photoMapping.ignoredPhotos=[{hash:'f'.repeat(64),reason:'확인 후 제외한 사진'}];await writeFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),JSON.stringify(draft));
  const again=await prepareSmartstoreAuto(product,folder,{...options,recognizePhoto:()=>{throw Error('같은 사진 OCR 재실행 금지');}});assert.equal(again.smartstoreDetail.photoCount,2);assert.equal(again.smartstoreDetail.pendingPhotoCount,0);assert.equal(calls,3);assert.deepEqual(JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8')).photoMapping.ignoredPhotos,draft.photoMapping.ignoredPhotos);
  const stale=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));
  for(const r of stale.photoMapping.files)if(r.role!=='care-label'){r.role='provided';r.color='';}
  await writeFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),JSON.stringify(stale));
  const recovered=await prepareSmartstoreAuto(product,folder,options);assert.equal(recovered.smartstoreDetail.colorImages['01그레이'].length,2,'색상별 사진 연결을 빈 provided 기록으로 덮어쓰지 않음');assert.equal(recovered.smartstoreDetail.pendingPhotoCount,0);
  await unlink(path.join(pictures,'20261025_001.jpg'));await unlink(path.join(pictures,'20261025_002.jpg'));
  const removed=await prepareSmartstoreAuto(product,folder,options);assert.equal(removed.smartstoreDetail.photoCount,1);assert.equal((await prepareListingImages(removed,folder,options)).extras.length,0);
  const fresh=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));assert.equal(fresh.careLabels.length,0,'삭제한 과거 라벨은 다시 업로드하지 않음');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('케어라벨 판별은 제조·혼용·관리 문구 여러 개를 함께 확인한다',()=>{assert(careLabelText('LOT 05-32-6931 MADE IN VIETNAM 제조국 베트남'));assert(!careLabelText('MANHATTAN NEW YORK 면 티셔츠'));});
