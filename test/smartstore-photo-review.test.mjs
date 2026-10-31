import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {photoReview,savePhotoReview,validatePhotoReview,photoReviewThumbnail,savePhotoReviewDraft} from '../smartstore-photo-review.mjs';
import {readPhotoMappings} from '../smartstore-photo-mapping-cache.mjs';
import {findPhotos} from '../smartstore-photo-files.mjs';
import {createHash} from 'node:crypto';
import {prepareTrustedFolder} from '../smartstore-folder-trust.mjs';

test('신규 원본 선택 저장·재열기·케어라벨 오판 수정 및 원본 변경 방어',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'photo-review-'));const dataRoot=path.join(root,'data'),folder=path.join(root,'photos');await mkdir(folder);
 const p={style:'076922',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',colors:['01그레이','02블랙']},options={dataRoot,photoRoots:[folder]};
 try{
  const a=await sharp({create:{width:80,height:120,channels:3,background:'gray'}}).jpeg().toBuffer(),b=await sharp({create:{width:80,height:120,channels:3,background:'black'}}).jpeg().toBuffer();await writeFile(path.join(folder,'1.jpg'),a);await writeFile(path.join(folder,'b.jpg'),b);
  const current=await photoReview(p,options);assert.equal(current.items.length,2);assert(current.items.every(i=>i.role==='detail'&&i.roleDefaulted&&!i.reviewed));
  let input={...current,channel:'smartstore',items:current.items.map((i,n)=>({...i,color:p.colors[n],role:n?'care-label':'front'}))};
  assert.throws(()=>validatePhotoReview(current,{...input,channel:'lotte'}));assert.throws(()=>validatePhotoReview(current,{...input,revision:'old'}));assert.throws(()=>validatePhotoReview(current,{...input,items:[input.items[0],input.items[0]]}));
  await savePhotoReview(p,input,options);let next=await photoReview(p,options);assert.equal(next.items[1].role,'care-label');assert((await readPhotoMappings(dataRoot,p)).every(i=>i.reviewed));
  input={...next,channel:'smartstore',items:next.items.map((i,n)=>({...i,color:p.colors[n],role:n?'back':'front'}))};await savePhotoReview(p,input,options);next=await photoReview(p,options);assert.equal(next.items[1].role,'front');assert.equal(JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json'))).careLabels.length,0);assert.deepEqual(await readFile(path.join(folder,'1.jpg')),a);
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

test('색상만 선택한 중간 상태도 저장·복원하며 템플릿용 확정 연결을 만들지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'review-draft-')),dataRoot=path.join(root,'data'),folder=path.join(root,'photos');await mkdir(folder);
 const p={style:'115927',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=draft',colors:['01블랙','02그레이']},options={dataRoot,photoRoots:[folder]};
 try{
  await writeFile(path.join(folder,'1.jpg'),await sharp({create:{width:80,height:120,channels:3,background:'black'}}).jpeg().toBuffer());
  const current=await photoReview(p,options),input={...current,channel:'smartstore',items:current.items.map(i=>({...i,color:'02그레이',role:''}))};await savePhotoReviewDraft(p,input,options);
  const reopened=await photoReview(p,options);assert.equal(reopened.items[0].color,'02그레이');assert.equal(reopened.items[0].role,'front');assert(reopened.selectionSavedAt);assert.equal((await readPhotoMappings(dataRoot,p)).length,0);
  await assert.rejects(savePhotoReviewDraft(p,{...input,channel:'lotte'},options));await assert.rejects(savePhotoReviewDraft(p,{...input,sourceUrl:p.sourceUrl+'other'},options));
  await savePhotoReview(p,input,options);assert.equal((await photoReview(p,options)).items[0].role,'front');
  await writeFile(path.join(folder,'1.jpg'),await sharp({create:{width:80,height:120,channels:3,background:'white'}}).jpeg().toBuffer());const changed=await photoReview(p,options);assert.equal(changed.items[0].color,'');assert.equal(changed.selectionSavedAt,null);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('동일 사진의 사본만 제외해도 대표 원본은 유지하고 재열기·상세 제작에 파일별 선택을 적용한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'duplicate-photo-review-')),dataRoot=path.join(root,'data'),folder=path.join(root,'photos'),output=path.join(root,'output');await mkdir(folder);await mkdir(output);
 const p={style:'123458',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=duplicate',name:'상의',images:{},colors:['01블랙']},options={dataRoot,photoRoots:[folder]};
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 try{
  const original=await sharp({create:{width:80,height:120,channels:3,background:'black'}}).jpeg().toBuffer(),detail=await sharp({create:{width:80,height:120,channels:3,background:'gray'}}).jpeg().toBuffer();
  await writeFile(path.join(folder,'1.jpg'),original);await writeFile(path.join(folder,'copy.jpg'),original);await writeFile(path.join(folder,'detail.jpg'),detail);
  const current=await photoReview(p,options),input={...current,channel:'smartstore',items:current.items.map(item=>({...item,color:p.colors[0],role:item.name==='1.jpg'?'front':item.name==='copy.jpg'?'excluded':'detail'}))};
  const conflict={...input,items:input.items.map(item=>item.name==='copy.jpg'?{...item,role:'back'}:item)};
  assert.throws(()=>validatePhotoReview(current,conflict),/1\.jpg.*copy\.jpg.*색상·구도/);
  await savePhotoReviewDraft(p,input,options);assert.equal((await findPhotos(p,options)).length,3,'자동 저장만으로 실제 사진 선택을 바꾸지 않는다');
  await savePhotoReview(p,input,options);
  const photos=await findPhotos(p,options),mappings=await readPhotoMappings(dataRoot,p);
  assert.deepEqual(photos.map(photo=>photo.name),['1.jpg','detail.jpg']);assert.equal((await findPhotos(p,{...options,includeExcluded:true})).length,3);
  assert.equal(mappings.find(record=>record.hash===digest(original)).role,'front','제외한 사본이 대표 원본 해시 매핑을 덮어쓰지 않는다');
  const reopened=await photoReview(p,options);assert.equal(reopened.items.find(item=>item.name==='copy.jpg').role,'excluded');assert.equal(reopened.items.find(item=>item.name==='1.jpg').role,'front');assert.equal(reopened.mainId,current.mainId);
  const old=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json'),'utf8'));
  const prepared=await prepareTrustedFolder(p,output,{dataRoot,photos,mapped:photos.map(photo=>({...photo,...mappings.find(record=>record.hash===digest(photo.bytes))})),old,description:'',detailHash:null,recognizePhoto:()=>assert.fail('직접 선택한 사진 재분석 금지')});
  assert.equal(prepared.smartstoreDetail.photoCount,2);assert.deepEqual(prepared.smartstoreDetail.storeColorPhotoHashes[p.colors[0]],[digest(original),digest(detail)]);
  assert.deepEqual(await readFile(path.join(folder,'1.jpg')),original);assert.deepEqual(await readFile(path.join(folder,'copy.jpg')),original);
  assert.equal((await findPhotos({...p,sourceUrl:p.sourceUrl+'-changed'},options)).length,3,'다른 공식 주소에 이전 제외 선택을 적용하지 않는다');
  const changed=await sharp({create:{width:80,height:120,channels:3,background:'white'}}).jpeg().toBuffer();await writeFile(path.join(folder,'copy.jpg'),changed);
  assert.equal((await findPhotos(p,options)).length,3,'내용이 바뀐 파일에 이전 제외 선택을 적용하지 않는다');assert.notEqual((await photoReview(p,options)).items.find(item=>item.name==='copy.jpg').role,'excluded');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('색상 안에서 선택한 사진 순서를 저장·재열기·반영해도 대표사진과 공식 색상을 보존한다',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'review-order-')),dataRoot=path.join(root,'data'),folder=path.join(root,'photos');await mkdir(folder);const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=order',colors:['01화이트']},options={dataRoot,photoRoots:[folder]};try{for(const [name,color] of [['1.jpg','white'],['2.jpg','gray'],['3.jpg','black']])await writeFile(path.join(folder,name),await sharp({create:{width:80,height:120,channels:3,background:color}}).jpeg().toBuffer());const r=await photoReview(p,options),order=[r.items[2],r.items[0],r.items[1]],input={...r,channel:'smartstore',items:order.map(i=>({...i,color:p.colors[0],role:i.main?'front':'detail'}))};await savePhotoReviewDraft(p,input,options);assert.deepEqual((await photoReview(p,options)).items.map(i=>i.id),order.map(i=>i.id));await savePhotoReview(p,input,options);const d=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json')));assert.deepEqual(d.manualPhotoOrder.groups[0].hashes,order.map(i=>i.hash));const next=await photoReview(p,options);assert.deepEqual(next.items.map(i=>i.id),order.map(i=>i.id));assert.equal(next.mainId,r.mainId);assert.deepEqual(p.colors,['01화이트']);const output=path.join(root,'output');await mkdir(output);const {prepareTrustedFolder}=await import('../smartstore-folder-trust.mjs');const photos=await findPhotos(p,options),mappings=await readPhotoMappings(dataRoot,p);const {createHash}=await import('node:crypto');const prepared=await prepareTrustedFolder({...p,images:{},name:'상의'},output,{dataRoot,photos,mapped:photos.map(photo=>({...photo,...mappings.find(record=>record.hash===createHash('sha256').update(photo.bytes).digest('hex'))})),old:d,description:'',detailHash:null,recognizePhoto:()=>assert.fail('확인된 사진 재분석 금지')});assert.deepEqual(prepared.smartstoreDetail.storeColorPhotoHashes[p.colors[0]],order.map(i=>i.hash));}finally{await rm(root,{recursive:true,force:true});}});
