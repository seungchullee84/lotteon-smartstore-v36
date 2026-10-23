import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKeywords} from '../product.mjs';
import {validateProduct} from '../product-validation.mjs';
import {packKeywords,keywordCandidates,createKeywordOptimizer} from '../naver-keywords.mjs';

// These are synthetic offline fixtures, not observations of search volume.
const credentials={clientId:'dummy',clientSecret:'dummy'};
function reviewed(keywords){
 return {style:'000000',name:'남성 니트 000000',gender:'남성',material:'면 100%',country:'베트남',washing:'손세탁',manufactured:'2026-08',consumerPrice:59800,colors:['01블랙'],sizes:['M'],keywords,category:{commonMiddle:'남성의류상의',commonSmall:'니트',channelMiddle:'남성의류',channelSmall:'니트'}};
}
function trendFetch(value){
 return async(_url,config)=>{
  const request=JSON.parse(config.body);
  return Response.json({...request,results:request.keywordGroups.map(g=>({title:g.groupName,data:[{period:request.endDate,ratio:value(g.groupName)}]}))});
 };
}
for(const length of [39,40,41]){
 test(`규칙 생성·추천 조립·서버 검증의 쉼표 포함 ${length}자 경계`,()=>{
  const word='가'.repeat(length-5),keywords='지오다노,'+word;
  assert.equal(keywords.length,length);
  assert.equal(packKeywords([word]),length<=40?keywords:'지오다노');
  // Fallback adds the 9-character brand/category prefix and one comma.
  const baseWord='가'.repeat(length-10);
  assert.equal(buildKeywords({name:baseWord,gender:'남성'}),length<=40?'지오다노,남성의류,'+baseWord:'지오다노,남성의류');
  if(length<=40){const p=reviewed(keywords);assert.doesNotThrow(()=>validateProduct(p));assert.equal(p.keywords,keywords);}
  else assert.throws(()=>validateProduct(reviewed(keywords)),/쉼표·공백 포함 40자/);
 });
 test(`네이버 자동 추천은 ${length}자 후보를 단어 단위로 처리`,async()=>{
  const word='가'.repeat(length-5);
  const optimize=createKeywordOptimizer({candidateFactory:()=>[word,'니트',word],fetchImpl:trendFetch(k=>k===word?100:50)});
  const result=await optimize({gender:'여성',name:'여성 니트'},credentials);
  assert.equal(result.ranking[0].keyword,word,'관심도 우선순위 유지');
  assert.equal(result.keywords,length<=40?'지오다노,'+word:'지오다노,니트');
  assert.equal(result.length,result.keywords.length);
  assert(result.length<=40);
  const cached=await optimize({gender:'여성',name:'여성 니트'},credentials);assert(cached.fromCache);assert.equal(cached.keywords,result.keywords);
 });
}
test('쉼표와 공백도 서버 길이 제한에 포함하고 조립 시 같은 키워드를 반복하지 않음',()=>{
 const text='지오다노,'+'가'.repeat(34);assert.equal(text.length,39);
 assert.doesNotThrow(()=>validateProduct(reviewed(text+'나')));
 assert.throws(()=>validateProduct(reviewed(text+' 나')),/40자/);
 assert.equal(packKeywords(['니트','니트','지오다노','브이넥니트']),'지오다노,니트,브이넥니트');
 assert.throws(()=>validateProduct(reviewed('남성니트')),/지오다노로 시작/);
});

const clothing=[
 ['남성 브이넥 집업 아가일 스트라이프 니트 베스트','남성','남성니트'],
 ['여성 브이넥 스트라이프 가디건','여성','여성가디건'],
 ['남성 기모 그래픽 맨투맨','남성','남성맨투맨'],
 ['여성 기모 후드 집업 티셔츠','여성','여성후드티'],
 ['여성 겨울 경량 후드 숏 패딩 자켓','여성','여성패딩'],
 ['남성 후드 경량 바람막이','남성','남성바람막이'],
 ['여성 경량 퀼팅 자켓','여성','여성자켓'],
 ['남성 후드 집업 점퍼','남성','남성점퍼'],
 ['남성 기모 밴딩 슬랙스','남성','남성바지'],
 ['여성 라운드 긴팔 티셔츠','여성','여성티셔츠'],
 ['남성 버튼다운 체크 셔츠','남성','남성셔츠'],
 ['여성 트렌치 코트','여성','여성코트'],
 ['여성 블라우스','여성','여성블라우스'],
 ['남성 정장 가죽 벨트','남성','남성벨트']
];
for(const [name,gender,kind] of clothing)test(`40자 변경 후 규칙·네이버 추천 회귀: ${name}`,async()=>{
 const product={name,gender,material:'면 100%'},before=structuredClone(product),candidates=keywordCandidates(product);
 const base=buildKeywords(product).split(',');assert.equal(base[1],kind);
 assert(candidates.includes(kind));
 // Give the last candidate the highest interest, even when it is not the kind.
 const preferred=candidates.at(-1);
 const optimize=createKeywordOptimizer({fetchImpl:trendFetch(k=>k===preferred?80:20)});
 const result=await optimize(product,credentials),words=result.keywords.split(',');
 assert.equal(result.ranking[0].keyword,preferred);
 assert.equal(words[0],'지오다노');assert.equal(words[1],preferred);
 assert.equal(new Set(words).size,words.length);
 assert(words.slice(1).every(k=>candidates.includes(k)));
 assert(result.length<=40);assert.equal(result.length,result.keywords.length);
 assert.deepEqual(product,before,'추천이 원래 상품명·상품 정보를 수정하지 않음');
});
