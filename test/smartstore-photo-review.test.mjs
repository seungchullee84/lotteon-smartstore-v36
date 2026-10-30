import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {photoReview,savePhotoReview,validatePhotoReview} from '../smartstore-photo-review.mjs';
import {readPhotoMappings} from '../smartstore-photo-mapping-cache.mjs';

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
  await writeFile(path.join(folder,'new.jpg'),a);await assert.rejects(savePhotoReview(p,input,options),/変更|변경/);
 }finally{await rm(root,{recursive:true,force:true});}
});
