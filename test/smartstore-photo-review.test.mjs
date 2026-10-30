import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {photoReview,savePhotoReview,validatePhotoReview,photoReviewThumbnail} from '../smartstore-photo-review.mjs';
import {readPhotoMappings} from '../smartstore-photo-mapping-cache.mjs';
import {findPhotos} from '../smartstore-photo-files.mjs';

test('신규 원본 선택 저장·재열기·케어라벨 오판 수정 및 원본 변경 방어',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'photo-review-'));const dataRoot=path.join(root,'data'),folder=path.join(root,'photos');await mkdir(folder);
 const p={style:'076922',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',colors:['01그레이','02블랙']},options={dataRoot,photoRoots:[folder]};
 try{
  const a=await sharp({create:{width:80,height:120,channels:3,background:'gray'}}).jpeg().toBuffer(),b=await sharp({create:{width:80,height:120,channels:3,background:'black'}}).jpeg().toBuffer();await writeFile(path.join(folder,'1.jpg'),a);await writeFile(path.join(folder,'b.jpg'),b);
  const current=await photoReview(p,options);assert.equal(current.items.length,2);assert(current.items.every(i=>i.role===''));
  let input={...current,channel:'smartstore',items:current.items.map((i,n)=>({...i,color:p.colors[n],role:n?'care-label':'front'}))};
  assert.throws(()=>validatePhotoReview(current,{...input,channel:'lotte'}));assert.throws(()=>validatePhotoReview(current,{...input,revision:'old'}));assert.throws(()=>validatePhotoReview(current,{...input,items:[input.items[0],input.items[0]]}));
  await savePhotoReview(p,input,options);let next=await photoReview(p,options);assert.equal(next.items[1].role,'care-label');assert((await readPhotoMappings(dataRoot,p)).every(i=>i.reviewed));
  input={...next,channel:'smartstore',items:next.items.map((i,n)=>({...i,color:p.colors[n],role:n?'back':'front'}))};await savePhotoReview(p,input,options);next=await photoReview(p,options);assert.equal(next.items[1].role,'back');assert.equal(JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json'))).careLabels.length,0);assert.deepEqual(await readFile(path.join(folder,'1.jpg')),a);
  input={...next,channel:'smartstore',items:next.items.map((i,n)=>({...i,color:p.colors[n],role:n?'excluded':'front'}))};await savePhotoReview(p,input,options);
  assert.equal((await findPhotos(p,options)).length,1);next=await photoReview(p,options);assert.equal(next.items.length,2);assert.equal(next.items[1].role,'excluded');assert.deepEqual(await readFile(path.join(folder,'b.jpg')),b);
  input={...next,channel:'smartstore',items:next.items.map((i,n)=>({...i,color:p.colors[n],role:n?'back':'front'}))};await savePhotoReview(p,input,options);assert.equal((await findPhotos(p,options)).length,2);
  await writeFile(path.join(folder,'new.jpg'),a);await assert.rejects(savePhotoReview(p,input,options),/変更|변경/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('미리보기는 재사용하되 원본 변경·삭제 후 이전 이미지를 보여주지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'review-thumb-')),dataRoot=path.join(root,'data'),folder=path.join(root,'photos');await mkdir(folder);
 const p={style:'076923',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=thumb',colors:['01블랙']},options={dataRoot,photoRoots:[folder]},file=path.join(folder,'1.jpg');
 try{
  const image=color=>sharp({create:{width:800,height:1200,channels:3,background:color}}).jpeg().toBuffer();await writeFile(file,await image('black'));
  let review=await photoReview(p,options);const id=review.items[0].id,first=await photoReviewThumbnail(p,id,options);assert.equal((await sharp(first).metadata()).width,400);assert.strictEqual(await photoReviewThumbnail(p,id,options),first);
  await writeFile(file,await image('white'));assert.equal(await photoReviewThumbnail(p,id,options),null);review=await photoReview(p,options);assert.notEqual(review.items[0].id,id);assert(await photoReviewThumbnail(p,review.items[0].id,options));await rm(file);assert.equal(await photoReviewThumbnail(p,review.items[0].id,options),null);
 }finally{await rm(root,{recursive:true,force:true});}
});
