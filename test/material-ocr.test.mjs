import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewMaterialOCR} from '../notice.mjs';
test('101 이상은 적지 않고 소재명과 정상 비율은 남김',()=>{
 assert.equal(reviewMaterialOCR('면 95%, 폴리우레탄 596').value,'면 95%, 폴리우레탄');
 assert.equal(reviewMaterialOCR('폴리에스터 1009%').value,'폴리에스터');
 assert.equal(reviewMaterialOCR('나일론 101').value,'나일론');
 assert.equal(reviewMaterialOCR('면 9596, 폴리우레탄 596').needsReview,true);
});
test('100과 정상 숫자는 그대로 유지',()=>{
 for(const text of ['면 100','폴리에스터 100%','면 95 폴리우레탄 5','면 96%, 폴리우레탄 4%'])assert.equal(reviewMaterialOCR(text).value,text);
});
