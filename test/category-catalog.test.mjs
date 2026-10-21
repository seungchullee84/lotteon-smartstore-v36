import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog,standardPaths,resolveCatalogCategory} from '../category-catalog.mjs';
const catalog=loadCatalog();
const common=JSON.parse(readFileSync(new URL('../data/category-catalog-common.json',import.meta.url),'utf8'));
test('남녀 표준분류 전체 경로와 코드를 수집했고 성별이 섞이지 않음',()=>{
 assert.equal(catalog.complete,true);
 const paths=['여성','남성'].flatMap(g=>standardPaths(catalog,g));
 assert.equal(paths.length,129);assert.equal(new Set(paths.map(p=>p.small.code)).size,129);
 for(const path of paths){assert.match(path.major.code,/^BC\d+$/);assert.match(path.middle.code,/^BC\d+$/);assert.match(path.small.code,/^BC\d+$/);}
});
test('115939 기모바지는 실제 남성캐주얼바지 코드와 기모팬츠 경로를 사용',()=>{
 const r=resolveCatalogCategory({gender:'남성',rawName:'스트레이트 브러시드 이지 팬츠',sourceCategory:['MEN','PANTS','밴딩팬츠'],category:{commonMiddle:'남성의류하의',commonSmall:'남성바지',channelMiddle:'바지',channelSmall:'기모팬츠'}},catalog,common);
 assert.equal(r.category.commonSmall,'00683 : 남성캐주얼바지');assert.equal(r.category.channelCodes.small,'BC31050100');assert.equal(r.path.major.name,'브랜드남성의류');
});
test('같은 긴팔티 소분류도 성별마다 실제 중분류 경로를 사용',()=>{
 for(const gender of ['남성','여성']){
  const r=resolveCatalogCategory({gender,rawName:'라운드 긴팔티',category:{channelMiddle:'티셔츠/맨투맨',channelSmall:'라운드넥티셔츠'}},catalog,common);
  assert.equal(r.path.major.name,'브랜드'+gender+'의류');
  assert.equal(r.category.channelMiddle,gender==='남성'?'긴팔티셔츠/맨투맨':'티셔츠/맨투맨');
 }
});
test('불명확한 상품은 없는 세분류나 임의 경로를 만들지 않음',()=>{
 const r=resolveCatalogCategory({gender:'여성',rawName:'상품',category:{channelMiddle:'미확인',channelSmall:'미확인'}},catalog,common);
 assert.equal(r.path,undefined);assert.match(r.status,/확인 필요/);
});

test('여성 맨투맨을 남방셔츠로 분류하지 않음',()=>{const r=resolveCatalogCategory({gender:'여성',name:'여성 맨투맨',category:{channelMiddle:'티셔츠/맨투맨',channelSmall:'맨투맨'}});assert.equal(r.category.commonSmall,'00843 : 여성티셔츠/탑');});
