import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {requireChannel} from '../channel-routing.mjs';

test('조합 버튼은 2번 바로 아래에 있으며 클릭 전 작업하지 않고 조합·수집만 요청한다',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<button id="collect">[^<]*<\/button><button id="smartstoreCombinePhotos"[^>]*>[^<]*마네킨샷\+공홈 조합 수집<\/button>/);
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),handler=source.slice(source.lastIndexOf("$('smartstoreCombinePhotos').onclick="));
 for(const [input,expected]of [['326931','smartstore-combine-photos'],['416963','collect']]){
  const calls=[],elements={style:{value:input},smartstoreCombinePhotos:{}};
  const context={$:id=>elements[id],activeChannel:()=> 'smartstore',requestLock:false,serverBusy:false,product:{style:'326931',sourceUrl:'https://www.giordano.co.kr/current'},post:async(...args)=>calls.push(args),announce:()=>{},syncButtons:()=>{},refresh:async()=>{}};
  vm.runInNewContext(handler,context);assert.equal(calls.length,0,'페이지 표시만으로 실행하지 않음');
  await elements.smartstoreCombinePhotos.onclick();assert.deepEqual(calls.map(c=>c[0]),[expected]);assert.equal(calls[0][1].channel,'smartstore');
  assert(!calls.some(c=>/upload|auto$|run$|detail-only/.test(c[0])));
 }
 assert.equal(requireChannel('smartstore-combine-photos','smartstore'),'smartstore');
 assert.throws(()=>requireChannel('smartstore-combine-photos','lotte'));
});
