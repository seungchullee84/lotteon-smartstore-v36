import test from 'node:test';import assert from 'node:assert/strict';
import {officialSellingPoints,usableSellingPoints} from '../smartstore-selling-points.mjs';
test('공식 설명의 실루엣·터틀넥·원단 세 근거로 간결한 소구점을 만든다',()=>{
 const description='몸에 자연스럽게 밀착되는 슬림한 실루엣으로 단독 착용은 물론 레이어드 스타일링에도 활용하기 좋습니다. 적당한 폭의 터틀넥을 적용해 부담스럽지 않은 착용감을 더했으며, 코어 컬러입니다. 130g/㎡의 폴리 레이온 스판 저지 원단을 사용해 부드럽고 실키한 텍스처와 가볍고 편안한 착용감을 제공합니다.';
 const points=officialSellingPoints(description);assert.equal(points.length,3);assert(usableSellingPoints(points));assert(points.every(p=>description.includes(p.evidence)));
 assert.deepEqual(points.map(p=>p.title),['가볍고, 실키하게','슬림하게, 레이어드','부담 적은 터틀넥']);
 assert.equal(officialSellingPoints('다른 상품의 설명입니다.').length,0);
 assert.equal(usableSellingPoints([{title:'혼용 소재',description:'혼용 여부는 아래 소재 정보를 확인해 주세요.',evidence:description}]),false);
});
