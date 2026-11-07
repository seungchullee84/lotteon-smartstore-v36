import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSmartstoreProductLink} from '../smartstore-product-link.mjs';

test('네이버 백화점·스마트스토어 상품 주소는 유지하고 추적 쿼리를 제거한다',()=>{
 const wide='https://shopping.naver.com/window-products/department/13857609430',jogger='https://shopping.naver.com/window-products/department/13857522426',store='https://smartstore.naver.com/store-name_1/products/13857522426';
 assert.equal(normalizeSmartstoreProductLink(wide),wide);
 assert.equal(normalizeSmartstoreProductLink(jogger+'?NaPm=ct%3Dabc%7Cci%3Dxyz&utm_source=detail'),jogger);
 assert.equal(normalizeSmartstoreProductLink(store+'?nt_source=external'),store);
 assert.equal(normalizeSmartstoreProductLink('  '+wide+'  '),wide);
});

test('다른 도메인·프로토콜·인증정보·포트·fragment·다른 페이지를 링크하지 않는다',()=>{
 const base='https://shopping.naver.com/window-products/department/13857609430';
 for(const url of [null,'',base.replace('https:','http:'),'javascript:alert(1)',base.replace('shopping.naver.com','shopping.naver.com.evil.test'),base.replace('shopping.naver.com','user:password@shopping.naver.com'),base.replace('shopping.naver.com','shopping.naver.com:443'),base.replace('shopping.naver.com','shopping.naver.com:8443'),base+'#buy',base+'#',base+'/more','https://shopping.naver.com/window/department/store/123','https://smartstore.naver.com/store/products/not-numeric','https://smartstore.naver.com/store/products/123/extra','https://shopping.naver.com/elsewhere/../window-products/department/123','https://shopping.naver.com/window-products/department/%31','https:\\shopping.naver.com/window-products/department/123',base+'?NaPm=hello\nworld']){
  assert.throws(()=>normalizeSmartstoreProductLink(url),{code:'INVALID_SMARTSTORE_PRODUCT_LINK'},String(url));
 }
});
