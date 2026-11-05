import test from 'node:test';import assert from 'node:assert/strict';
import {mannequinWearingNote,buildSmartstoreDetail} from '../smartstore-detail.mjs';
test('사용자가 지정한 성별 및 상하의 착용 사이즈를 구분한다',()=>{
 for(const [gender,name,expected] of [['남성','후드티','남성 상의 · L 사이즈 착용'],['남자','테이퍼드 팬츠','남성 하의 · 32 사이즈 착용'],['여성','니트','여성 상의 · S 사이즈 착용'],['여자','청바지','여성 하의 · 26 사이즈 착용']])assert.equal(mannequinWearingNote({gender,rawName:name}),expected);
 assert.equal(mannequinWearingNote({gender:'남성',rawName:'데님 셔츠',category:{commonMiddle:'남성의류상의'}}),'남성 상의 · L 사이즈 착용');
 for(const p of [{gender:'남녀공용',rawName:'후드티'},{gender:'여성',rawName:'원피스'},{gender:'남성',rawName:'벨트'}])assert.equal(mannequinWearingNote(p),'');
});
test('실제 매장 사진이 준비된 상세에만 착용 사이즈를 표시한다',()=>{
 const p={style:'026982',gender:'남성',rawName:'후드티',colors:['03그레이'],images:{detail:'https://example.com/detail.jpg'},smartstoreDetail:{style:'026982',photoCount:1,colorImages:{'03그레이':['/smartstore-photo/sample']}}};
 assert.match(buildSmartstoreDetail(p).html,/남성 상의 · L 사이즈 착용/);
 p.smartstoreDetail.photoCount=0;assert.doesNotMatch(buildSmartstoreDetail(p).html,/data-mannequin-size/);
});

test('문자 사이즈 하의는 남성 L·여성 S, 숫자 사이즈 하의는 기존 안내를 사용한다',()=>{
 for(const gender of ['남성','여성']){
  const product={gender,rawName:'와이드 팬츠',category:{commonMiddle:gender+'의류하의'}};
  for(const sizes of [['S','M','L','XL'],['M','L','XL'],['XS','S','M'],[' s ','m','l','xl'],['S(26)','M(28)'],['2XL','3XL']]){
   const original=[...sizes];assert.equal(mannequinWearingNote({...product,sizes}),`${gender} 하의 · ${gender==='남성'?'L':'S'} 사이즈 착용`);assert.deepEqual(sizes,original);
  }
  assert.equal(mannequinWearingNote({...product,sizes:['26','28','30','32']}),`${gender} 하의 · ${gender==='남성'?'32':'26'} 사이즈 착용`);
 }
 assert.equal(mannequinWearingNote({gender:'남녀공용',rawName:'팬츠',sizes:['S','M','L']}),'');
});

test('문자 사이즈 하의의 두 템플릿에 같은 착용 안내를 표시하며 판매 옵션은 보존한다',()=>{
 for(const detailTemplate of [1,2])for(const gender of ['남성','여성']){
  const p={style:'116930',detailTemplate,gender,rawName:'와이드 팬츠',sizes:['S','M','L','XL'],colors:['01블랙'],images:{detail:'https://example.com/detail.jpg'},smartstoreDetail:{style:'116930',photoCount:1,colorImages:{'01블랙':['/smartstore-photo/sample']}}};
  const original=structuredClone(p),note=`${gender} 하의 · ${gender==='남성'?'L':'S'} 사이즈 착용`;
  assert(buildSmartstoreDetail(p).html.includes(note));assert.deepEqual(p,original);
  p.smartstoreDetail.photoCount=0;p.smartstoreDetail.colorImages={};assert.doesNotMatch(buildSmartstoreDetail(p).html,/data-mannequin-size/);
 }
});
