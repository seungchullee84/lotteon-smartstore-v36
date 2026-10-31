import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {savePointSelection} from '../smartstore-point-picker.mjs';import {reviewSellingPoints} from '../smartstore-selling-point-review.mjs';import {buildSmartstoreDetail} from '../smartstore-detail.mjs';import {smartstorePreparationStatus} from '../smartstore-preparation-status.mjs';
import {photoReview,savePhotoReview,savePhotoReviewDraft} from '../smartstore-photo-review.mjs';import {originalListingMain,chooseListingPhotos} from '../smartstore-listing-images.mjs';
import {prepareSmartstoreDetail} from '../smartstore-detail-files.mjs';

test('공식 구매 이유가 없는 상품은 생략 완료 대신 미완성으로 남긴다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'automatic-empty-points-'));
 try{
  const p={style:'654321',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=empty',name:'공식 상의',rawName:'공식 상의',gender:'남성',colors:[],images:{main:'https://www.giordano.co.kr/main.jpg'},detailFallbackApproved:true,officialDescription:'면 100%. SIZE S M L.'};
  const prepared=await prepareSmartstoreDetail(p,dataRoot,{dataRoot,photoRoots:[]});
  assert.equal(prepared.smartstoreDetail.omitSellingPoints,false);assert.deepEqual(prepared.smartstoreDetail.sellingPoints,[]);
  assert.equal(smartstorePreparationStatus(prepared,{extras:[],manifest:{}}).templateReady,false);
  for(const detailTemplate of [1,2]){const html=buildSmartstoreDetail({...prepared,detailTemplate}).html;assert(!html.includes('data-product-points'));assert(!html.includes('data-product-point-heading'));assert(html.includes('data-official-detail'));}
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
test('과거 생략 설정을 무시하고 공식 원문에서 구매 이유를 다시 구성한다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'required-points-'));
 try{const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=required',name:'테스트 상의',rawName:'테스트 상의',gender:'남성',colors:[],images:{}};
 await assert.rejects(savePointSelection(p,dataRoot,{channel:'smartstore',style:p.style,omit:true},{dataRoot}),/생략할 수 없습니다/);
 const root=path.join(dataRoot,'smartstore-details',p.style);await mkdir(root,{recursive:true});await writeFile(path.join(root,'selling-point-selection.json'),JSON.stringify({...p,omit:true,points:[]}));
 const source='부드러운 원단으로 편안한 착용감을 제공합니다. 밑단 스트링으로 핏 조절이 가능합니다. 옆면 포켓으로 수납성을 높였습니다.';
 const review=await reviewSellingPoints(p,source,{dataRoot});assert.equal(review.status,'ready');assert.equal(review.omitted,false);assert(review.points.length>=2&&review.points.length<=4);
 p.smartstoreDetail={style:p.style,omitSellingPoints:true,sellingPoints:review.points,photoCount:1,colorImages:{}};
 for(const detailTemplate of [1,2]){const html=buildSmartstoreDetail({...p,detailTemplate}).html;assert(html.includes('data-product-points'));assert(html.includes('data-product-point-heading'));}
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});

test('1번 없이 선택한 대표를 저장·복원하며 같은 색상 옆면과 다른 색상 정면으로 추가사진을 고른다',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'selected-main-'));try{const folder=path.join(root,'photos');await mkdir(folder);const p={style:'123457',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=main',colors:['01블랙','02화이트']},options={dataRoot:root,photoRoots:[folder]};for(const [i,name] of ['black.jpg','white.jpg','white-side.jpg'].entries())await writeFile(path.join(folder,name),await sharp({create:{width:60,height:80,channels:3,background:{r:30+i*80,g:30+i*80,b:30+i*80}}}).jpeg().toBuffer());let r=await photoReview(p,options);const white=r.items.find(i=>i.name==='white.jpg'),items=r.items.map(i=>({...i,color:i.name.startsWith('white')?'02화이트':'01블랙',role:i.name.includes('side')?'side':'front'}));const input={...r,channel:'smartstore',mainId:white.id,items};await savePhotoReviewDraft(p,input,options);await savePhotoReview(p,input,options);r=await photoReview(p,options);assert.equal(r.mainId,white.id);const work=await originalListingMain(p,options);assert((await readFile(work)).length);const photos=await Promise.all(items.map(async i=>({name:i.name,color:i.color,role:i.role,reviewed:true,mainSelected:i.id===white.id,bytes:await readFile(path.join(folder,i.name))})));const listing=chooseListingPhotos(photos,p);assert.equal(listing.main.name,'white.jpg');assert.deepEqual(listing.extras.map(p=>p.name),['white-side.jpg','black.jpg']);}finally{await rm(root,{recursive:true,force:true});}});
