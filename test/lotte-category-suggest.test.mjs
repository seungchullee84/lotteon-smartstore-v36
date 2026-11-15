import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {suggestMissingLotteCategory,LOTTE_CATEGORY_FIELDS} from '../lotte-category-suggest.mjs';
import {saveCategoryMatch,loadCategoryCache,categoryKey} from '../category-cache.mjs';
import {productClassification} from '../product.mjs';
import {bridgeLotteCategory} from '../lotte-category-bridge.mjs';
const product=(gender,rawName,section='TOP')=>({gender,rawName,name:rawName,sourceCategory:[gender==='남성'?'MEN':'WOMEN',section],category:{commonMiddle:'',commonSmall:'',channelMiddle:'',channelSmall:''}});

test('076916 and other coats under MEN/WOMEN ALL get a complete first-derived automatic path',()=>{
 for(const [style,gender,title] of [['076916','남성','[변우석] 울캐시미어 발마칸 코트'],['076917','남성','울캐시미어 롱 코트'],['375916','여성','울 블렌드 코트']]){
  const p={...product(gender,title,'ALL'),style},result=suggestMissingLotteCategory(p);
  assert.deepEqual(result.missing,[],style);
  assert.match(result.category.commonSmall,new RegExp(gender+'코트$'));
  const bridged=bridgeLotteCategory({...p,category:result.category});assert.equal(bridged.complete,true);
  assert.equal(bridged.category.channelMajor,'브랜드'+gender+'의류');assert.equal(bridged.category.channelMiddle,'자켓/코트');
  assert.ok(bridged.category.channelCodes.small);assert.equal(bridged.category.manualSelection,undefined);
  const classified=productClassification('<div class="navi"><a>Home</a><a class="prdpath1">'+(gender==='남성'?'MEN':'WOMEN')+'</a><a>ALL</a><a>'+title+'</a></div>');
  assert.match(classified.category.commonSmall,new RegExp(gender+'코트$'));
 }
 assert.notEqual(suggestMissingLotteCategory(product('남성','트리코트 팬츠','ALL')).category.channelMiddle,'자켓/코트');
});
test('남성 플리스 집업은 실제 집업점퍼 경로를 적용하고 다른 형태와 구분한다',()=>{
 const current={...product('남성','NEW 플리스 목넥 집업'),style:'026992',sourceCategory:['신상품','남성']};
 const similar={...product('남성','후리스 하이넥 집업 재킷','OUTER'),sourceCategory:['MEN','OUTER','캐주얼재킷']};
 for(const item of [current,similar]){
  const {category,missing}=suggestMissingLotteCategory(item);
  assert.deepEqual(missing,[]);
  assert.equal(category.commonMiddle,'M0010 : 남성의류아우터');
  assert.equal(category.commonSmall,'00689 : 남성점퍼');
  assert.equal(category.channelMiddle,'점퍼/패딩/야상');
  assert.equal(category.channelSmall,'집업점퍼');
  assert.equal(category.channelCodes.small,'BC31090300');
 }
 for(const [gender,title,section] of [['남성','플리스 후드 집업','OUTER'],['남성','플리스 하프 집업','OUTER'],['남성','플리스 집업 조끼','OUTER'],['남성','플리스 스웻 팬츠','PANTS'],['여성','플리스 목넥 집업','OUTER']]){
  assert.notEqual(suggestMissingLotteCategory(product(gender,title,section)).category.channelSmall,'집업점퍼');
 }
 const chosen={...current,category:{...current.category,channelSmall:'캐주얼자켓'}};
 assert.equal(suggestMissingLotteCategory(chosen).category.channelSmall,'캐주얼자켓');
});
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
