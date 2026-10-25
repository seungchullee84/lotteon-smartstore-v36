import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseListingPhotos,saveListingSelection,prepareListingImages,listingPreview,originalListingMain} from '../smartstore-listing-images.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {findPhotos} from '../smartstore-photo-files.mjs';
const photo=(name,color,role,id)=>({name,color,role,bytes:Buffer.from(id)});
test('새 사진 경로에서 품번을 정확히 찾고 분석 전에도 1번 원본을 미리보기한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-photo-path-'));
 try{
  const product={style:'376921',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=path',colors:['01블랙']};
  const chosen=path.join(root,'상품등록기사진폴더',product.style),other=path.join(root,'상품등록기사진폴더','076931'),old=path.join(root,product.style);
  for(const folder of [chosen,other,old])await mkdir(folder,{recursive:true});
  await writeFile(path.join(chosen,'1.jpg'),Buffer.from('current-original'));
  await writeFile(path.join(chosen,'옆면.jpg'),Buffer.from('current-side'));
  await writeFile(path.join(other,'1.jpg'),Buffer.from('other-product'));
  await writeFile(path.join(old,'1.jpg'),Buffer.from('old-location'));
  const options={desktop:root,dataRoot:path.join(root,'data')};
  const found=await findPhotos(product,options);assert.equal(found.length,2);assert.ok(found.every(p=>p.file.startsWith(chosen+path.sep)));
  const preview=await listingPreview(product,options);assert.equal(preview.main.sourceName,'1.jpg');assert.equal(preview.previewOnly,true);
  assert.deepEqual(await readFile(await originalListingMain(product,options)),Buffer.from('current-original'));
  await assert.rejects(prepareListingImages(product,root,options),/선택을 먼저/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('1번 대표 + 같은 색상 옆면 + 다른 색상 정면만 고르고 대표 중복을 빼며 색상 순서를 지킨다',()=>{
 const photos=[photo('dark.jpg','01다크브라운','front','dark-front'),photo('1.jpg','02카멜','front','main'),photo('close.jpg','02카멜','detail','detail'),photo('camel-side.jpg','02카멜','side','side'),photo('dark-side.jpg','01다크브라운','side','dark-side')];
 const result=chooseListingPhotos(photos,{colors:['01다크브라운','02카멜']});assert.equal(result.main.name,'1.jpg');assert.deepEqual(result.extras.map(p=>p.name),['camel-side.jpg','dark.jpg']);assert.ok(!result.extras.some(p=>p.bytes.equals(result.main.bytes)));
});
test('대표 1번은 필수지만 옆면이 없으면 대표만으로 진행한다',()=>{
 const p={colors:['01블랙']};assert.throws(()=>chooseListingPhotos([photo('front.jpg','01블랙','front','a')],p),/1.jpg/);
 const result=chooseListingPhotos([photo('1.jpg','01블랙','front','a'),photo('detail.jpg','01블랙','detail','b')],p);
 assert.equal(result.main.name,'1.jpg');assert.deepEqual(result.extras,[]);
});

test('옆면 없이도 다른 색상 정면만 공식 색상 순서로 추가하고 중복·디테일은 넣지 않는다',()=>{
 const photos=[photo('1.jpg','02차콜','front','main'),photo('brown.jpg','03브라운','front','brown'),photo('black.jpg','01블랙','front','black'),photo('duplicate.jpg','01블랙','front','main'),photo('detail.jpg','02차콜','detail','detail')];
 const result=chooseListingPhotos(photos,{colors:['01블랙','02차콜','03브라운']});
 assert.deepEqual(result.extras.map(p=>p.name),['black.jpg','brown.jpg']);
 assert.ok(result.extras.every(p=>p.role==='front'&&!p.bytes.equals(result.main.bytes)));
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
test('추가이미지 선택이 같아도 상세 사진 연결 변경은 미리보기 갱신 버전을 바꾼다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'detail-revision-'));
 try{
  const product={style:'026982',sourceUrl:'https://www.giordano.co.kr/test'};
  const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(root,{recursive:true});
  const draft={style:product.style,sourceUrl:product.sourceUrl,listingImages:{main:{sourceName:'1.jpg'},extras:[]},photos:[]};
  const file=path.join(root,'draft.json');await writeFile(file,JSON.stringify(draft));
  const before=await listingPreview(product,{dataRoot});
  assert.equal((await listingPreview(product,{dataRoot})).detailRevision,before.detailRevision);
  draft.photos=[{color:'01네이비',files:['photos/side.jpg']}];await writeFile(file,JSON.stringify(draft));
  const after=await listingPreview(product,{dataRoot});assert.notEqual(after.detailRevision,before.detailRevision);assert.deepEqual(after.main,before.main);
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
