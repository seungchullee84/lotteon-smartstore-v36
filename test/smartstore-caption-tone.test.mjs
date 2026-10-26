import test from 'node:test';import assert from 'node:assert/strict';import {readableCaptionTone,toneContrast} from '../smartstore-caption-tone.mjs';import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
test('화이트·크림 등 밝은 칩은 흰색과 연한 배경에서 읽히는 같은 색조로 보정한다',()=>{
 for(const color of [[255,255,255],[248,240,218],[196,179,145],[18,31,50],[20,20,20]]){const text=rgb(readableCaptionTone(color));assert(toneContrast(text)>=4.5);assert(toneContrast(text,[255,255,255])>=4.5);}
 const cream=rgb(readableCaptionTone([248,240,218]));assert(cream[0]>cream[1]&&cream[1]>cream[2]);assert.equal(readableCaptionTone([18,31,50]),'#121f32');
});
test('색상 위 짧은 문구에만 공식 칩 톤을 쓰고 큰 공식 색상명은 기존 색을 유지한다',()=>{
 const p={style:'123456',name:'팬츠',images:{},colors:['01브리티쉬카키'],smartstoreDetail:{style:'123456',colorImages:{'01브리티쉬카키':['https://example.com/p.jpg']},captionTones:{'01브리티쉬카키':'#78694e'}}};const html=buildSmartstoreDetail(p).html;assert.match(html,/color:#78694e/);assert.match(html,/font-size:48px[^>]*color:#213c2e/);assert(!html.includes('color:undefined'));
});
