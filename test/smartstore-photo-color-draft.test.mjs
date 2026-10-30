import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';
import {prefillPhotoColors} from '../smartstore-photo-color-draft.mjs';import {photoReview,savePhotoReviewDraft,numberedPhotoColors} from '../smartstore-photo-review.mjs';
import {classifyLocalPhotos} from '../smartstore-local-photo.mjs';import {LOCAL_PHOTO_POLICY,refineNeutralDraftColors} from '../smartstore-local-photo-policy.mjs';
test('조명이 어두운 무채색 사진도 같은 상품의 명도 묶음을 비교하며 확정으로 표시하지 않는다',()=>{const q=v=>Array.from({length:3},()=>[v-10,v,v+10]),rows=[70,80,130,140,170,180].map(v=>({quantiles:q(v),colorResult:{color:'03다크그레이'}}));refineNeutralDraftColors(rows,['01화이트','02그레이','03다크그레이'],[234,217,106].map(v=>({quantiles:q(v)})));assert.deepEqual(rows.map(r=>r.colorResult.color),['03다크그레이','03다크그레이','02그레이','02그레이','01화이트','01화이트']);assert(rows.every(r=>r.colorResult.supported===false));});
test('색상 초안 캐시는 구도까지 분석한 확정 후보 캐시와 분리한다',async()=>{const dataRoot=await mkdtemp(path.join(os.tmpdir(),'color-cache-'));try{let calls=0;const p={style:'026512',name:'남성 맨투맨',colors:['01그레이'],sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=color'},photos=[{name:'a.jpg',bytes:Buffer.from('new-color-source'),file:path.join(dataRoot,'a.jpg')}],predict=async()=>{calls++;return [{method:LOCAL_PHOTO_POLICY,status:'needs-review',role:'detail',color:'01그레이',evidence:{coverage:.3}}];};assert.equal((await classifyLocalPhotos(p,photos,{dataRoot,predict,draftColors:true})).length,1);assert.equal((await classifyLocalPhotos(p,photos,{dataRoot,predict})).length,0);assert.equal(calls,2);}finally{await rm(dataRoot,{recursive:true,force:true});}});
test('공식 색상명은 보존하고 색상번호 1~99로 정렬한다',()=>{assert.deepEqual(numberedPhotoColors(['99블랙','10네이비','2그레이','01베이지','색상미정']),['01베이지','2그레이','10네이비','99블랙','색상미정']);});
test('새 상품 색상 초안은 자동 반영하고 수동 변경·공란 지정을 보존하며 템플릿을 제작하지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'color-draft-')),dataRoot=path.join(root,'data'),folder=path.join(root,'photos');await mkdir(folder);
 const p={style:'026511',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=new',colors:['01그레이','02블랙']},options={dataRoot,photoRoots:[folder]};
 try{
  for(const [name,color] of [['1.jpg','gray'],['b.jpg','black']])await writeFile(path.join(folder,name),await sharp({create:{width:90,height:120,channels:3,background:color}}).jpeg().toBuffer());
  const result=await prefillPhotoColors(p,folder,{...options,classify:async(_,photos,o)=>{assert(o.draftColors);return photos.map((f,i)=>({...f,color:p.colors[i],role:'front'}));}});assert.equal(result.filled,2);
  let r=await photoReview(p,options);assert.deepEqual(r.items.map(i=>i.color),p.colors);assert(r.items.every(i=>i.role==='detail'&&i.roleDefaulted&&!i.reviewed));await assert.rejects(readFile(path.join(dataRoot,'smartstore-details',p.style,'draft.json')),e=>e.code==='ENOENT');
  const payload={...r,channel:'smartstore',items:r.items.map((i,n)=>({...i,color:n?'':'02블랙',colorOverride:true}))};await savePhotoReviewDraft(p,payload,options);
  await prefillPhotoColors(p,folder,{...options,classify:async()=>assert.fail('수동으로 선택한 원본은 재판독하지 않는다')});r=await photoReview(p,options);assert.equal(r.items[0].color,'02블랙');assert.equal(r.items[1].color,'');
 }finally{await rm(root,{recursive:true,force:true});}
});
