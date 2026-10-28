import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/website-daily.js';
const summary=globalThis.websiteDailySummary;
const event=(type,style,extra={})=>({type,style,name:'성인 상품 '+style,sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+style,changes:type==='new'?['새로 발견한 성인 상품']:['공식 상세이미지 변경'],...extra});
const batch=(checkedAt,events)=>({checkedAt,events});
test('마지막 점검이 0건이어도 오늘 발견한 신상품·변경 상품을 누적한다',()=>{
 const result=summary({batches:[batch('2026-10-28T01:00:00Z',[event('new','216710')]),batch('2026-10-28T01:20:00Z',[event('new','216701'),event('changed','026993')]),batch('2026-10-28T01:40:00Z',[])]},'2026-10-28T02:00:00Z');
 assert.equal(result.newCount,2);assert.equal(result.changedCount,1);assert.equal(result.events.length,3);
});
test('같은 상품 반복 감지는 중복 집계하지 않고 최초 시각·최근 상태를 유지한다',()=>{
 const website={batches:[batch('2026-10-28T01:00:00Z',[event('changed','026993',{status:'analyzing'})]),batch('2026-10-28T02:00:00Z',[event('changed','026993',{status:'ready',changes:['공식 상세페이지 추가']})])]};
 const before=JSON.stringify(website),result=summary(website,'2026-10-28T03:00:00Z');
 assert.equal(result.changedCount,1);assert.equal(result.events[0].status,'ready');assert.equal(result.events[0].firstCheckedAt,'2026-10-28T01:00:00Z');assert.equal(result.events[0].checkedAt,'2026-10-28T02:00:00Z');assert.equal(result.events[0].changes.length,2);assert.equal(JSON.stringify(website),before);
});
test('한국 시간 자정에 오늘 집계가 바뀌고 전날 기록은 이전 기록으로 이동한다',()=>{
 const website={batches:[batch('2026-10-27T14:59:59Z',[event('new','216710')]),batch('2026-10-27T15:00:00Z',[event('new','216701')])]};
 const result=summary(website,'2026-10-27T15:00:01Z');assert.equal(result.day,'2026-10-28');assert.equal(result.newCount,1);assert.equal(result.events[0].style,'216701');assert.equal(result.history[0].style,'216710');
 const next=summary(website,'2026-10-28T15:00:00Z');assert.equal(next.newCount,0);assert.equal(next.changedCount,0);assert.equal(next.hasTodayCheck,false);assert.equal(next.history.length,2);
});
test('소구점 완료·상품정보 차이는 변경에서 제외하고 신상품과 이미지 변경은 유형별 집계',()=>{
 const result=summary({batches:[batch('2026-10-28T01:00:00Z',[event('new','216710'),event('changed','216710'),event('changed','111111',{changes:['상품 원문·정보 변경']}),event('analyzed','222222')])]},'2026-10-28T03:00:00Z');
 assert.equal(result.newCount,1);assert.equal(result.changedCount,1);assert.equal(result.events.length,2);
});
test('다시 불러온 저장 기록에도 같은 일일 누적을 표시한다',()=>{
 const cache=JSON.parse(JSON.stringify({checkedAt:'2026-10-28T02:00:00Z',batches:[batch('2026-10-28T01:00:00Z',[event('new','216710')]),batch('2026-10-28T02:00:00Z',[])]}));
 assert.equal(summary(cache,'2026-10-28T03:00:00Z').newCount,1);
 assert.equal(summary(null,'2026-10-28T03:00:00Z').newCount,0);
});
test('상세이미지 최초 추가도 오늘 변경 누적에 포함하고 재확인은 중복 집계하지 않는다',()=>{
 const added=event('changed','026993',{changes:['공식 상세이미지 추가']});
 const result=summary({batches:[batch('2026-10-28T02:20:00Z',[added]),batch('2026-10-28T02:40:00Z',[added]),batch('2026-10-28T03:00:00Z',[])]},'2026-10-28T04:00:00Z');
 assert.equal(result.changedCount,1);assert.deepEqual(result.events[0].changes,['공식 상세이미지 추가']);
});
test('오늘·어제·그제만 보여주며 4일 전 기록은 제외하고 같은 품번도 날짜별로 집계한다',()=>{
 const batches=[24,25,26,27,28].map(date=>batch('2026-10-'+date+'T01:00:00Z',[event('new','216710'),event('changed','026993')]));
 const result=summary({batches},'2026-10-28T04:00:00Z');
 assert.deepEqual(result.days.map(day=>day.day),['2026-10-28','2026-10-27','2026-10-26']);assert.deepEqual(result.days.map(day=>day.label),['오늘','어제','그제']);
 assert(result.days.every(day=>day.newCount===1&&day.changedCount===1));assert.equal(result.history.length,4);assert(!result.history.some(e=>e.day<'2026-10-26'));
});
test('이전 날짜 상품도 30건에서 자르지 않아 표시 건수와 전체 목록이 일치한다',()=>{
 const events=Array.from({length:40},(_,i)=>event('new',String(200000+i)));
 const result=summary({batches:[batch('2026-10-27T01:00:00Z',events)]},'2026-10-28T04:00:00Z');
 assert.equal(result.days[1].newCount,40);assert.equal(result.days[1].events.length,40);assert.equal(result.history.length,40);assert.equal(result.days[2].hasCheck,false);
});
