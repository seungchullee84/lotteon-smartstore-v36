import test from 'node:test';
import assert from 'node:assert/strict';
import {productClassification,repairCategoryFields} from '../product.mjs';
import {validateLotteCategory} from '../lotte-category-validation.mjs';
import {suggestMissingLotteCategory} from '../lotte-category-suggest.mjs';
const classify=(gender,title,section='ALL')=>{
 const html='<div class="navi"><a>Home</a><a class="prdpath1">'+(gender==='남성'?'MEN':'WOMEN')+'</a><a>'+section+'</a><a>'+title+'</a></div>';
 const p={rawName:title,name:title,...productClassification(html)};repairCategoryFields(p);return p;
};
test('garment-specific regression cases keep first and second categories as one pair',()=>{
 for(const [gender,title,leaf] of [
 ['남성','버튼다운 체크 셔츠','체크셔츠'],['여성','버튼다운 체크 셔츠','체크셔츠'],
 ['남성','면 라운드 3팩 반팔 기본 티셔츠 243801','라운드넥반팔티'],
 ['남성','브이넥 반팔 티셔츠','브이넥반팔티'],['남성','카라 반팔 티셔츠','카라반팔티'],
 ['남성','브이넥 긴팔 티셔츠','브이넥티셔츠'],['남성','패딩 조끼','패딩조끼'],
 ['여성','니트 롱 원피스','니트원피스'],['여성','롱 스커트','롱스커트'],['여성','레깅스','레깅스'],
 ['여성','데님 반바지','청반바지'],['남성','데님 반바지','청반바지'],
 ['여성','데님 레귤러핏 긴팔 셔츠 346907','데님셔츠'],
 ['남성','지워머 긴팔 내의','남성내의'],['남성','지워머 발열 레깅스','남성내의'],
 ['여성','나일론 퀼팅 머플러','머플러'],['남성','가죽 벨트','남성벨트'],
 ]){
   const p=classify(gender,title);assert.equal(p.category.channelSmall,leaf,title);const v=validateLotteCategory(p);assert.equal(v.ready,true,title+': '+JSON.stringify(v.issues));
 }
});
test('previously saved short sleeves under long sleeves are rejected even with valid category codes',()=>{
 const p=classify('남성','라운드 긴팔 티셔츠');p.rawName='면 라운드 3팩 반팔 기본 티셔츠 243801';
 assert.ok(validateLotteCategory(p).issues.some(i=>i.code==='sleeve-conflict'));
});
test('uncollected underwear and accessory types never become arbitrary apparel categories',()=>{
 for(const [gender,title] of [['여성','지워머 발열 내의'],['여성','브라'],['남성','드로즈'],['남성','볼캡'],['여성','버킷햇'],['남성','양말'],['여성','장갑'],['남성','가방']]){
   const p=classify(gender,title),result=suggestMissingLotteCategory(p);assert.equal(validateLotteCategory({...p,category:result.category}).ready,false,title);
 }
});
test('partial user entries do not get a child from a contradictory parent',()=>{
 const p={gender:'여성',rawName:'후드 티셔츠',sourceCategory:['WOMEN','TOP'],category:{channelMiddle:'청바지'}};
 const s=suggestMissingLotteCategory(p);assert.equal(s.category.channelMiddle,'청바지');assert.ok(s.missing.length);assert.equal(validateLotteCategory({...p,category:s.category}).ready,false);
});
