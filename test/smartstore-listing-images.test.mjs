import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseListingPhotos} from '../smartstore-listing-images.mjs';
const photo=(name,color,role,id)=>({name,color,role,bytes:Buffer.from(id)});
test('1번 대표 + 같은 색상 옆면 + 다른 색상 정면만 고르고 대표 중복을 빼며 색상 순서를 지킨다',()=>{
 const photos=[photo('dark.jpg','01다크브라운','front','dark-front'),photo('1.jpg','02카멜','front','main'),photo('close.jpg','02카멜','detail','detail'),photo('camel-side.jpg','02카멜','side','side'),photo('dark-side.jpg','01다크브라운','side','dark-side')];
 const result=chooseListingPhotos(photos,{colors:['01다크브라운','02카멜']});assert.equal(result.main.name,'1.jpg');assert.deepEqual(result.extras.map(p=>p.name),['camel-side.jpg','dark.jpg']);assert.ok(!result.extras.some(p=>p.bytes.equals(result.main.bytes)));
});
test('대표 1번이나 같은 색상 옆면이 빠졌을 때 임의로 다른 사진을 쓰지 않는다',()=>{
 const p={colors:['01블랙']};assert.throws(()=>chooseListingPhotos([photo('front.jpg','01블랙','front','a')],p),/1.jpg/);assert.throws(()=>chooseListingPhotos([photo('1.jpg','01블랙','front','a')],p),/옆면/);
});
