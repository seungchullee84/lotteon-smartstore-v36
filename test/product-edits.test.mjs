import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {applyProductEdits,createProductEditStore,validateProductEdits} from '../product-edits.mjs';

test('품번별 직접 수정값만 저장하고 새 공식 사진·원문과 수정하지 않은 값은 갱신한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'register-product-edits-'));
 try{
  const store=createProductEditStore(root);
  await store.save({style:'026981',fields:{smartstoreName:'지오다노  직접 수정 026981',material:'면 60%, 폴리에스터 40%',consumerPrice:'39900',colors:'01틸그린, 04블랙',sizes:'L,XL',country:'한국'}},'026981');
  await store.save({style:'026981',fields:{washing:'손세탁'}},'026981');
  const fresh={style:'026981',sourceUrl:'https://www.giordano.co.kr/new-source',images:{main:'new.jpg'},officialDescription:'새 공식 원문',material:'공식 원문 소재',country:'베트남',manufactured:'2026-10',category:{commonMiddle:'기존'}};
  const result=await createProductEditStore(root).apply(fresh);
  assert.equal(result.smartstoreName,'지오다노  직접 수정 026981');assert.equal(result.smartstoreNameUserEdited,true);
  assert.equal(result.material,'면 60%, 폴리에스터 40%');assert.equal(result.consumerPrice,39900);
  assert.deepEqual(result.colors,['01틸그린','04블랙']);assert.deepEqual(result.sizes,['L','XL']);assert.equal(result.washing,'손세탁');
  assert.equal(result.manufactured,'2026-10');assert.deepEqual(result.images,fresh.images);assert.equal(result.officialDescription,fresh.officialDescription);assert.equal(fresh.country,'베트남');
  const other={...fresh,style:'026982'};assert.deepEqual(await store.apply(other),other);
  assert.throws(()=>applyProductEdits(other,{style:'026981',fields:{country:'한국'}}),/품번/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('이미지·출처·품번 등 공식 소유 필드와 잘못된 가격은 수정 자료로 받지 않는다',()=>{
 for(const fields of [{images:'임의 사진'},{sourceUrl:'https://example.com'},{style:'026982'},{consumerPrice:'NaN'},{consumerPrice:'-1'}])assert.throws(()=>validateProductEdits({style:'026981',fields}));
 assert.throws(()=>validateProductEdits({style:'../026981',fields:{}}));
 assert.throws(()=>validateProductEdits({style:'026981',fields:{country:'한국'}},'026982'),/품번/);
 assert.deepEqual(applyProductEdits({style:'026981'},{style:'026981',fields:{material:'',sizes:''}}).sizes,[],'직접 비운 입력칸도 공식값으로 되돌리지 않음');
});

test('빈 소재 수정 기록은 새 공식 판독값을 지우거나 소재 자동복구를 잠그지 않는다',()=>{
 for(const blank of ['', '  ']){
  const fresh={style:'326904',material:'아크릴 45%, 나일론 45%, 모 10%',name:'공식 상품명',country:'중국',sizes:['M']};
  const record={style:'326904',fields:{material:blank,name:'직접 수정한 상품명',country:'',sizes:''}};
  const result=applyProductEdits(fresh,record);
  assert.equal(result.material,fresh.material);
  assert.equal(Object.hasOwn(result.userEditedFields,'material'),false);
  assert.equal(result.name,'직접 수정한 상품명');
  assert.equal(result.country,'');
  assert.deepEqual(result.sizes,[]);
  assert.equal(record.fields.material,blank,'원래 수정 기록은 삭제하거나 변경하지 않음');
  assert.equal(fresh.country,'중국','원래 수집 결과는 변경하지 않음');
  const unreadable=applyProductEdits({...fresh,material:''},record);
  assert.equal(unreadable.material,'');
  assert.equal(Object.hasOwn(unreadable.userEditedFields,'material'),false);
 }
});
