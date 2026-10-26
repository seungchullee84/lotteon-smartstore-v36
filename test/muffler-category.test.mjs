import test from 'node:test';
import assert from 'node:assert/strict';
import {productClassification,repairCategoryFields} from '../product.mjs';
const html=(title,gender='WOMEN')=>`<div class="navi"><a>Home</a><a class="prdpath1">${gender}</a><a>ACC</a><a>${title}</a></div>`;
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
