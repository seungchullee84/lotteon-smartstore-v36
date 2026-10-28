import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {suggestMissingLotteCategory,LOTTE_CATEGORY_FIELDS} from '../lotte-category-suggest.mjs';
import {saveCategoryMatch,loadCategoryCache,categoryKey} from '../category-cache.mjs';
const product=(gender,rawName,section='TOP')=>({gender,rawName,name:rawName,sourceCategory:[gender==='남성'?'MEN':'WOMEN',section],category:{commonMiddle:'',commonSmall:'',channelMiddle:'',channelSmall:''}});
test('공란 여성 후드 집업은 실제 여성 목록의 유사 경로로 완성한다',()=>{
 const result=suggestMissingLotteCategory(product('여성','플리스 후드 집업'));
 assert.deepEqual(result.missing,[]);assert.equal(result.category.channelSmall,'후드티/후드집업');assert.equal(result.category.commonSmall,'00843 : 여성티셔츠/탑');
});
test('남성 내의는 일반 티셔츠 분류 대신 사용자 확인 경로로 완성한다',()=>{
 const result=suggestMissingLotteCategory(product('남성','지워머 크루넥 긴팔티','INNERWEAR'));
 assert.deepEqual(result.missing,[]);assert.equal(result.category.channelMajor,'남성의류');assert.equal(result.category.channelSmall,'남성내의');
});
test('이미 입력된 완전한 분류는 변경하지 않으며 모호한 상품은 임의 분류하지 않는다',()=>{
 const p=product('남성','알 수 없는 상품');p.category=Object.fromEntries(LOTTE_CATEGORY_FIELDS.map(key=>[key,'직접 선택']));
 assert.deepEqual(suggestMissingLotteCategory(p).category,p.category);
 assert.equal(suggestMissingLotteCategory(product('남성','알 수 없는 상품')).missing.length,4);
 const missingGender=product('남성','후드 집업');missingGender.gender='';assert.equal(suggestMissingLotteCategory(missingGender).missing.length,4);
});
test('같은 종류의 다른 품번도 실제 선택 성공 후 저장한 분류 매칭을 재사용할 수 있다',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lotte-category-learn-'));
 try{
  const first={...product('여성','플리스 후드 집업'),style:'326929'};first.category=suggestMissingLotteCategory(first).category;
  assert.equal((await loadCategoryCache(dir)).matches.length,0);
  await saveCategoryMatch(dir,categoryKey(first),{major:'브랜드여성의류',middle:first.category.channelMiddle,small:first.category.channelSmall},first.style);
  const next={...first,style:'326930'};assert((await loadCategoryCache(dir)).matches.some(match=>match.key===categoryKey(next)));
 }finally{await rm(dir,{recursive:true,force:true});}
});
