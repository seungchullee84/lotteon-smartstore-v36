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
  const original=await sharp({create:{width:60,height:80,channels:3,background:'#123456'}}).jpeg().toBuffer();
  await writeFile(path.join(chosen,'1.jpg'),original);
  await writeFile(path.join(chosen,'옆면.jpg'),Buffer.from('current-side'));
  await writeFile(path.join(other,'1.jpg'),Buffer.from('other-product'));
  await writeFile(path.join(old,'1.jpg'),Buffer.from('old-location'));
  const options={desktop:root,dataRoot:path.join(root,'data')};
  const found=await findPhotos(product,options);assert.equal(found.length,2);assert.ok(found.every(p=>p.file.startsWith(chosen+path.sep)));
  const preview=await listingPreview(product,options);assert.equal(preview.main.sourceName,'1.jpg');assert.equal(preview.previewOnly,true);
  const work=await originalListingMain(product,options);assert.equal((await sharp(work).metadata()).width,750);assert.equal((await sharp(work).metadata()).height,1000);assert.deepEqual(await readFile(path.join(chosen,'1.jpg')),original);
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

test('옆면이 없으면 시각 확인한 같은 색 다른 정면을 사용하며 옆면이 있으면 우선한다',()=>{
 const p={colors:['01화이트','02블랙']},main=photo('1.jpg','01화이트','front','main'),other={...photo('closed.jpg','01화이트','front','closed'),reviewed:true},black=photo('black.jpg','02블랙','front','black'),side=photo('side.jpg','01화이트','side','side');
 const alternate=chooseListingPhotos([main,other,black],p);assert.deepEqual(alternate.extras.map(x=>x.role),['alternate','front']);assert.equal(alternate.extras[0].name,'closed.jpg');
 assert.equal(chooseListingPhotos([main,other,black,side],p).extras[0].name,'side.jpg');
 assert.deepEqual(chooseListingPhotos([main,{...other,reviewed:false},black],p).extras.map(x=>x.name),['black.jpg']);
});

test('옆면 없이도 다른 색상 정면만 공식 색상 순서로 추가하고 중복·디테일은 넣지 않는다',()=>{
 const photos=[photo('1.jpg','02차콜','front','main'),photo('brown.jpg','03브라운','front','brown'),photo('black.jpg','01블랙','front','black'),photo('duplicate.jpg','01블랙','front','main'),photo('detail.jpg','02차콜','detail','detail')];
 const result=chooseListingPhotos(photos,{colors:['01블랙','02차콜','03브라운']});
 assert.deepEqual(result.extras.map(p=>p.name),['black.jpg','brown.jpg']);
 assert.ok(result.extras.every(p=>p.role==='front'&&!p.bytes.equals(result.main.bytes)));
});

