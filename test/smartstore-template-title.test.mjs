import test from'node:test';import assert from'node:assert/strict';import{officialTemplateTitle}from'../smartstore-template-title.mjs';
test('공식몰 원본 상품명 우선, 품번 제외, 기능 숫자·원문 표현 보존',()=>{
 assert.equal(officialTemplateTitle({style:'076931',rawName:'스웨이드 목넥 패딩 푸퍼',name:'남성 부드러운 스웨이드 패딩 076931',smartstoreDetail:{headline:'수정 문구'}}),'스웨이드 목넥 패딩 푸퍼');
 for(const code of ['076931','01076931','STYLE NO. 01076931'])assert.equal(officialTemplateTitle({style:'076931',rawName:'20D 경량 자켓 '+code}),'20D 경량 자켓');
 assert.equal(officialTemplateTitle({style:'375908',rawName:'NEW [문가영] CLOUD LIGHT 경량 패딩 자켓'}),'NEW [문가영] CLOUD LIGHT 경량 패딩 자켓');
 assert.equal(officialTemplateTitle({style:'076931',name:'남성 패딩 076931'}),'남성 패딩');
});
