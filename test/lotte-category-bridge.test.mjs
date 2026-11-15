import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bridgeLotteCategory,requireLotteCategoryBridge} from '../lotte-category-bridge.mjs';
import {allLotteStandardPaths} from '../lotte-category-validation.mjs';
import {validateProduct} from '../product-validation.mjs';
const common=JSON.parse(readFileSync(new URL('../data/category-catalog-common.json',import.meta.url),'utf8'));

test('every one of the 83 first-category leaves produces a non-empty selectable second path',()=>{
 const paths=allLotteStandardPaths();let total=0;
 for(const group of common.genders)for(const middle of group.middles)for(const small of middle.children){
  const p={gender:group.gender,rawName:'세부 형태 미상',category:{commonMajor:group.major,commonMiddle:middle.middle,commonSmall:small}};
  const result=bridgeLotteCategory(p),c=result.category;total++;
  assert.equal(result.complete,true,small);assert.equal(c.commonSmall,small);assert.equal(c.commonMiddle,middle.middle);
  for(const key of ['channelMajor','channelMiddle','channelSmall'])assert.ok(c[key],small+' '+key);
  assert.ok(paths.some(path=>path.major.code===c.channelCodes.major&&path.middle.code===c.channelCodes.middle&&path.small.code===c.channelCodes.small&&path.small.name===c.channelSmall),small+' must refer to a real stored leaf');
  assert.deepEqual(requireLotteCategoryBridge({...p,category:c}),c,'second-stage repetition must retain the chosen pair');
 }
 assert.equal(total,83);
});
test('243801 short sleeves and 345504 generic women shirts are mapped from their first category without a confidence stop',()=>{
 const short={gender:'남성',rawName:'3팩 반팔티 패키지',category:{commonMiddle:'남성의류상의',commonSmall:'남성티셔츠',channelMiddle:'긴팔티셔츠/맨투맨',channelSmall:'라운드넥티셔츠'}};
 const shirt={gender:'여성',rawName:'포플린 크롭 스트링 셔츠',category:{commonMiddle:'여성의류상의',commonSmall:'여성셔츠',channelMiddle:'셔츠/남방',channelSmall:'셔츠'}};
 const a=bridgeLotteCategory(short),b=bridgeLotteCategory(shirt);
 assert.equal(a.complete,true);assert.equal(a.category.channelSmall,'라운드넥반팔티');
 assert.equal(b.complete,true);assert.equal(b.category.commonSmall,'00844 : 여성남방셔츠');assert.equal(b.category.channelMiddle,'블라우스/셔츠');assert.equal(b.category.channelSmall,'솔리드셔츠');
});
test('first category wins over conflicting product-name guesses and stale second-category codes',()=>{
 const p={gender:'여성',rawName:'라운드 반팔티',category:{commonMiddle:'M0210 : 여성의류상의',commonSmall:'00847 : 여성가디건',channelMiddle:'티셔츠/맨투맨',channelSmall:'라운드넥티셔츠',channelCodes:{small:'OLD'},channelDetail:'오래된 세분류'}};
 const result=bridgeLotteCategory(p);
 assert.equal(result.complete,true);assert.equal(result.category.commonSmall,p.category.commonSmall);assert.equal(result.category.channelMiddle,'가디건/조끼');assert.notEqual(result.category.channelCodes.small,'OLD');assert.equal(result.category.channelDetail,'');
});
test('broader paths are labelled editable rather than falsely claiming exact subtype verification',()=>{
 const result=bridgeLotteCategory({gender:'여성',rawName:'임부복',category:{commonMiddle:'M0355 : 여성특수목적의류',commonSmall:'00870 : 여성임부복'}});
 assert.equal(result.complete,true);assert.equal(result.review,true);assert.equal(result.broad,true);assert.equal(result.category.channelSmall,'기타');assert.match(result.message,/수정 가능/);
});
test('missing first category is not disguised as a completed bridge',()=>{
 assert.equal(bridgeLotteCategory({gender:'남성',category:{}}).complete,false);
});

test('known legacy male shirt labels and separately collected accessories receive complete pairs',()=>{
 const shirt=bridgeLotteCategory({gender:'남성',rawName:'옥스포드 셔츠',category:{commonMiddle:'남성의류상의',commonSmall:'남성셔츠'}});
 assert.equal(shirt.category.channelMiddle,'캐주얼셔츠');assert.equal(shirt.category.channelSmall,'솔리드셔츠');assert.ok(shirt.category.channelCodes.small);
 for(const [gender,commonMiddle,commonSmall,channelSmall] of [['남성','벨트','남성벨트','남성벨트'],['여성','벨트','여성벨트','여성벨트'],['여성','패션액세서리','머플러','머플러']]){
  const result=bridgeLotteCategory({gender,category:{commonMiddle,commonSmall}});assert.equal(result.complete,true);assert.equal(result.category.channelSmall,channelSmall);
 }
});
test('server product validation preserves the first-derived pair instead of reclassifying it from title',()=>{
 const p={style:'000000',name:'여성 라운드 반팔티 000000',rawName:'라운드 반팔티',sourceCategory:['WOMEN','TOP'],gender:'여성',material:'면 100%',country:'베트남',washing:'손세탁',manufactured:'2026-08',consumerPrice:59800,colors:['01블랙'],sizes:['M'],keywords:'지오다노,가디건',category:{commonMiddle:'M0210 : 여성의류상의',commonSmall:'00847 : 여성가디건'}};
 p.category=requireLotteCategoryBridge(p);const before=structuredClone(p.category);
 assert.doesNotThrow(()=>validateProduct(p,{preserveCategory:true}));assert.deepEqual(p.category,before);
});

test('live observed underwear, homewear and accessories use their dedicated roots and codes',()=>{
 const cases=[
  ['남성','지워머 레깅스','남성속옷','남성내의','브랜드언더웨어','남성내의','타이즈'],
  ['여성','발열 내의','여성속옷','여성내의','브랜드언더웨어','여성내의','발열내의'],
  ['남성','드로즈','남성속옷','남성팬티','브랜드언더웨어','남성팬티','드로즈'],
  ['여성','브라탑','여성속옷','여성런닝셔츠/캐미솔','브랜드언더웨어','여성런닝/속바지','브라탑'],
  ['여성','잠옷 상하세트','여성홈웨어','여성잠옷','브랜드언더웨어','잠옷','상하세트잠옷'],
  ['남성','홈웨어','남성홈웨어','남성실내복','브랜드언더웨어','홈웨어/이지웨어','홈웨어세트'],
  ['남성','볼캡','패션액세서리','모자','브랜드잡화/넥타이','모자','야구모자'],
  ['여성','울 양말','패션액세서리','양말','브랜드잡화/넥타이','양말','여성양말'],
  ['남성','장갑','패션액세서리','장갑','브랜드잡화/넥타이','패션장갑','남성장갑'],
  ['여성','백팩','가방','여성가방','브랜드가방','여성가방','백팩'],
 ];
 for(const [gender,rawName,commonMiddle,commonSmall,major,middle,small] of cases){const v=bridgeLotteCategory({gender,rawName,category:{commonMiddle,commonSmall}});assert.equal(v.complete,true,rawName);assert.deepEqual([v.category.channelMajor,v.category.channelMiddle,v.category.channelSmall],[major,middle,small],rawName);assert.ok(v.category.channelCodes.small);}
});
