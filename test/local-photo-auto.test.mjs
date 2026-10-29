import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {classifyLocalPhotos} from '../smartstore-local-photo.mjs';
import {officialSellingPoints} from '../smartstore-selling-points.mjs';
const source='릴렉스 핏과 목넥 디자인으로 편안하면서도 깔끔한 실루엣을 연출하는 푸퍼 자켓입니다. 초경량 립스탑 나일론 소재와 Ecoloft® Fluff 충전재를 사용해 가벼운 착용감과 풍성한 볼륨감, 뛰어난 보온성을 제공합니다. 내부 인 플라켓과 소매 안쪽 이밴드로 찬바람 유입을 차단하며, YKK 메탈 지퍼와 밑단 스트링으로 실용성을 강화했습니다.';
test('new originals use valid local predictions, cached by product, without excluding folder photos',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'local-photo-'));try{
  let calls=0;const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=1',colors:['01블랙']};
  const photos=[{name:'a.jpg',bytes:Buffer.from('a')},{name:'b.jpg',bytes:Buffer.from('b')}];
  const predict=async()=>{calls++;return [{role:'front',color:'01블랙',roleScore:.98,roleMargin:.8,colorScore:.98,colorMargin:.8},{role:'front',color:'01블랙',roleScore:.6,roleMargin:.1,colorScore:.98,colorMargin:.8}];};
  assert.equal((await classifyLocalPhotos(p,photos,{dataRoot,predict})).length,1);assert.equal(photos.length,2);
  await classifyLocalPhotos(p,photos,{dataRoot,predict});assert.equal(calls,1);
  await classifyLocalPhotos({...p,style:'654321'},photos,{dataRoot,predict});assert.equal(calls,2);
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
test('independent official claims produce at least three supported benefits',()=>{
 const points=officialSellingPoints(source);assert.ok(points.length>=3);for(const p of points)assert.ok(source.replace(/\s/g,'').includes(p.evidence.replace(/\s/g,'')));
 assert.equal(officialSellingPoints('나일론 100% 색상 블랙').length,0);
});
