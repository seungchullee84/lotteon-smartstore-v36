import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {pointPicker,savePointSelection} from '../smartstore-point-picker.mjs';import {reviewSellingPoints} from '../smartstore-selling-point-review.mjs';
test('공식 후보 5개 중 고른 순서를 저장하고 템플릿 검토에서도 선택을 유지한다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'point-picker-'));const text='부드러운 코튼 원단으로 편안한 착용감을 제공합니다.\n여유 있는 와이드 핏으로 편안하게 입을 수 있습니다.\n밑단 스트링으로 핏 조절이 가능합니다.\n포켓으로 소지품을 간편하게 수납합니다.\n기모 가공으로 따뜻한 보온성을 더했습니다.';
 const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test'},options={dataRoot,sourceOverride:{text,detailHash:null}};
 try{const picker=await pointPicker(product,dataRoot,options);assert.equal(picker.candidates.length,5);const selectedIds=[4,0,2].map(i=>picker.candidates[i].id),input={style:product.style,channel:'smartstore',revision:picker.revision,selectedIds};await savePointSelection(product,dataRoot,input,options);
  const reopened=await pointPicker(product,dataRoot,options);assert.deepEqual(new Set(reopened.selectedIds),new Set(selectedIds));const review=await reviewSellingPoints(product,text,{dataRoot});assert.equal(review.method,'user-selected-official-points');assert.deepEqual(review.points.map(p=>p.title),[4,0,2].map(i=>picker.candidates[i].title));
  await assert.rejects(savePointSelection(product,dataRoot,{...input,selectedIds:['bad','bad','bad']},options));await assert.rejects(savePointSelection(product,dataRoot,{...input,revision:'stale'},options));await assert.rejects(savePointSelection(product,dataRoot,{...input,channel:'lotte'},options));
  const changed=await reviewSellingPoints(product,'부드러운 코튼 원단으로 편안하게 입습니다.',{dataRoot});assert.notEqual(changed.method,'user-selected-official-points');
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});

test('현재 원본 해시와 일치하는 이미지 검증 소구점을 사진 선택 후보에 연결한다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'image-point-picker-'));
 try{
  const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=review'},text='드롭 숄더와 여유로운 품으로 편안한 착용감을 연출합니다.';
  const point={title:'여유 있게 입는 편안함',description:'여유로운 품으로 편안하게 입어요.',evidence:text};
  const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(root,{recursive:true});
  await writeFile(path.join(root,'selling-point-image-review.json'),JSON.stringify({...product,version:1,detailHash:'current-image',text,points:[point]}));
  const options={dataRoot,sourceOverride:{text,detailHash:'current-image'}};
  const current=await pointPicker(product,dataRoot,options);assert(current.candidates.some(p=>p.title===point.title));
  const changed=await pointPicker(product,dataRoot,{...options,sourceOverride:{text,detailHash:'changed-image'}});assert(!changed.candidates.some(p=>p.title===point.title));
  const wrongUrl=await pointPicker({...product,sourceUrl:product.sourceUrl+'-different'},dataRoot,options);assert(!wrongUrl.candidates.some(p=>p.title===point.title));
  await savePointSelection(product,dataRoot,{channel:'smartstore',style:product.style,revision:current.revision,selectedIds:[current.candidates[0].id]},options);
  const review=await reviewSellingPoints(product,text,{dataRoot,detailHash:'current-image'});assert.equal(review.method,'user-selected-official-points');assert.equal(review.points.length,1);
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});

test('공식 근거가 없을 때만 자동 생략하고 다른 상품의 장점은 가져오지 않는다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'empty-point-picker-'));
 try{
  const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=empty'};
  const empty=await pointPicker(p,dataRoot,{dataRoot,sourceOverride:{text:'면 100%. SIZE S M L.',detailHash:null}});
  assert.deepEqual(empty.candidates,[]);assert.equal(empty.omit,true);assert.equal(empty.autoOmitted,true);
  const text='적당한 여유의 실루엣과 안정적인 기장감으로 편안한 착용감을 제공하며, CVC 프렌치 테리 소재를 사용해 부드러운 터치감과 우수한 내구성을 갖추었습니다. 다양한 스타일링이 가능한 데일리 스웨트셔츠입니다.';
  const enough=await pointPicker(p,dataRoot,{dataRoot,sourceOverride:{text,detailHash:null}});
  assert(enough.candidates.length>=3);assert.equal(enough.omit,false);assert(enough.candidates.every(point=>text.includes(point.evidence)));
  const other=await pointPicker({...p,style:'654321'},dataRoot,{dataRoot,sourceOverride:{text:'상품 기본정보',detailHash:null}});assert.equal(other.candidates.length,0);
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