test('대표·추가는 750×1000 JPG 작업본을 사용하고 원본 바이트·EXIF는 보존한다',async()=>{
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
  for(const file of [selected.main,...selected.extras]){const meta=await sharp(file).metadata();assert.equal(meta.width,750);assert.equal(meta.height,1000);assert.equal(meta.format,'jpeg');assert.equal(path.extname(file),'.jpg');}
  assert.deepEqual(await readFile(path.join(photoRoot,'1.jpg')),main);assert.deepEqual(await readFile(path.join(photoRoot,'옆면.png')),side);assert.equal((await sharp(path.join(photoRoot,'1.jpg')).metadata()).orientation,6);
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

test('공식몰 대표 원본을 추가 첫 번째로 한 번만 넣고 제공 사진 순서·총 9장 제한을 공통 적용한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'official-first-'));try{
  const folder=path.join(root,'collected'),pictures=path.join(root,'photos'),dataRoot=path.join(root,'data');await mkdir(folder);await mkdir(pictures);
  const product={style:'326931',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=current',images:{main:'https://www.giordano.co.kr/official-main.jpg'},colors:Array.from({length:10},(_,i)=>String(i+1).padStart(2,'0')+'컬러')};
  const official=await sharp({create:{width:81,height:103,channels:3,background:'#fc4'}}).jpeg({quality:77}).toBuffer();await writeFile(path.join(folder,'main.jpg'),official);await writeFile(path.join(folder,'product.json'),JSON.stringify(product));
  const photos=[];for(let i=0;i<10;i++){const bytes=await sharp({create:{width:80,height:100,channels:3,background:{r:i*20,g:50,b:80}}}).jpeg().toBuffer(),name=i===0?'1.jpg':String(i+1)+'.jpg';await writeFile(path.join(pictures,name),bytes);photos.push({name,bytes,color:product.colors[i],role:'front'});}
  const draftRoot=path.join(dataRoot,'smartstore-details',product.style),listingImages={...await saveListingSelection(draftRoot,{main:photos[0],extras:photos.slice(1)}),trustedFolder:true};await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...product,listingImages}));
  const options={dataRoot,photoRoots:[pictures]},preview=await listingPreview(product,options),selected=await prepareListingImages(product,folder,options);
  assert.equal(preview.extras.length,9);assert.equal(preview.extras[0].role,'official-main');assert.deepEqual(preview.extras.slice(1).map(p=>p.sourceName),photos.slice(1,9).map(p=>p.name));assert.equal(selected.extras.length,9);assert.deepEqual(await readFile(path.join(folder,'main.jpg')),official); for(const file of [selected.main,...selected.extras]){const meta=await sharp(file).metadata();assert.equal(meta.width,750);assert.equal(meta.height,1000);assert.equal(meta.format,'jpeg');}assert.notDeepEqual(await readFile(selected.main),official);
  assert.deepEqual((await listingPreview(product,options)).extras,preview.extras);const raw=JSON.parse(await readFile(path.join(draftRoot,'draft.json'),'utf8'));assert.equal(raw.listingImages.extras.filter(p=>p.role==='official-main').length,0,'재실행 때 공식 사진을 초안에 누적하지 않음');
  await writeFile(path.join(folder,'product.json'),JSON.stringify({...product,style:'326932'}));await assert.rejects(prepareListingImages(product,folder,options),/공식몰 대표사진을 다시 수집/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('기존 초안에 섞인 미분류·케어라벨·뒷면·디테일은 서브에서 제외하고 공식몰·같은 색 옆면·다른 색 정면만 유지한다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'listing-routine-'));try{
  const product={style:'356954',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=routine',images:{main:'https://www.giordano.co.kr/official.jpg'},colors:['01크림','02베이지']};const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(root,{recursive:true});
  const listingImages={main:{color:'02베이지',sourceHash:'main'},extras:[{color:'02베이지',role:'side',sourceHash:'side'},{color:'01크림',role:'front',sourceHash:'cream-front'},...['back','detail','care-label','provided'].map(role=>({color:'02베이지',role,sourceHash:role})),{color:'02베이지',role:'front',sourceHash:'another-front'}]};
  await writeFile(path.join(root,'draft.json'),JSON.stringify({...product,listingImages}));const preview=await listingPreview(product,{dataRoot});assert.deepEqual(preview.extras.map(p=>p.role),['official-main','side','front']);
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});

test('같은 원본 바이트의 파일이 여러 개여도 지정한 추가사진 파일명을 우선해 연결한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'listing-same-bytes-'));try{
  const dataRoot=path.join(root,'data'),desktop=path.join(root,'desktop'),product={style:'115928',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=extras',colors:['01블랙','02미드나잇'],images:{}};
  const folder=path.join(desktop,'상품등록기사진폴더',product.style),draftRoot=path.join(dataRoot,'smartstore-details',product.style);await mkdir(folder,{recursive:true});
  const main=await sharp({create:{width:75,height:100,channels:3,background:'#111'}}).jpeg().toBuffer(),extra=await sharp({create:{width:75,height:100,channels:3,background:'#334'}}).jpeg().toBuffer();
  await writeFile(path.join(folder,'1.jpg'),main);await writeFile(path.join(folder,'front.jpg'),extra);await writeFile(path.join(folder,'same-bytes.jpg'),extra);
  const listingImages=await saveListingSelection(draftRoot,{main:photo('1.jpg','01블랙','front',main),extras:[photo('front.jpg','02미드나잇','front',extra)]});
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...product,listingImages}));const result=await prepareListingImages(product,root,{dataRoot,desktop});assert.equal(result.extras.length,1);assert.equal(result.manifest.extras[0].sourceName,'front.jpg');assert.deepEqual(await readFile(path.join(folder,'same-bytes.jpg')),extra);
 }finally{await rm(root,{recursive:true,force:true});}
});
