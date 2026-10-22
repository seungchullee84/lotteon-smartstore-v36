import test from 'node:test';
import assert from 'node:assert/strict';
import {similarCategory} from '../category.mjs';
import {productClassification} from '../product.mjs';

test('면바지는 면바지/밴딩팬츠로 연결하고 다른 하의를 대신 선택하지 않음',()=>{
  const labels=['레깅스','면바지/밴딩팬츠','반바지/치마바지','슬랙스','청반바지'];
  for(const value of ['면바지','치노면바지','치노팬츠','코튼팬츠'])assert.equal(similarCategory(value,labels),'면바지/밴딩팬츠');
  assert.equal(similarCategory('면바지',['레깅스','슬랙스','청반바지']),null);
});

test('바지 분류를 롯데ON 바지/레깅스와 연결',()=>{
  const labels=['가디건/조끼','기타','바지/레깅스','스커트','청바지','트레이닝복'];
  assert.equal(similarCategory('바지',labels),'바지/레깅스');
  assert.equal(similarCategory('팬츠',labels),'바지/레깅스');
  assert.equal(similarCategory('바지',['청바지','트레이닝복']),null);
});

test('일반 재킷은 캐주얼자켓으로 연결하고 특수 자켓을 임의 선택하지 않음',()=>{
  const labels=['노카라자켓','레인코트','롱코트','린넨/마자켓','청자켓','캐주얼자켓','테일러드자켓','트렌치코트','트위드자켓','하프코트','데님점퍼'];
  assert.equal(similarCategory('재킷',labels),'캐주얼자켓');
  assert.equal(similarCategory('재킷',['자켓',...labels]),'자켓');
  assert.equal(similarCategory('재킷',['청자켓','트위드자켓']),null);
  assert.equal(similarCategory('여성재킷',['남성캐주얼자켓']),null);
});
test('공식몰 캐주얼자켓 분류를 재킷으로 단순화하지 않음',()=>{
  const c=productClassification('<div class="navi"><a>Home</a><a class="prdpath1">WOMEN</a><a class="prdpath2">OUTER</a><a>캐주얼자켓</a><a>하이넥 집업 미드렝스 자켓</a></div>');
  assert.equal(c.category.channelSmall,'캐주얼자켓');
});

test('트리코트 소재의 윈드브레이커를 코트로 분류하지 않음',()=>{const c=productClassification('<div class="navi"><a>Home</a><a class="prdpath1">MEN</a><a>OUTER</a><a>윈드브레이커</a><a>트리코트 목넥 집업 자켓</a></div>');assert.equal(c.category.commonSmall,'남성점퍼');assert.equal(c.category.channelMiddle,'점퍼/패딩/야상');assert.equal(c.category.channelSmall,'바람막이점퍼');});

test('하위 항목에 맞는 상위 경로를 함께 보정',async()=>{
 const {channelCategoryPath}=await import('../category.mjs');
 assert.equal(channelCategoryPath({channelMiddle:'남성의류아우터',channelSmall:'바람막이점퍼'}).channelMiddle,'점퍼/패딩/야상');
 assert.equal(channelCategoryPath({channelMiddle:'자켓/코트',channelSmall:'면바지'}).channelMiddle,'바지');
 assert.equal(channelCategoryPath({channelMiddle:'바지/레깅스',channelSmall:'면바지/밴딩팬츠'}).channelMiddle,'바지/레깅스');
 assert.equal(channelCategoryPath({channelMiddle:'직접확인분류',channelSmall:'미확인상품'}).channelMiddle,'직접확인분류');
});

test('기모 배럴핏 데님은 소재와 핏으로 분류',()=>{const p=productClassification('<div class="navi"><a>Home</a><a class="prdpath1">WOMEN</a><a>PANTS</a><a>데님</a><a>NEW 브러시드 배럴핏 데님</a></div>');assert.equal(p.category.channelMiddle,'청바지');assert.equal(p.category.channelSmall,'부츠컷/와이드핏');});
