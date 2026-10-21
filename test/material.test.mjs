import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaterialText} from '../notice.mjs';
test('% 없는 소재 숫자도 부위별로 100이면 입력',()=>{
 assert.equal(parseMaterialText('겉감:나일론100,안감:나일론100\n충전재:폴리에스터100'),'겉감: 나일론 100% / 안감: 나일론 100% / 충전재: 폴리에스터 100%');
 assert.equal(parseMaterialText('면97 폴리우레탄3'),'면 97%, 폴리우레탄 3%');
 assert.equal(parseMaterialText('면 97%, 폴리우레탄 3'),'면 97%, 폴리우레탄 3%');
});
test('누락되거나 잘못 읽은 숫자는 채워 넣지 않음',()=>{
 for(const value of ['면 폴리우레탄3','면97 폴리우레탄','면97 폴리우레탄8','나일론1000','나일론1OO','나일론10O','면90 안감:나일론100'])assert.equal(parseMaterialText(value),'',value);
});
