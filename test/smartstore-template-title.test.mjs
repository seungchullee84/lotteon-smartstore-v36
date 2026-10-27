import test from'node:test';import assert from'node:assert/strict';import{officialTemplateTitle,officialTemplateTitleLayout}from'../smartstore-template-title.mjs';
test('공식몰 원본 상품명 우선, 품번 제외, 기능 숫자·원문 표현 보존',()=>{
 assert.equal(officialTemplateTitle({style:'076931',rawName:'스웨이드 목넥 패딩 푸퍼',name:'남성 부드러운 스웨이드 패딩 076931',smartstoreDetail:{headline:'수정 문구'}}),'스웨이드 목넥 패딩 푸퍼');
 for(const code of ['076931','01076931','STYLE NO. 01076931'])assert.equal(officialTemplateTitle({style:'076931',rawName:'20D 경량 자켓 '+code}),'20D 경량 자켓');
 assert.equal(officialTemplateTitle({style:'375908',rawName:'NEW [문가영] CLOUD LIGHT 경량 패딩 자켓'}),'CLOUD LIGHT 경량 패딩 자켓');
 assert.equal(officialTemplateTitle({style:'076931',name:'남성 패딩 076931'}),'남성 패딩');
});

test('인물 이름만 제외하고 공식 표현을 라벨과 균형 잡힌 줄로 배치한다',()=>{
 const p={style:'076931',rawName:'NEW [변우석] CLOUD LIGHT 스웨이드 목넥 패딩 푸퍼'};
 const layout=officialTemplateTitleLayout(p);
 assert.equal(layout.label,'CLOUD LIGHT');
 assert.deepEqual(layout.lines,['스웨이드 목넥','패딩 푸퍼']);
 assert.equal([layout.label,...layout.lines].join(' '),layout.title);
 assert.equal(officialTemplateTitle({rawName:'[기모] 여성 티셔츠 문가영 착용'}),'[기모] 여성 티셔츠');
});

test('NEW는 모든 상품 제목에서 제외하고 다른 영문 기능명은 보존한다',()=>{
 for(const rawName of ['NEW 여성 긴팔티','new 여성 긴팔티','여성 NEW 긴팔티'])assert.equal(officialTemplateTitle({rawName}),'여성 긴팔티');
 assert.equal(officialTemplateTitle({rawName:'NEW CLOUD LIGHT 경량 자켓'}),'CLOUD LIGHT 경량 자켓');
 assert.equal(officialTemplateTitle({rawName:'NEWYORK 프린트 티셔츠'}),'NEWYORK 프린트 티셔츠');
});
