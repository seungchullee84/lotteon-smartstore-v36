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
 const text='POINT 01 (핏)\n테이퍼드 실루엣\n밑단으로 갈수록 좁아지는 라인.\nPOINT 02 (디테일)\n히든 밴딩\n허리 안쪽에 밴딩을 적용했습니다.';const points=officialSellingPoints(text);assert.equal(points.length,2);assert.match(points[0].title,/테이퍼드/);assert.equal(points[1].title,'히든 밴딩');assert(usableSellingPoints(points,text));
});

test('두 특징을 먼저 찾아도 공식 POINT 03을 빠뜨리지 않고 원문 순서를 유지한다',()=>{
 const text='몸에 자연스럽게 밀착되는 슬림한 실루엣으로 레이어드에도 활용하기 좋습니다. 적당한 폭의 터틀넥으로 부담스럽지 않은 착용감을 더했으며.\nPOINT 01 (실루엣)\n슬림 실루엣\n몸에 자연스럽게 밀착되는 슬림한 실루엣.\nPOINT 02 (디테일)\n적당한 폭의 터틀넥\n부담스럽지 않은 착용감.\nPOINT 03 (원단)\n면 모달 원단\n부드러운 촉감의 원단을 사용했습니다.';const points=officialSellingPoints(text);assert.equal(points.length,3);assert.equal(points[2].title,'면 모달 원단');assert(usableSellingPoints(points,text));
 const rib=text.replace('면 모달 원단\n부드러운 촉감의 원단을 사용했습니다.','280g/㎡의 레이온 스판 립 원단을 사용해 소프트한 텍스처와 톡톡한 두께감이 특징입니다.');const result=officialSellingPoints(rib);assert.equal(result.length,3);assert.equal(result[2].title,'톡톡하고, 부드럽게');
});

test('모든 의류의 표시 문구는 짧게 요약하고 긴 원문과 문단 나열은 근거에만 보관한다',()=>{
 const text='히든 밴딩 울트라 스트레치 치노 팬츠입니다. 탁월한 신축성과 웨이스트 라인의 히든 밴딩 디테일로 유연한 움직임과 편안한 착용감을 제공합니다. 클래식한 디자인과 고급스러운 소재감으로 캐주얼과 스마트한 스타일 모두에 자연스럽게 어우러지는 실용적인 아이템입니다. 스판사가 원단의 가로/세로 양방향 모두 들어 있는 사방 스판 원단으로 착용감이 뛰어납니다. 브러쉬드 가공으로 보온력이 우수하며 부드러운 터치감으로 겨울에도 따뜻하게 착용하기 좋습니다.';
 const points=officialSellingPoints(text);assert.equal(points.length,3);assert(points.every(p=>p.title.length<=18&&p.description.length<=42&&p.title!==p.description));assert(usableSellingPoints(points,text));assert.deepEqual(points.map(p=>p.title),['히든밴딩, 편안하게','사방으로, 유연하게','부드럽고, 따뜻하게']);
 assert.equal(officialSellingPoints('아주 긴 소개문을 그대로 상품 제목과 설명에 반복하는 방식은 사용하지 않으며 검토가 필요한 새로운 상품입니다.').length,0);assert.equal(usableSellingPoints([{title:'짧은 제목',description:text,evidence:text}],text),false);
});

test('공식 퀼팅 패딩 원문도 짧은 세 소구점으로 표현한다',()=>{
 const text='어니언 퀼팅의 크루넥 경량 자켓입니다. PTT 소재로 제작되어 보온성이 우수하고 복원력이 뛰어난 것이 특징입니다. 겉감은 20D 고밀도 나일론 원단으로 제작되었습니다.';
 const points=officialSellingPoints(text);assert.equal(points.length,3);for(const p of points){assert(p.title.length<=18);assert(p.description.length<=42);assert(text.includes(p.evidence));}
});

test('공식 레귤러핏·컴팩트 코튼·가먼트 워시 문장을 짧은 소구점으로 정리한다',()=>{
 const text='베이직한 라운드넥 디자인과 자연스럽게 떨어지는 어깨선의 레귤러 핏으로, 체형에 구애받지 않고 편안하게 착용할 수 있는 긴팔 티셔츠입니다. 100% 20수 컴팩트 코튼(205gsm) 싱글 저지 원단을 사용해 부드러우면서도 탄탄한 착용감을 제공하며, 가먼트 워시 가공을 적용해 세탁 후 수축을 최소화했습니다.';
 const points=officialSellingPoints(text);assert.equal(points.length,3);assert(usableSellingPoints(points,text));assert.deepEqual(points.map(p=>p.title),['자연스러운 레귤러핏','부드럽고, 탄탄하게','워싱으로, 안정감 있게']);
});
