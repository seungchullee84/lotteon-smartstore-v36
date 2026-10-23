import test from 'node:test';
import assert from 'node:assert/strict';
import {learnedFields,assertDictionaryTags,verifySearchTagGroups,sellerProductCode} from '../smartstore-learned.mjs';
test('seller code preserves six digit style and limits only the short name to seven characters',()=>{
 assert.equal(sellerProductCode({style:'356944',name:'지오다노 여성 집업 긴팔 꽈배기 가디건 356944'}),'356944 꽈배기가디건');
 assert.equal(sellerProductCode({style:'356956',name:'지오다노 남성 아가일 브이넥 니트 356956'}),'356956 아가일니트');
 assert.ok(sellerProductCode({style:'123456',name:'아주긴상품명테스트입니다'}).split(' ')[1].length<=7);
 assert.throws(()=>sellerProductCode({style:'12345',name:'니트'}));
});
test('verified copy product uses actual materials, stand collar, long sleeves and first day',()=>{
 const f=learnedFields({style:'356944',material:'아크릴 54%, 폴리에스터 26%, 나일론 20%',manufactured:'2026-08'});
 assert.deepEqual(f.materials,['아크릴','폴리에스테르','나일론']);
 assert.equal(f.neckline,'스텐드/차이나칼라');assert.equal(f.sleeve,'긴팔');assert.equal(f.manufactureDate,'2026-08-01');assert.equal(new Set(f.tags).size,10);
});
test('a different product never inherits cardigan tags or a guessed neckline',()=>{
 const f=learnedFields({style:'123456',name:'반팔 티셔츠',material:'면 100%',manufactured:'2025-01'});
 assert.deepEqual(f.tags,[]);assert.equal(f.neckline,null);assert.equal(f.sleeve,'반팔');assert.deepEqual(f.materials,['면']);
});
test('free text, duplicate ids and incomplete tag sets are rejected',()=>{
 const good=Array.from({length:10},(_,i)=>({name:'tag'+i,id:String(i+1)}));assert.equal(assertDictionaryTags(good).length,10);
 assert.throws(()=>assertDictionaryTags(good.slice(1)));
 assert.throws(()=>assertDictionaryTags([...good.slice(1),good[1]]));
 assert.throws(()=>assertDictionaryTags([...good.slice(1),{name:'new',id:''}]));
});
test('search applicability rejects X and missing tags even with valid dictionary IDs',()=>{
 const tags=Array.from({length:10},(_,i)=>({name:'태그'+i,id:String(i+1)}));
 const valid={status:'태그사전에 등록되어 있습니다. 등록됨',tags:tags.map(t=>'#'+t.name).join('')};
 assert.equal(verifySearchTagGroups(tags,[valid]),true);
 assert.throws(()=>verifySearchTagGroups(tags,[{...valid,status:'태그사전에 등록되어 있지 않습니다. 미등록'}]));
 assert.throws(()=>verifySearchTagGroups(tags,[{...valid,tags:tags.slice(1).map(t=>'#'+t.name).join('')}]));
});
