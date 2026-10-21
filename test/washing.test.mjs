import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWashing} from '../notice.mjs';
test('375908 인식 원문에서 손세탁과 다림질 금지를 누락하지 않음',()=>{
 const r=parseWashing('손세탁 표백제 금지 다림질금지 약하게짜기 건조기금지 드라이 크리닝');
 for(const text of ['손세탁','다림질 금지','드라이클리닝','표백제 금지','건조기 금지'])assert.ok(r.value.includes(text));
});
test('금지된 드라이와 손세탁을 허용으로 바꾸지 않음',()=>{
 const r=parseWashing('손세탁 금지 드라이크리닝 금지 세탁기 사용 금지 다림질 금지');
 assert.equal(r.value,'세탁기 사용 금지, 손세탁 금지, 드라이클리닝 금지, 다림질 금지');
});
test('기계세탁과 손세탁이 함께 있으면 둘 다 보존',()=>{
 assert.equal(parseWashing('세탁기로 약하게 세탁 (손세탁 가능)').value,'세탁기로 약하게 세탁, 손세탁');
});
test('인식되지 않은 기호나 온도는 추측하지 않음',()=>{
 assert.equal(parseWashing('EAA XK &').value,'');
 assert.doesNotMatch(parseWashing('손세탁').value,/30|중성|다림질/);
});
