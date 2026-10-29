import test from 'node:test';
import assert from 'node:assert/strict';
import {smartstorePlan,verifySmartstoreOptions,isSmartstoreInputUrl,fillSmartstore} from '../smartstore-form.mjs';
const product={style:'375908',name:'여성 경량 패딩 자켓 375908',gender:'여성',consumerPrice:59800,colors:['01핑크','02화이트'],sizes:['XS','S','M','L'],material:'나일론100%',country:'미얀마',washing:'손세탁',manufactured:'2025-08',keywords:'기존 롯데 키워드',images:{detail:'https://www.giordano.co.kr/detail.jpg'}};
test('스마트스토어 테스트 판매가는 소비자가와 구분하고 키워드·저장 비활성',()=>{const p=smartstorePlan(product,54800);assert.equal(p.consumerPrice,59800);assert.equal(p.salePrice,54800);assert.equal(p.save,false);assert.equal(p.keywords,false);assert.equal(p.expectedOptions,8);assert.match(p.html,/848px/);assert.equal(product.keywords,'기존 롯데 키워드');});
test('수기 제조국 앞뒤 공백을 제거하고 검증되지 않은 값은 계속 거부한다',()=>{assert.equal(smartstorePlan({...product,country:' 방글라데시 '},54800).country,'방글라데시');assert.throws(()=>smartstorePlan({...product,country:'알수없는나라 '},54800),/제조국/);});
test('잘못된 판매가나 미검증 분류는 입력하지 않음',()=>{for(const price of [0,59801,NaN])assert.throws(()=>smartstorePlan(product,price));assert.equal(smartstorePlan({...product,name:'남성 바지',gender:'남성'},59800).category,null);});
test('옵션 마지막 조합 누락과 재고 오류를 검출',()=>{const p=smartstorePlan(product,59800);const rows=p.colors.flatMap(color=>p.sizes.map(size=>({color,size,stock:10})));assert.equal(verifySmartstoreOptions(p,rows),8);assert.throws(()=>verifySmartstoreOptions(p,rows.slice(0,-1)));assert.throws(()=>verifySmartstoreOptions(p,[...rows.slice(0,-1),{...rows.at(-1),stock:0}]));assert.throws(()=>verifySmartstoreOptions(p,[...rows,rows[0]]));});

test('복사등록과 수정·신규 주소를 인식하고 잘못된 주소는 거부',()=>{for(const suffix of ['create','copy/13755624427','edit/13755624427'])assert.equal(isSmartstoreInputUrl('https://sell.smartstore.naver.com/#/products/'+suffix),true);for(const suffix of ['update/1','copy/abc','edit/abc'])assert.equal(isSmartstoreInputUrl('https://sell.smartstore.naver.com/#/products/'+suffix),false);});

test('27자 미만 상품명은 판매자 폼을 조작하기 전에 차단한다',async()=>{
 await assert.rejects(fillSmartstore(null,{name:'지오다노 여성 자켓 376501'},{}),/27~39/);
});

test('품번·의류 종류와 관계없이 짧거나 긴 수동 상품명은 실제 입력 전에 차단한다',async()=>{
 for(const [i,kind] of ['맨투맨','니트','셔츠','가디건','바지','반바지','자켓','코트','패딩','원피스','스커트'].entries()){
  const title='지오다노 여성 '+kind+' '+String(200000+i);
  await assert.rejects(fillSmartstore(null,{name:title},{}),/27~39/,kind);
  await assert.rejects(fillSmartstore(null,{name:title+'가'.repeat(40)},{}),/27~39/,kind);
 }
});
