import test from 'node:test';
import assert from 'node:assert/strict';
import {productClassification,repairCategoryFields} from '../product.mjs';
import {channelCategoryPath} from '../category.mjs';
import {resolveCatalogCategory} from '../category-catalog.mjs';
import {applyProductEdits} from '../product-edits.mjs';
const html=(title,gender='WOMEN')=>`<div class="navi"><a>Home</a><a class="prdpath1">${gender}</a><a>ACC</a><a>${title}</a></div>`;
test('확정 니트머플러 경로는 잡화로 연결하고 성별 의류 경로로 바꾸지 않음',()=>{
 const category=channelCategoryPath({channelSmall:'니트머플러',channelMajor:'브랜드여성의류',channelMiddle:'머플러',channelDetail:'과거값'});
 assert.equal(category.channelMajor,'잡화');assert.equal(category.channelMiddle,'워머/머플러');assert.equal(category.channelDetail,'');
 const p=applyProductEdits({style:'586903',name:'울 배색 머플러',gender:'여성',category:{}},{style:'586903',fields:{channelMiddle:'워머/머플러',channelSmall:'니트머플러'}});
 assert.equal(p.category.channelMajor,'잡화');
 const match=resolveCatalogCategory(p);assert.equal(match.category.channelMajor,'잡화');assert.equal(match.path,undefined);
 assert.equal(channelCategoryPath({channelSmall:'퍼머플러'}).channelMajor,undefined);
});
test('머플러 공통분류는 성별과 관계없이 확인된 패션/장신 경로 사용',()=>{
 for(const gender of ['WOMEN','MEN','UNISEX']){
  const {category}=productClassification(html('캐시터치 머플러',gender));
  assert.equal(category.commonMajor,'L0001 : 패션/장신');
  assert.equal(category.commonMiddle,'M0357 : 패션액세서리');
  assert.equal(category.commonSmall,'01068 : 머플러');
  assert.equal(category.channelMiddle,'');
 }
 assert.notEqual(productClassification(html('스카프')).category.commonSmall,'01068 : 머플러');
});
test('기존 머플러 자료도 공통분류 복구하며 별도 채널 분류를 추정하지 않음',()=>{
 const p={name:'캐시터치 머플러',gender:'여성',sourceCategory:['WOMEN','ACC'],category:{commonMiddle:'여성의류상의',commonSmall:'여성니트',channelMiddle:'직접선택',channelSmall:'직접선택'}};
 repairCategoryFields(p);
 assert.equal(p.category.commonSmall,'01068 : 머플러');
 assert.equal(p.category.commonMajor,'L0001 : 패션/장신');
 assert.equal(p.category.channelSmall,'직접선택');
});

test('입력칸에 밀려 저장된 대중소 분류도 공식 머플러 자료에서 복구',()=>{
 const p={rawName:'캐시터치 머플러',gender:'여성',sourceCategory:['WOMEN','ACC'],category:{commonMiddle:'패션/장신',commonSmall:'패션액세서리',channelMiddle:'머플러',channelSmall:'머플러'}};
 repairCategoryFields(p);
 assert.equal(p.category.commonMajor,'L0001 : 패션/장신');
 assert.equal(p.category.commonMiddle,'M0357 : 패션액세서리');
 assert.equal(p.category.commonSmall,'01068 : 머플러');
});
