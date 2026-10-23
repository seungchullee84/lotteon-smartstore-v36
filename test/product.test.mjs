import test from 'node:test';import assert from 'node:assert/strict';
import {validateStyle,koreanTitle,baseColor,matchColor,applyOCR,parseProduct,productClassification,easyProductName,buildKeywords} from '../product.mjs';
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

test('성별·품번·변환 후 동일 단어는 한 번만 쓰고 상품 특성 숫자는 보존',()=>{
 const cases=[
  ['남성 아가일 브이넥 니트','남성','356956','남성 아가일 브이넥 니트 356956'],
  ['남성 남성 니트 스웨터 356956','남성','356956','남성 니트 356956'],
  ['여성 가디건 여성 326916','여성','326916','여성 가디건 326916'],
  ['남성니트 브이넥','남성','356956','남성 니트 브이넥 356956'],
  ['남성 아가일 니트','', '356956','남성 아가일 니트 356956'],
  ['NEW [변우석] 울 100% 7게이지 V-NECK 니트','남성','356956','남성 울 100% 7게이지 브이넥 니트 356956'],
  ['기모 브러시드 크루넥 라운드 긴팔티 026993','남성','026993','남성 기모 라운드 긴팔티 026993']
 ];
 for(const [raw,gender,style,expected] of cases){
  assert.equal(koreanTitle(raw,gender,style),expected);
  assert.equal(koreanTitle(expected,gender,style),expected,'반복 생성해도 결과 유지');
 }
 assert.equal(easyProductName('여성 여성 브러쉬드 기모 팬츠 바지 416581 416581'),'여성 기모 바지 416581');
 assert.equal(koreanTitle('3569560 니트','남성','356956'),'남성 3569560 니트 356956');
});

const keywordCases=[
 ['남성 아가일 브이넥 니트 356956','남성',['남성니트','브이넥니트','아가일니트']],
 ['여성 V넥 스트라이프 카디건','여성',['여성가디건','브이넥가디건']],
 ['남성 집업 스웨터','남성',['남성니트','집업니트']],
 ['여성 터틀넥 니트','여성',['여성니트','터틀넥니트']],
 ['남성 라운드 니트 베스트','남성',['남성니트','라운드니트','니트조끼']],
 ['남성 기모 그래픽 스웨트셔츠','남성',['남성맨투맨','기모맨투맨']],
 ['여성 후드 집업 기모 티셔츠','여성',['여성후드티','후드집업','기모후드티']],
 ['여성 경량 후드 숏 패딩 자켓','여성',['여성패딩','경량패딩','후드패딩']],
 ['남성 오리털 다운 베스트','남성',['남성패딩','패딩조끼']],
 ['남성 니트 배색 패딩','남성',['남성패딩']],
 ['남성 후드 바람막이 점퍼','남성',['남성바람막이','후드바람막이']],
 ['여성 경량 퀼팅 자켓','여성',['여성자켓','퀼팅자켓']],
 ['남성 후드 점퍼','남성',['남성점퍼','후드점퍼']],
 ['남성 브러시드 밴딩 슬랙스','남성',['남성바지','슬랙스','밴딩바지','기모바지']],
 ['여성 와이드 데님 팬츠','여성',['여성바지','데님팬츠','와이드바지']],
 ['남성 기모 스웨트 바지','남성',['남성바지','트레이닝바지']],
 ['여성 크루넥 긴팔 티셔츠','여성',['여성티셔츠','긴팔티셔츠','라운드티']],
 ['남성 버튼다운 체크 셔츠','남성',['남성셔츠','체크셔츠']],
 ['남성 버튼 다운 체크 셔츠','남성',['남성셔츠','체크셔츠']],
 ['여성 데님 셔츠','여성',['여성셔츠']],
 ['남성 데님 자켓','남성',['남성자켓']],
 ['여성 트렌치 코트','여성',['여성코트','트렌치코트']],
 ['남성 트리코트 집업 자켓','남성',['남성자켓','집업자켓']],
 ['남성 정장 가죽 벨트','남성',['남성벨트','정장벨트','가죽벨트']],
 ['여성 블라우스','여성',['여성블라우스']],
 ['브이넥 니트','',['니트','브이넥니트']]
];
for(const [name,gender,required] of keywordCases)test('상품 종류별 키워드: '+name,()=>{
 const result=buildKeywords({name,gender}),words=result.split(',');
 assert.equal(words[0],'지오다노');
 assert.equal(words[1],required[0]);
 for(const word of required)assert.ok(words.includes(word),result+'에 '+word+' 포함');
 assert.ok(result.length<=40,result+' 길이 '+result.length);
 assert.equal(new Set(words).size,words.length);
 assert.doesNotMatch(result,/\s|\d|남성의류|여성의류|데일리룩|캐주얼룩/);
});

test('키워드 예산 초과 시 단어 중간 절단 없이 브랜드·핵심 품목 우선',()=>{
 const result=buildKeywords({name:'남성 브이넥 집업 아가일 스트라이프 니트 베스트',gender:'남성'});
 assert.equal(result,'지오다노,남성니트,브이넥니트,집업니트,니트조끼,아가일니트,스트라이프니트');
 assert.ok(result.length<=40);
 const exact=buildKeywords({name:'가'.repeat(30),gender:'남성'});
 assert.equal(exact.length,40,'쉼표를 포함해 정확히 40자까지 허용');
 assert.equal(buildKeywords({name:'가'.repeat(31),gender:'남성'}),'지오다노,남성의류','초과 단어는 통째로 제외');
});
test('키워드는 입력에 없는 기능·소재·성별을 추가하지 않음',()=>{
 assert.equal(buildKeywords({name:'남성 니트',gender:'남성',material:'울 100%'}),'지오다노,남성니트');
 assert.equal(buildKeywords({name:'여성 패딩',gender:'여성'}),'지오다노,여성패딩');
 assert.equal(buildKeywords({name:'긴팔 티셔츠',material:'면 60%, 폴리에스터 40%'}),'지오다노,티셔츠,긴팔티셔츠');
 assert.equal(buildKeywords({name:'긴팔 티셔츠',material:'면 100%'}),'지오다노,티셔츠,긴팔티셔츠,면티셔츠');
 assert.equal(buildKeywords({name:'  ',rawName:'남성 브이넥 니트',gender:'남성'}),'지오다노,남성니트,브이넥니트');
 assert.equal(buildKeywords({name:'[변우석] 남성 신상품 356956',gender:'남성'}),'지오다노,남성의류,신상품');
 assert.equal(buildKeywords({}),'지오다노,의류');
});

test('수집 결과의 자동 상품명도 중복 없이 키워드 생성으로 이어짐',()=>{
 const html='<title>남성 아가일 브이넥 니트 - 지오다노</title>'+
  '<div class="navi"><a>Home</a><a class="prdpath1">MEN</a><a>TOP</a><a>니트</a><a>남성 아가일 브이넥 니트</a></div>'+
  '<img src="/_data/attach/main.jpg"><img src="/356956info.jpg">';
 const p=parseProduct(html,'https://www.giordano.co.kr/shop/detail.php?pno=test','356956');
 assert.equal(p.name,'남성 아가일 브이넥 니트 356956');
 assert.equal(buildKeywords(p),'지오다노,남성니트,브이넥니트,아가일니트');
});
