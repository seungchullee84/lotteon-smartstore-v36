import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
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
