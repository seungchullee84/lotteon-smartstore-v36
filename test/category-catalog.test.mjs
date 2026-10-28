import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog,standardPaths,resolveCatalogCategory} from '../category-catalog.mjs';
const catalog=loadCatalog();
const common=JSON.parse(readFileSync(new URL('../data/category-catalog-common.json',import.meta.url),'utf8'));
test('나일론 퀼팅 머플러 공란은 실제 확인한 소재 제한 없는 머플러 경로로 채운다',()=>{
 const {category}=resolveCatalogCategory({gender:'남성',rawName:'나일론 퀼팅 머플러',sourceCategory:['MEN','ACC'],category:{}},catalog,common);
 assert.equal(category.channelMajor,'브랜드잡화/넥타이');assert.equal(category.channelMiddle,'워머/목도리');assert.equal(category.channelSmall,'머플러');assert.equal(category.channelCodes.small,'BC35100100');
 assert.equal(category.commonSmall,'01068 : 머플러');
});
test('남성 내의는 공통·채널 대분류까지 사용자 확인 경로를 사용하고 의류 목록으로 덮어쓰지 않는다',()=>{
 const p={gender:'남성',rawName:'지워머 크루넥 긴팔티',sourceCategory:['MEN','INNERWEAR'],category:{channelMajor:'브랜드남성의류',channelMiddle:'티셔츠/맨투맨',channelSmall:'라운드넥티셔츠',channelCodes:{major:'old'}}};
 const {category}=resolveCatalogCategory(p,catalog,common);
 assert.equal(category.commonMajor,'L0014 : 남성의류');assert.equal(category.commonMiddle,'M0059 : 남성속옷');assert.equal(category.commonSmall,'00715 : 남성내의');
 assert.equal(category.channelMajor,'남성의류');assert.equal(category.channelMiddle,'남성속옷');assert.equal(category.channelSmall,'남성내의');assert.equal(category.channelCodes,undefined);
});
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

test('기모 데님은 기모팬츠 대신 청바지의 실제 핏 경로를 우선',()=>{for(const [title,fit] of [['NEW 브러시드 배럴핏 데님','부츠컷/와이드핏'],['브러시드 스트레이트 데님','스트레이트핏'],['기모 슬림 데님','스키니/슬림핏']]){const r=resolveCatalogCategory({gender:'여성',rawName:title,sourceCategory:['WOMEN','PANTS','데님'],category:{channelMiddle:'바지',channelSmall:'기모팬츠'}},catalog,common);assert.equal(r.category.channelMiddle,'청바지');assert.equal(r.category.channelSmall,fit);assert.equal(r.category.commonSmall,'00852 : 여성청바지');assert.ok(r.path);}});

test('여성 기모 테리 조거는 트레이닝복과 실제 트레이닝하의로 연결',()=>{const r=resolveCatalogCategory({gender:'여성',name:'여성 기모 테리 조거 바지 416970',sourceCategory:['WOMEN','PANTS','트레이닝/스웻팬츠'],category:{channelMiddle:'바지/레깅스',channelSmall:'기모팬츠'}},catalog,common);assert.equal(r.category.channelMiddle,'트레이닝복');assert.equal(r.category.channelSmall,'트레이닝하의');assert.equal(r.category.channelCodes.small,'BC34140300');});

test('남성 기모 트레이닝은 트레이닝 매칭보다 사용자 확인 기모팬츠 경로를 우선한다',()=>{const r=resolveCatalogCategory({gender:'남성',rawName:'브러시드 테리 스웻 팬츠',sourceCategory:['MEN','PANTS','트레이닝/스웻팬츠'],category:{channelMiddle:'트레이닝복',channelSmall:'트레이닝하의'}},catalog,common);assert.equal(r.category.channelMiddle,'바지');assert.equal(r.category.channelSmall,'기모팬츠');assert.equal(r.path.small.code,'BC31050100');});
