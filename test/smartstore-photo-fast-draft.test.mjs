import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';
import {classifyFastPhotoDraft} from '../smartstore-photo-fast-draft.mjs';
import {prefillPhotoColors} from '../smartstore-photo-color-draft.mjs';
import {photoReview,savePhotoReviewDraft} from '../smartstore-photo-review.mjs';

test('새 사진은 축소 표본으로 초안을 만들고 글자 후보만 OCR하며 라벨·수동 선택·원본 변경을 구분한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fast-photo-')),folder=path.join(root,'official'),photoRoots=[path.join(root,'photos')];await mkdir(folder);await mkdir(photoRoots[0]);
 const product={style:'123456',name:'스웻 팬츠',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=fast',colors:['01블랙','02그레이'],colorChips:[{name:'01블랙',url:'https://www.giordano.co.kr/0512345601.jpg'},{name:'02그레이',url:'https://www.giordano.co.kr/0512345602.jpg'}]};
 const jpeg=color=>sharp({create:{width:320,height:480,channels:3,background:color}}).jpeg().toBuffer();
 try{
  const black=await jpeg('#141414'),gray=await jpeg('#aaaaaa');await writeFile(path.join(folder,'colorchip-0.jpg'),black);await writeFile(path.join(folder,'colorchip-1.jpg'),gray);await writeFile(path.join(folder,'color-chips.json'),JSON.stringify(product.colors.map((name,i)=>({name,file:'colorchip-'+i+'.jpg'}))));
  let marks='';for(let y=40;y<420;y+=12)for(let x=90;x<230;x+=8)marks+=`<rect x="${x}" y="${y}" width="3" height="5"/>`;
  const label=await sharp(Buffer.from(`<svg width="320" height="480"><rect width="320" height="480" fill="white"/>${marks}</svg>`)).png().toBuffer();
  const photos=[{name:'a.jpg',bytes:black},{name:'b.jpg',bytes:gray},{name:'20261107.jpg',bytes:label}],options={folder,dataRoot:root};let calls=0;
  const recognizePhoto=async bytes=>{calls++;assert.deepEqual(bytes,label);return '제조국 베트남 혼용률 면60% 취급주의 표시';};
  const result=await classifyFastPhotoDraft(product,photos,{...options,recognizePhoto});assert.equal(calls,1);assert.deepEqual(result.map(p=>p.color),['01블랙','02그레이','']);assert.deepEqual(result.map(p=>p.role),['detail','detail','care-label']);assert(result.slice(0,2).every(p=>p.needsReview&&!p.reviewed));
  await classifyFastPhotoDraft(product,photos,{...options,recognizePhoto:()=>assert.fail('동일 원본 재판독')});
  await classifyFastPhotoDraft({...product,sourceUrl:product.sourceUrl+'other'},photos,{...options,recognizePhoto});assert.equal(calls,2,'다른 공식 상품의 결론 재사용 금지');
  const replacement=await classifyFastPhotoDraft(product,[{...photos[0],bytes:gray}],options);assert.equal(replacement[0].color,'02그레이');
  for(const photo of photos)await writeFile(path.join(photoRoots[0],photo.name),photo.bytes);
  let review=await photoReview(product,{dataRoot:root,photoRoots});await savePhotoReviewDraft(product,{...review,channel:'smartstore',items:review.items.map(i=>({...i,role:'detail',roleOverride:false}))},{dataRoot:root,photoRoots});
  await prefillPhotoColors(product,folder,{dataRoot:root,photoRoots,classify:(_,items,o)=>classifyFastPhotoDraft(product,items,{...o,recognizePhoto})});
  review=await photoReview(product,{dataRoot:root,photoRoots});assert.equal(review.items.find(i=>i.name==='20261107.jpg').role,'care-label','自動保存された初期detailはラベルを隠さない');
  const manual={...review,channel:'smartstore',items:review.items.map(i=>({...i,color:'02그레이',role:'front',colorOverride:true,roleOverride:true}))};await savePhotoReviewDraft(product,manual,{dataRoot:root,photoRoots});assert.notEqual((await photoReview(product,{dataRoot:root,photoRoots})).items.find(i=>i.name==='20261107.jpg').role,'care-label','사용자 라벨 오판 수정 유지');
  const controller=new AbortController();controller.abort();await assert.rejects(classifyFastPhotoDraft(product,photos,{...options,signal:controller.signal}),{name:'AbortError'});
 }finally{await rm(root,{recursive:true,force:true});}
});
