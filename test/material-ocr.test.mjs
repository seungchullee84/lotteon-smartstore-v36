import test from 'node:test';
import assert from 'node:assert/strict';
import {requireMaterialInput,reviewMaterialOCR,verifiedOcrMaterial} from '../notice.mjs';
test('101 이상은 적지 않고 소재명과 정상 비율은 남김',()=>{
 assert.equal(reviewMaterialOCR('면 95%, 폴리우레탄 596').value,'면 95%, 폴리우레탄');
 assert.equal(reviewMaterialOCR('폴리에스터 1009%').value,'폴리에스터');
 assert.equal(reviewMaterialOCR('나일론 101').value,'나일론');
 assert.equal(reviewMaterialOCR('면 9596, 폴리우레탄 596').needsReview,true);
});
test('100과 정상 숫자는 그대로 유지',()=>{
 for(const text of ['면 100','폴리에스터 100%','면 95 폴리우레탄 5','면 96%, 폴리우레탄 4%'])assert.equal(reviewMaterialOCR(text).value,text);
});

test('376901 OCR rejects garbled characters and validates all three official components',()=>{
 const material='겉감표면: 인조가죽 100% / 겉감이면: 비스코스 69%, 폴리에스터 18%, 면 8%, 금속성섬유 5% / 안감: 폴리에스터 100%';
 assert.equal(verifiedOcrMaterial(material),material);
 const broken='겉감표면: 인조가죽 10096 / 겉감이면: H[ ATA 69%, 폴리에스터 18%, 면 8%, 금속성섬유 5% / 안감: 폴리에스터 100%';
 assert.equal(verifiedOcrMaterial(broken),'');
 assert.throws(()=>requireMaterialInput(broken),/읽을 수 없는 문자/);
 assert.equal(verifiedOcrMaterial('면 ９５％, 폴리우레탄 ５％'),'면 95%, 폴리우레탄 5%');
 assert.equal(verifiedOcrMaterial('면 95%, 폴리우레탄 5'),'');
 assert.throws(()=>requireMaterialInput('면 95%, 폴리우레탄 8%'),/혼용률/);
});
