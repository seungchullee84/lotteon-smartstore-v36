import test from 'node:test';
import assert from 'node:assert/strict';
import {LotteAutomation} from '../automation.mjs';
import {SmartstoreAutomation,SMARTSTORE_HOME} from '../smartstore-automation.mjs';
import {requireChannel} from '../channel-routing.mjs';
import {copyStartUrl} from '../smartstore-learned.mjs';
const lotte='https://together.lotteshopping.com/EMDV3/index.html';
const smart='https://sell.smartstore.naver.com/#/products/create';
function page(url){return {url:()=>url,isClosed:()=>false,gotos:[],setDefaultTimeout(){},async goto(next){this.gotos.push(next);url=next;},async bringToFront(){this.front=true;}};}
function attach(bot,pages){bot.connectChrome=async url=>{bot.initialURL=url;bot.context={pages:()=>pages,async newPage(){const p=page('about:blank');pages.push(p);return p;},async newCDPSession(){return {async send(){return {windowId:1};},async detach(){}};}};};return bot;}
test('각 채널 연결은 함께 열린 다른 채널 화면을 변경하지 않는다',async()=>{
 for(const [Type,target,other] of [[SmartstoreAutomation,smart,lotte],[LotteAutomation,lotte,smart]]){
  const a=page(other),b=page(target),bot=attach(new Type('.',()=>{}),[a,b]);await bot.open();assert.equal(bot.page,b);assert.equal(bot.initialURL,Type===SmartstoreAutomation?SMARTSTORE_HOME:target);assert.deepEqual(a.gotos,[]);assert.equal(a.front,undefined);
 }
});
test('로그인 버튼은 사용자가 선택한 메뉴와 수정 화면을 강제로 이동시키지 않는다',async()=>{
 const edit=page('https://sell.smartstore.naver.com/#/products/update/123'),create=page(smart);
 const bot=attach(new SmartstoreAutomation('.',()=>{}),[edit,create]);await bot.open();assert.equal(bot.page,edit);
 const blocked=attach(new SmartstoreAutomation('.',()=>{}),[edit]);await blocked.open();assert.deepEqual(edit.gotos,[]);
});
test('스마트스토어만 열 때 롯데ON 탭을 새로 만들지 않는다',async()=>{
 const pages=[page(lotte)],bot=attach(new SmartstoreAutomation('.',()=>{}),pages);await bot.open();assert.equal(pages.length,2);assert.deepEqual(pages[0].gotos,[]);assert.deepEqual(pages[1].gotos,[SMARTSTORE_HOME]);
});
test('이전 화면의 채널 누락은 호환하고 명시한 다른 채널은 차단한다',()=>{
 for(const endpoint of ['open','run','smartstore-open','smartstore-plan','smartstore-test','smartstore-tags-selection']){
  const expected=endpoint.startsWith('smartstore')?'smartstore':'lotte';assert.equal(requireChannel(endpoint,expected),expected);assert.equal(requireChannel(endpoint),expected);assert.throws(()=>requireChannel(endpoint,expected==='lotte'?'smartstore':'lotte'));
 }
 assert.equal(requireChannel('collect'),undefined);
});
test('중단은 해당 자동화 연결만 종료한다',async()=>{
 const a=new LotteAutomation('.',()=>{}),b=new SmartstoreAutomation('.',()=>{});let closedA=0,closedB=0;a.browser={close:async()=>closedA++};b.browser={close:async()=>closedB++};await b.stop();assert.equal(closedA,0);assert.equal(closedB,1);assert.equal(a.stopped,false);assert.equal(b.stopped,true);
});
test('시작은 사용자가 직접 연 복사등록 한 곳에만 연결하고 고정 복사 URL로 이동하지 않는다',async()=>{
 const chosen=page('https://sell.smartstore.naver.com/#/products/copy/987654321');const home=page(SMARTSTORE_HOME);
 const bot=attach(new SmartstoreAutomation('.',()=>{}),[home,chosen]);await bot.bindCopyForm();assert.equal(bot.page,chosen);assert.deepEqual(home.gotos,[]);assert.deepEqual(chosen.gotos,[]);
 const missing=attach(new SmartstoreAutomation('.',()=>{}),[home]);await assert.rejects(()=>missing.bindCopyForm(),/직접 열고/);assert.deepEqual(home.gotos,[]);
 const duplicate=attach(new SmartstoreAutomation('.',()=>{}),[chosen,page('https://sell.smartstore.naver.com/#/products/copy/123')]);await assert.rejects(()=>duplicate.bindCopyForm(),/여러 개/);
});
