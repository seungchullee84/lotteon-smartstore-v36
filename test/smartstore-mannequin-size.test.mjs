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
