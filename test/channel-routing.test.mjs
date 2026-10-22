import test from 'node:test';
import assert from 'node:assert/strict';
import {LotteAutomation} from '../automation.mjs';
import {SmartstoreAutomation} from '../smartstore-automation.mjs';
import {requireChannel} from '../channel-routing.mjs';
const lotte='https://together.lotteshopping.com/EMDV3/index.html';
const smart='https://sell.smartstore.naver.com/#/products/create';
function page(url){return {url:()=>url,isClosed:()=>false,gotos:[],setDefaultTimeout(){},async goto(next){this.gotos.push(next);url=next;},async bringToFront(){this.front=true;}};}
function attach(bot,pages){bot.connectChrome=async url=>{bot.initialURL=url;bot.context={pages:()=>pages,async newPage(){const p=page('about:blank');pages.push(p);return p;},async newCDPSession(){return {async send(){return {windowId:1};},async detach(){}};}};};return bot;}
test('각 채널 연결은 함께 열린 다른 채널 화면을 변경하지 않는다',async()=>{
 for(const [Type,target,other] of [[SmartstoreAutomation,smart,lotte],[LotteAutomation,lotte,smart]]){
  const a=page(other),b=page(target),bot=attach(new Type('.',()=>{}),[a,b]);await bot.open();assert.equal(bot.page,b);assert.equal(bot.initialURL,target);assert.deepEqual(a.gotos,[]);assert.equal(a.front,undefined);
 }
});
test('스마트스토어 신규 화면을 수정 화면보다 우선하며 수정 화면만 있으면 보존한다',async()=>{
 const edit=page('https://sell.smartstore.naver.com/#/products/update/123'),create=page(smart);
 const bot=attach(new SmartstoreAutomation('.',()=>{}),[edit,create]);await bot.open();assert.equal(bot.page,create);
 const blocked=attach(new SmartstoreAutomation('.',()=>{}),[edit]);await assert.rejects(()=>blocked.open(),/수정 중/);assert.deepEqual(edit.gotos,[]);
});
test('스마트스토어만 열 때 롯데ON 탭을 새로 만들지 않는다',async()=>{
 const pages=[page(lotte)],bot=attach(new SmartstoreAutomation('.',()=>{}),pages);await bot.open();assert.equal(pages.length,2);assert.deepEqual(pages[0].gotos,[]);assert.deepEqual(pages[1].gotos,[smart]);
});
test('이전 화면의 채널 누락은 호환하고 명시한 다른 채널은 차단한다',()=>{
 for(const endpoint of ['open','run','smartstore-open','smartstore-plan','smartstore-test']){
  const expected=endpoint.startsWith('smartstore')?'smartstore':'lotte';assert.equal(requireChannel(endpoint,expected),expected);assert.equal(requireChannel(endpoint),expected);assert.throws(()=>requireChannel(endpoint,expected==='lotte'?'smartstore':'lotte'));
 }
 assert.equal(requireChannel('collect'),undefined);
});
test('중단은 해당 자동화 연결만 종료한다',async()=>{
 const a=new LotteAutomation('.',()=>{}),b=new SmartstoreAutomation('.',()=>{});let closedA=0,closedB=0;a.browser={close:async()=>closedA++};b.browser={close:async()=>closedB++};await b.stop();assert.equal(closedA,0);assert.equal(closedB,1);assert.equal(a.stopped,false);assert.equal(b.stopped,true);
});
