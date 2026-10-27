import test from 'node:test';import assert from 'node:assert/strict';
import {officialSellingPoints,usableSellingPoints,displaySellingPoints} from '../smartstore-selling-points.mjs';

test('공식 문장의 연결어를 나눠도 강화했 같은 미완성 서술어로 끝내지 않는다',()=>{
 const source='양쪽의 웰트 포켓과 내부 인포켓은 실용적인 수납공간을 제공하고, 소매 안쪽에는 이밴드를 더해 바람 유입을 차단하여 보온성을 강화했으며, 밑단의 스트링과 스토퍼는 필요에 따라 실루엣을 자유롭게 조절할 수 있습니다.';
 const points=officialSellingPoints(source);
 const warm=points.find(p=>/보온/.test(p.description));
 assert(warm);assert.match(warm.description,/강화했습니다\.$/);assert.equal(warm.evidence,source);
 assert(usableSellingPoints(points,source));
 for(const ending of ['강화했','높였','살렸','낮췄','있'])assert.equal(usableSellingPoints([{title:'쌀쌀할 때도 따뜻하게',description:'보온성을 '+ending+'.',evidence:source}],source),false);
});

test('모든 상품에서 체크표 선택지·깨진 OCR·미완성 문장은 구매 장점이 아니다',()=>{
 const noise='클래식한 일자 Elo] 더해진 베이직한 실루옛의 크루넥 경량\n슬랙스, 스커트 등 다양한 아이템과 믹스 매치가 가능해 데일리 룩부터\nCHECK UP\n상의 핏\n슬림핏         레글러핏         루즈핏';
 assert.deepEqual(officialSellingPoints(noise),[]);
 for(const description of ['슬림핏 레글러핏 루즈핏.','클래식한 일자 Elo] 더해진 크루넥 경량.','다양한 아이템과 믹스 매치가 가능해 데일리 룩부터.'])assert.equal(usableSellingPoints([{title:'핏과 실루엣',description,evidence:description}],description),false);
 const broken='적당한 여유의 AlolTl 안정적인 기장감으로 편안한 착용김을 제공하며,';assert.equal(usableSellingPoints([{title:'편안한 착용감',description:broken+'.',evidence:broken}],broken),false);assert.deepEqual(officialSellingPoints(broken),[]);
 const benefit='입체적인 패턴 설계로 제작되어 세련된 핏을 완성했으며,\n편안한 활동성을 제공합니다.';
 const source=noise+'\n•\n'+benefit;
 const points=officialSellingPoints(source);assert.equal(points.length,1);assert.equal(points[0].title,'움직임은 편안하게');assert.match(points[0].evidence,/편안한 활동성/);assert(usableSellingPoints(points,source));
});

test('보온·활동·코디·환경의 구매 장점을 근거와 함께 정리하며 품번별 예외를 쓰지 않는다',()=>{
 const source='클래식한 일자 퀼팅이 더해진 크루넥 경량 자켓입니다. 입체적인 패턴 설계로 제작되어 세련된 핏을 완성했으며, 편안한 활동성을 제공합니다. 따뜻하면서 형태감이 유지되는 에코로프트 충전재를 사용하였습니다. 폐원단과 재활용 플라스틱, 천연 섬유를 활용한 지속 가능한 충전재로 제작되어 환경에 대한 부담을 줄이면서도 충분한 보온 성능을 구현했습니다. 데님, 슬랙스, 스커트 등 다양한 아이템과 믹스 매치가 가능해 데일리 룩부터 세미 포멀 룩까지 폭넓게 연출할 수 있는 실용적인 아이템입니다.';
 const points=officialSellingPoints(source);assert.deepEqual(points.map(p=>p.title),['쌀쌀할 때도 따뜻하게','움직임은 편안하게','다양한 코디에 두루','환경 부담을 줄인 선택']);assert(usableSellingPoints(points,source));
 assert.deepEqual(officialSellingPoints('YKK 지퍼를 사용했습니다. 20D 고밀도 나일론 원단입니다. 면 100%. 3 COLORS. 와이드 핏.'),[]);
 const unrelated=officialSellingPoints('가벼우면서도 우수한 보온성을 제공하는 충전재입니다.');assert(unrelated.every(p=>!p.description.includes('에코로프트')),'일반 보온 문장에 특정 충전재 이름을 추정하지 않는다');
});
test('공식 설명의 실루엣·터틀넥·원단 세 근거로 간결한 소구점을 만든다',()=>{
 const description='몸에 자연스럽게 밀착되는 슬림한 실루엣으로 단독 착용은 물론 레이어드 스타일링에도 활용하기 좋습니다. 적당한 폭의 터틀넥을 적용해 부담스럽지 않은 착용감을 더했으며, 코어 컬러입니다. 130g/㎡의 폴리 레이온 스판 저지 원단을 사용해 부드럽고 실키한 텍스처와 가볍고 편안한 착용감을 제공합니다.';
 const points=officialSellingPoints(description);assert.equal(points.length,3);assert(usableSellingPoints(points));assert(points.every(p=>description.includes(p.evidence)));
 assert.deepEqual(points.map(p=>p.title),['가볍고, 실키하게','슬림하게, 레이어드','부담 적은 터틀넥']);
 assert.equal(officialSellingPoints('').length,0);assert.equal(usableSellingPoints(points,'다른 상품의 원문'),false);
 assert.equal(usableSellingPoints([{title:'혼용 소재',description:'혼용 여부는 아래 소재 정보를 확인해 주세요.',evidence:description}]),false);
});

