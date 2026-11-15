import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {load} from 'cheerio';
import {prepareSmartstoreDetail} from '../smartstore-detail-files.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {saveMainSelection} from '../smartstore-main-selection.mjs';

test('상세 상단 사진은 파일명이나 색상 순서 대신 명시한 대표사진만 사용한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'detail-selected-main-'));
 try{
  const folder=path.join(root,'collected'),dataRoot=path.join(root,'data'),photos=path.join(root,'photos');
  const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/current',name:'남성 상의',colors:['01블랙'],sizes:['M'],images:{}};
  const draftRoot=path.join(dataRoot,'smartstore-details',product.style);
  for(const dir of [folder,photos,draftRoot])await mkdir(dir,{recursive:true});
  const numbered=await sharp({create:{width:120,height:160,channels:3,background:'#333'}}).jpeg().toBuffer();
  const chosen=await sharp({create:{width:120,height:160,channels:3,background:'#ccc'}}).jpeg().toBuffer();
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(photos,'1.jpg'),numbered);
  await writeFile(path.join(photos,'chosen.jpg'),chosen);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({
   style:product.style,sourceUrl:product.sourceUrl,acceptAllFolderPhotos:true,
   photoMapping:{files:[{name:'1.jpg',hash:hash(numbered),color:'01블랙',role:'front'},{name:'chosen.jpg',hash:hash(chosen),color:'01블랙',role:'side'}]}
  }));
  const options={dataRoot,photoRoots:[photos]};
  const unselected=await prepareSmartstoreDetail(product,folder,options);
  assert.equal(unselected.smartstoreDetail.heroImage,null);
  assert.equal(unselected.smartstoreDetail.photoCount,2);
  for(const detailTemplate of [1,2]){
   const $=load(buildSmartstoreDetail({...unselected,detailTemplate}).html);
   assert.equal($('[data-product-intro] img[src^="/smartstore-photo/"]').length,0);
  }
  await saveMainSelection(product,{name:'chosen.jpg',bytes:chosen},dataRoot);
  const selected=await prepareSmartstoreDetail(product,folder,options);
  const hero=selected.smartstoreDetail.heroImage;
  assert.equal(hero,'/smartstore-photo/'+hash(chosen).slice(0,24));
  assert.deepEqual(await readFile(path.join(folder,selected.smartstoreDetail.photoFiles[hero])),chosen);
  for(const detailTemplate of [1,2]){
   const $=load(buildSmartstoreDetail({...selected,detailTemplate}).html);
   assert.equal($('[data-product-intro] img[src="'+hero+'"]').length,1);
  }
  await writeFile(path.join(photos,'chosen.jpg'),numbered);
  await assert.rejects(prepareSmartstoreDetail(product,folder,options),/변경|삭제/);
 }finally{await rm(root,{recursive:true,force:true});}
});
