import test from 'node:test';
import assert from 'node:assert/strict';
import {smartstorePlan,verifySmartstoreOptions,isSmartstoreInputUrl} from '../smartstore-form.mjs';
const product={style:'375908',name:'여성 경량 패딩 자켓 375908',gender:'여성',consumerPrice:59800,colors:['01핑크','02화이트'],sizes:['XS','S','M','L'],material:'나일론100%',country:'미얀마',washing:'손세탁',manufactured:'2025-08',keywords:'기존 롯데 키워드',images:{detail:'https://www.giordano.co.kr/detail.jpg'}};
test('스마트스토어 테스트 판매가는 소비자가와 구분하고 키워드·저장 비활성',()=>{const p=smartstorePlan(product,54800);assert.equal(p.consumerPrice,59800);assert.equal(p.salePrice,54800);assert.equal(p.save,false);assert.equal(p.keywords,false);assert.equal(p.expectedOptions,8);assert.match(p.html,/848px/);assert.equal(product.keywords,'기존 롯데 키워드');});
test('잘못된 판매가나 미검증 분류는 입력하지 않음',()=>{for(const price of [0,59801,NaN])assert.throws(()=>smartstorePlan(product,price));assert.equal(smartstorePlan({...product,name:'남성 바지',gender:'남성'},59800).category,null);});
test('옵션 마지막 조합 누락과 재고 오류를 검출',()=>{const p=smartstorePlan(product,59800);const rows=p.colors.flatMap(color=>p.sizes.map(size=>({color,size,stock:10})));assert.equal(verifySmartstoreOptions(p,rows),8);assert.throws(()=>verifySmartstoreOptions(p,rows.slice(0,-1)));assert.throws(()=>verifySmartstoreOptions(p,[...rows.slice(0,-1),{...rows.at(-1),stock:0}]));assert.throws(()=>verifySmartstoreOptions(p,[...rows,rows[0]]));});

test('복사등록과 신규만 허용하고 수정 화면은 거부',()=>{for(const suffix of ['create','copy/13755624427'])assert.equal(isSmartstoreInputUrl('https://sell.smartstore.naver.com/#/products/'+suffix),true);for(const suffix of ['update/1','edit/1','copy/abc'])assert.equal(isSmartstoreInputUrl('https://sell.smartstore.naver.com/#/products/'+suffix),false);});
