import test from 'node:test';import assert from 'node:assert/strict';
import {validateStyle,koreanTitle,baseColor,matchColor,applyOCR,parseProduct,productClassification,easyProductName} from '../product.mjs';
test('상품명은 기모·라운드·바지처럼 쉬운 표현 사용',()=>{
 assert.equal(koreanTitle('브러시드 크루넥 긴팔티','남성','026993'),'남성 기모 라운드 긴팔티 026993');
 assert.equal(easyProductName('여성 브러쉬드 밴딩 팬츠 416581'),'여성 기모 밴딩 바지 416581');
 assert.equal(koreanTitle('BRUSHED CREW NECK PANTS','남성','026993'),'남성 기모 라운드 바지 026993');
});
test('공통 메뉴의 WOMEN을 남성 상품 성별로 사용하지 않음',()=>{const p=productClassification('<nav><a>WOMEN</a><a>MEN</a></nav><div class="navi"><a>Home</a><a class="prdpath1">MEN</a><a class="prdpath2">PANTS</a><a>데님</a><a>상품명</a></div>');assert.equal(p.gender,'남성');assert.deepEqual(p.sourceCategory,['MEN','PANTS','데님']);assert.equal(p.category.commonMiddle,'남성의류하의');});
test('여성 긴팔티의 검증된 분류만 채움',()=>{const p=productClassification('<nav><a>MEN</a><a>WOMEN</a></nav><div class="navi"><a>Home</a><a class="prdpath1">WOMEN</a><a class="prdpath2">TOP</a><a>긴팔티</a><a>상품명</a></div>');assert.equal(p.gender,'여성');assert.equal(p.category.commonSmall,'00843 : 여성티셔츠/탑');});
test('경로가 없거나 충돌하면 성별 미확정',()=>{assert.equal(productClassification('<a>WOMEN</a><a>MEN</a>').gender,'');assert.equal(productClassification('<div class="navi"><a class="prdpath1">WOMEN</a><a class="prdpath1">MEN</a></div>').gender,'');});
test('품번은 숫자6자리',()=>{assert.equal(validateStyle('326916'),'326916');for(const v of ['../326916','3269167','32691','x'])assert.throws(()=>validateStyle(v));});
test('색상번호, 패턴 제거 및 첫색 기준',()=>{assert.equal(baseColor('02그레이ST+블루'),'그레이');assert.equal(matchColor('02블랙1',['블랙','블루']),'블랙');assert.equal(matchColor('보라색',['퍼플','레드']),'퍼플');assert.equal(matchColor('03더스티핑크',['핑크','블루']),'핑크');assert.equal(matchColor('미확인',['그레이']),null);});
test('상품명',()=>assert.equal(koreanTitle('NEW 캐시터치 크루넥 긴팔티','여성','326916'),'여성 캐시터치 라운드 긴팔티 326916'));
test('OCR은 세탁기호를 추측하지 않음',()=>{const p={warnings:[],washing:''};applyOCR(p,'제품 소재 면 100%\n색상 01블랙\n제조국 베트남\n세탁 방법\n제조연월 2026.08');assert.equal(p.material,'면 100%');assert.equal(p.country,'베트남');assert.equal(p.manufactured,'2026-08');assert.equal(p.washing,'');});
test('고시 이미지 누락 시 수집 중단',()=>assert.throws(()=>parseProduct('<body>WOMEN<h3>티셔츠</h3>19,800원 STYLE.</body>','https://www.giordano.co.kr','326916')));
