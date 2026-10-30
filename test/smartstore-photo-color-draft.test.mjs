import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';
import {prefillPhotoColors} from '../smartstore-photo-color-draft.mjs';import {photoReview,savePhotoReviewDraft,numberedPhotoColors} from '../smartstore-photo-review.mjs';
test('공식 색상명은 보존하고 색상번호 1~99로 정렬한다',()=>{assert.deepEqual(numberedPhotoColors(['99블랙','10네이비','2그레이','01베이지','색상미정']),['01베이지','2그레이','10네이비','99블랙','색상미정']);});
test('새 상품 색상 초안은 자동 반영하고 수동 변경·공란 지정을 보존하며 템플릿을 제작하지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'color-draft-')),dataRoot=path.join(root,'data'),folder=path.join(root,'photos');await mkdir(folder);
 const p={style:'026511',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=new',colors:['01그레이','02블랙']},options={dataRoot,photoRoots:[folder]};
 try{
  for(const [name,color] of [['1.jpg','gray'],['b.jpg','black']])await writeFile(path.join(folder,name),await sharp({create:{width:90,height:120,channels:3,background:color}}).jpeg().toBuffer());
  const result=await prefillPhotoColors(p,folder,{...options,classify:async(_,photos,o)=>{assert(o.draftColors);return photos.map((f,i)=>({...f,color:p.colors[i],role:'front'}));}});assert.equal(result.filled,2);
  let r=await photoReview(p,options);assert.deepEqual(r.items.map(i=>i.color),p.colors);assert(r.items.every(i=>i.role===''));await assert.rejects(readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json')),e=>e.code==='ENOENT');
  const payload={...r,channel:'smartstore',items:r.items.map((i,n)=>({...i,color:n?'':'02블랙',colorOverride:true}))};await savePhotoReviewDraft(p,payload,options);
  await prefillPhotoColors(p,folder,{...options,classify:async()=>assert.fail('수동으로 선택한 원본은 재판독하지 않는다')});r=await photoReview(p,options);assert.equal(r.items[0].color,'02블랙');assert.equal(r.items[1].color,'');
 }finally{await rm(root,{recursive:true,force:true});}
});