test('공식 POINT도 정보 이름만 나열하지 않고 실제 구매 이점이 있을 때만 사용한다',()=>{
 const text='POINT 01 (핏)\n테이퍼드 실루엣\n밑단으로 갈수록 좁아지는 라인.\nPOINT 02 (디테일)\n히든 밴딩\n허리 안쪽에 밴딩을 적용했습니다.';assert.deepEqual(officialSellingPoints(text),[]);
 const benefits=text.replace('허리 안쪽에 밴딩을 적용했습니다.','허리 안쪽 히든 밴딩으로 편안한 착용감을 제공합니다.');const points=officialSellingPoints(benefits);assert.equal(points.length,1);assert.equal(points[0].title,'히든밴딩, 편안하게');assert(usableSellingPoints(points,benefits));
});

test('두 특징을 먼저 찾아도 공식 POINT 03을 빠뜨리지 않고 원문 순서를 유지한다',()=>{
 const text='몸에 자연스럽게 밀착되는 슬림한 실루엣으로 레이어드에도 활용하기 좋습니다. 적당한 폭의 터틀넥으로 부담스럽지 않은 착용감을 더했으며.\nPOINT 01 (실루엣)\n슬림 실루엣\n몸에 자연스럽게 밀착되는 슬림한 실루엣.\nPOINT 02 (디테일)\n적당한 폭의 터틀넥\n부담스럽지 않은 착용감.\nPOINT 03 (원단)\n면 모달 원단\n부드러운 촉감의 원단을 사용했습니다.';const points=officialSellingPoints(text);assert.equal(points.length,3);assert.equal(points[2].title,'부드러운 착용감');assert(usableSellingPoints(points,text));
 const rib=text.replace('면 모달 원단\n부드러운 촉감의 원단을 사용했습니다.','280g/㎡의 레이온 스판 립 원단을 사용해 소프트한 텍스처와 톡톡한 두께감이 특징입니다.');const result=officialSellingPoints(rib);assert.equal(result.length,3);assert.equal(result[2].title,'톡톡하고, 부드럽게');
});

test('모든 의류의 표시 문구는 짧게 요약하고 긴 원문과 문단 나열은 근거에만 보관한다',()=>{
 const text='히든 밴딩 울트라 스트레치 치노 팬츠입니다. 탁월한 신축성과 웨이스트 라인의 히든 밴딩 디테일로 유연한 움직임과 편안한 착용감을 제공합니다. 클래식한 디자인과 고급스러운 소재감으로 캐주얼과 스마트한 스타일 모두에 자연스럽게 어우러지는 실용적인 아이템입니다. 스판사가 원단의 가로/세로 양방향 모두 들어 있는 사방 스판 원단으로 착용감이 뛰어납니다. 브러쉬드 가공으로 보온력이 우수하며 부드러운 터치감으로 겨울에도 따뜻하게 착용하기 좋습니다.';
 const points=officialSellingPoints(text);assert.equal(points.length,3);assert(points.every(p=>p.title.length<=18&&p.description.length<=42&&p.title!==p.description));assert(usableSellingPoints(points,text));assert.deepEqual(points.map(p=>p.title),['히든밴딩, 편안하게','사방으로, 유연하게','부드럽고, 따뜻하게']);
 assert.equal(officialSellingPoints('아주 긴 소개문을 그대로 상품 제목과 설명에 반복하는 방식은 사용하지 않으며 검토가 필요한 새로운 상품입니다.').length,0);assert.equal(usableSellingPoints([{title:'짧은 제목',description:text,evidence:text}],text),false);
});

