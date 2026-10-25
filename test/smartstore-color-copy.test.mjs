import test from 'node:test';import assert from 'node:assert/strict';
import {colorCaption,COLOR_CAPTION_GROUPS} from '../smartstore-color-copy.mjs';import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
test('색상명에 따라 짧은 분위기 문구를 고르고 미확정·혼합 색상에는 공통 문구를 쓴다',()=>{
 assert.equal(colorCaption('01크림'),'포근하게 밝히는 크림빛');assert.equal(colorCaption('02베이지'),'차분함을 입힌 베이지');
 assert.equal(colorCaption('03네이비'),'차분함에 더한 세련된 깊이');assert.equal(colorCaption('01화이트/블랙'),'색과 색이 이루는 조화');assert.equal(colorCaption('알 수 없음'),'색감으로 더하는 포인트');
 assert.equal(colorCaption('01틸그린'),'푸른빛 감도는 깊은 매력');assert.notEqual(colorCaption('차콜'),colorCaption('라이트그레이'));assert.notEqual(colorCaption('팀버'),colorCaption('알 수 없음'));
 for(const [,values]of COLOR_CAPTION_GROUPS)for(const text of values)assert(text.length<=14,text);
 const repeat=colorCaption('01크림',{style:'356954'});assert.equal(colorCaption('01크림',{style:'356954'}),repeat);assert(new Set(['026981','026982','326931','356954','115915'].map(style=>colorCaption('01크림',{style}))).size>1);
 for(const color of ['크림','베이지','브라운','네이비','블랙','그레이','화이트','버건디','핑크','블루','그린','레드','옐로','퍼플','오렌지','알 수 없음'])assert(colorCaption(color).length<=14);
});
test('색상별 착용사진 제목에 COLOR 순번 대신 색상별 문구를 쓰고 공식 색상명은 보존한다',()=>{
 const p={style:'356954',images:{detail:'https://example.com/detail.jpg'},colors:['01크림','02베이지'],colorImages:{'01크림':['https://example.com/cream.jpg'],'02베이지':['https://example.com/beige.jpg']}};
 const html=buildSmartstoreDetail(p).html;assert(!html.includes('>COLOR 01<'));assert(!html.includes('>COLOR 02<'));assert(html.includes(colorCaption('01크림',{style:p.style})));assert(html.includes(colorCaption('02베이지',{style:p.style})));assert(html.includes('01크림'));assert(html.includes('02베이지'));
});
