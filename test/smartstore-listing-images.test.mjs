import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseListingPhotos,saveListingSelection,prepareListingImages} from '../smartstore-listing-images.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {findPhotos} from '../smartstore-photo-files.mjs';
const photo=(name,color,role,id)=>({name,color,role,bytes:Buffer.from(id)});
test('1번 대표 + 같은 색상 옆면 + 다른 색상 정면만 고르고 대표 중복을 빼며 색상 순서를 지킨다',()=>{
 const photos=[photo('dark.jpg','01다크브라운','front','dark-front'),photo('1.jpg','02카멜','front','main'),photo('close.jpg','02카멜','detail','detail'),photo('camel-side.jpg','02카멜','side','side'),photo('dark-side.jpg','01다크브라운','side','dark-side')];
 const result=chooseListingPhotos(photos,{colors:['01다크브라운','02카멜']});assert.equal(result.main.name,'1.jpg');assert.deepEqual(result.extras.map(p=>p.name),['camel-side.jpg','dark.jpg']);assert.ok(!result.extras.some(p=>p.bytes.equals(result.main.bytes)));
});
test('대표 1번이나 같은 색상 옆면이 빠졌을 때 임의로 다른 사진을 쓰지 않는다',()=>{
 const p={colors:['01블랙']};assert.throws(()=>chooseListingPhotos([photo('front.jpg','01블랙','front','a')],p),/1.jpg/);assert.throws(()=>chooseListingPhotos([photo('1.jpg','01블랙','front','a')],p),/옆면/);
});

test('smartstore main and extras preserve exact original bytes, format, dimensions and EXIF',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-original-'));
 try{
  const photoRoot=path.join(root,'photos'),output=path.join(root,'output'),dataRoot=path.join(root,'data');await mkdir(photoRoot);await mkdir(output);
  const product={style:'076931',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=original',colors:['01카멜']};
  const main=await sharp({create:{width:750,height:1000,channels:3,background:'#916b48'}}).withMetadata({orientation:6}).jpeg({quality:72}).toBuffer();
  const side=await sharp({create:{width:640,height:900,channels:4,background:'#6b5140'}}).png().toBuffer();
  await writeFile(path.join(photoRoot,'1.jpg'),main);await writeFile(path.join(photoRoot,'옆면.png'),side);await writeFile(path.join(photoRoot,'중복.jpg'),main);
  const found=await findPhotos(product,{photoRoots:[photoRoot]});assert.ok(found.some(p=>p.name==='1.jpg'));
  const draftRoot=path.join(dataRoot,'smartstore-details',product.style);const listingImages=await saveListingSelection(draftRoot,{main:photo('1.jpg','01카멜','front',main),extras:[photo('옆면.png','01카멜','side',side)]});
  assert.deepEqual(await readFile(path.join(draftRoot,listingImages.main.file)),main);assert.deepEqual(await readFile(path.join(draftRoot,listingImages.extras[0].file)),side);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...product,listingImages}));
  const selected=await prepareListingImages(product,output,{dataRoot,photoRoots:[photoRoot]});
  assert.deepEqual(await readFile(selected.main),main);assert.deepEqual(await readFile(selected.extras[0]),side);assert.equal(path.extname(selected.extras[0]),'.png');assert.equal((await sharp(selected.main).metadata()).orientation,6);
  await unlink(path.join(photoRoot,'옆면.png'));await assert.rejects(prepareListingImages(product,output,{dataRoot,photoRoots:[photoRoot]}),/추가사진 원본/);
 }finally{await rm(root,{recursive:true,force:true});}
});