test('공식 퀼팅 패딩에서도 고밀도·소재명 정보로 소구점 수를 채우지 않는다',()=>{
 const text='어니언 퀼팅의 크루넥 경량 자켓입니다. PTT 소재로 제작되어 보온성이 우수하고 복원력이 뛰어난 것이 특징입니다. 겉감은 20D 고밀도 나일론 원단으로 제작되었습니다.';
 const points=officialSellingPoints(text);assert.equal(points.length,2);for(const p of points){assert(p.title.length<=18);assert(p.description.length<=42);assert(text.includes(p.evidence));}assert(points.every(p=>!p.title.includes('고밀도')));
});

test('공식 레귤러핏·컴팩트 코튼·가먼트 워시 문장을 짧은 소구점으로 정리한다',()=>{
 const text='베이직한 라운드넥 디자인과 자연스럽게 떨어지는 어깨선의 레귤러 핏으로, 체형에 구애받지 않고 편안하게 착용할 수 있는 긴팔 티셔츠입니다. 100% 20수 컴팩트 코튼(205gsm) 싱글 저지 원단을 사용해 부드러우면서도 탄탄한 착용감을 제공하며, 가먼트 워시 가공을 적용해 세탁 후 수축을 최소화했습니다.';
 const points=officialSellingPoints(text);assert.equal(points.length,3);assert(usableSellingPoints(points,text));assert.deepEqual(points.map(p=>p.title),['자연스러운 레귤러핏','부드럽고, 탄탄하게','워싱으로, 안정감 있게']);
});

test('마침표 없는 공식 불릿 설명도 원단·핏·디테일 세 특징을 각각 근거로 정리한다',()=>{
 const source='다양한 이너와 함께 클래식하게 활용하기 좋은 발마칸 코트 • 울 50%와 캐시미어 5% 혼방 소재로 부드러운 촉감과 우수한 보온성 • 밑단으로 갈수록 자연스럽게 넓어지는 A라인 실루엣과 무릎 기장으로 여유로운 핏 • 히든 버튼 여밈과 탈부착 가능한 카라 비조를 적용해 깔끔하고 실용적인 디자인 • 래글런 슬리브와 소매 벨트 디테일, 웰트 포켓 및 뒷면 슬릿으로 활동성과 완성도를 높인 아이템';
 const points=officialSellingPoints(source);assert.equal(points.length,4);assert(usableSellingPoints(points,source));assert.deepEqual(points.slice(0,3).map(p=>p.title),['부드럽고, 따뜻하게','여유롭게 흐르는 A라인','깔끔하고, 실용적으로']);assert(points.every(p=>!p.evidence.includes('•')));
 assert.equal(officialSellingPoints('울 50%와 캐시미어 5% 혼방 소재 • 부드러운 촉감과 우수한 보온성').length,0);
});

test('모든 상품 소구점의 브러시드 표시는 기모로 통일하고 원문 근거를 보존한다',()=>{
 for(const word of ['브러쉬드','브러시드','brushed','BRUSHED']){
  const evidence=word+' 가공으로 보온력이 우수하고 따뜻합니다.';
  const [point]=displaySellingPoints([{title:word+'의 따뜻함',description:word+' 가공으로 포근하게.',evidence}]);
  assert.equal(point.title,'기모의 따뜻함');assert.equal(point.description,'기모 가공으로 포근하게.');assert.equal(point.evidence,evidence);
 }
 const source='브러쉬드 가공으로 보온력이 우수하고 따뜻합니다.';
 const points=officialSellingPoints(source);assert(points.length);assert(points.every(p=>!/브러쉬드|브러시드/.test(p.title+p.description)));assert(points.some(p=>p.evidence.includes('브러쉬드')));
});
