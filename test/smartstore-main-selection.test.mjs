import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readMainSelection,saveMainSelection,selectedMainPhoto} from '../smartstore-main-selection.mjs';

const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test'};
const photo=(name,content)=>({name,bytes:Buffer.from(content)});

test('파일명이 1.jpg 또는 1번.jpg여도 직접 저장한 대표 선택이 필요하다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'main-required-'));
 try{
  for(const photos of [[],[photo('1.jpg','first')],[photo('1번.jpg','first')],[photo('look-front.png','first')]]){
   await assert.rejects(selectedMainPhoto(photos,product,dataRoot),{code:'MAIN_PHOTO_SELECTION_REQUIRED'});
  }
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});

test('직접 지정한 파일과 원본 해시를 사용하고 유일한 동일 사진의 이름 변경은 허용한다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'main-explicit-'));
 try{
  const chosen=photo('대표 정면.png','chosen'),numbered=photo('1.jpg','numbered'),copy=photo('copy.jpg','chosen');
  await saveMainSelection(product,chosen,dataRoot);
  assert.equal((await readMainSelection(product,dataRoot)).sourceName,chosen.name);
  assert.strictEqual(await selectedMainPhoto([numbered,copy,chosen],product,dataRoot),chosen);
  const renamed=photo('새이름.webp','chosen');
  assert.strictEqual(await selectedMainPhoto([numbered,renamed],product,dataRoot),renamed);
  assert.equal(await readMainSelection({...product,sourceUrl:product.sourceUrl+'other'},dataRoot),null);
  await assert.rejects(selectedMainPhoto([chosen],{...product,sourceUrl:product.sourceUrl+'other'},dataRoot),{code:'MAIN_PHOTO_SELECTION_REQUIRED'});
  await assert.rejects(selectedMainPhoto([chosen],{...product,style:'654321'},dataRoot),{code:'MAIN_PHOTO_SELECTION_REQUIRED'});
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});

test('삭제·내용 변경·이름 변경 뒤 중복 사본은 재선택을 요구하며 번호 파일로 대체하지 않는다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'main-changed-'));
 try{
  const chosen=photo('chosen.jpg','original'),numbered=photo('1.jpg','unrelated');
  await saveMainSelection(product,chosen,dataRoot);
  for(const photos of [
   [numbered],
   [numbered,photo('chosen.jpg','changed')],
   [numbered,photo('copy-a.jpg','original'),photo('copy-b.jpg','original')],
   [chosen,{...chosen}],
  ])await assert.rejects(selectedMainPhoto(photos,product,dataRoot),{code:'MAIN_PHOTO_SELECTION_CHANGED'});
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
