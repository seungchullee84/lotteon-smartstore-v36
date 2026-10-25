import test from 'node:test';import assert from 'node:assert/strict';
import {officialSellingPoints,usableSellingPoints} from '../smartstore-selling-points.mjs';
test('공식 설명의 실루엣·터틀넥·원단 세 근거로 간결한 소구점을 만든다',()=>{
 const description='몸에 자연스럽게 밀착되는 슬림한 실루엣으로 단독 착용은 물론 레이어드 스타일링에도 활용하기 좋습니다. 적당한 폭의 터틀넥을 적용해 부담스럽지 않은 착용감을 더했으며, 코어 컬러입니다. 130g/㎡의 폴리 레이온 스판 저지 원단을 사용해 부드럽고 실키한 텍스처와 가볍고 편안한 착용감을 제공합니다.';
 const points=officialSellingPoints(description);assert.equal(points.length,3);assert(usableSellingPoints(points));assert(points.every(p=>description.includes(p.evidence)));
 assert.deepEqual(points.map(p=>p.title),['가볍고, 실키하게','슬림하게, 레이어드','부담 적은 터틀넥']);
 assert.equal(officialSellingPoints('').length,0);assert.equal(usableSellingPoints(points,'다른 상품의 원문'),false);
 assert.equal(usableSellingPoints([{title:'혼용 소재',description:'혼용 여부는 아래 소재 정보를 확인해 주세요.',evidence:description}]),false);
});

test('다른 의류도 공식 POINT 원문을 사용하고 일반 색상·사이즈 문구로 채우지 않는다',()=>{
 const text='POINT 01 (핏)\n테이퍼드 실루엣\n밑단으로 갈수록 좁아지는 라인.\nPOINT 02 (디테일)\n히든 밴딩\n허리 안쪽에 밴딩을 적용했습니다.';const points=officialSellingPoints(text);assert.equal(points.length,2);assert.equal(points[0].title,'테이퍼드 실루엣');assert.equal(points[1].title,'히든 밴딩');assert(usableSellingPoints(points,text));
});

test('두 특징을 먼저 찾아도 공식 POINT 03을 빠뜨리지 않고 원문 순서를 유지한다',()=>{
 const text='몸에 자연스럽게 밀착되는 슬림한 실루엣으로 레이어드에도 활용하기 좋습니다. 적당한 폭의 터틀넥으로 부담스럽지 않은 착용감을 더했으며.\nPOINT 01 (실루엣)\n슬림 실루엣\n몸에 자연스럽게 밀착되는 슬림한 실루엣.\nPOINT 02 (디테일)\n적당한 폭의 터틀넥\n부담스럽지 않은 착용감.\nPOINT 03 (원단)\n면 모달 원단\n부드러운 촉감의 원단을 사용했습니다.';const points=officialSellingPoints(text);assert.equal(points.length,3);assert.equal(points[2].title,'면 모달 원단');assert(usableSellingPoints(points,text));
 const rib=text.replace('면 모달 원단\n부드러운 촉감의 원단을 사용했습니다.','280g/㎡의 레이온 스판 립 원단을 사용해 소프트한 텍스처와 톡톡한 두께감이 특징입니다.');const result=officialSellingPoints(rib);assert.equal(result.length,3);assert.equal(result[2].title,'톡톡하고, 부드럽게');
});
