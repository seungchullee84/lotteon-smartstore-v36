import test from 'node:test';
import assert from 'node:assert/strict';
import {learnedFields,assertLearnedFields,fillLearnedAttributes,assertDictionaryTags,verifySearchTagGroups,sellerProductCode,tagCandidates,planTagChanges} from '../smartstore-learned.mjs';
test('gender and season tags follow product evidence rather than the current month',()=>{
 const summer=tagCandidates({style:'123456',gender:'여성',name:'여성 여름 반팔 가디건',material:'면100%'});
 assert.ok(summer.includes('여자니트'));assert.ok(summer.includes('여름가디건'));assert.ok(!summer.some(t=>t.includes('겨울')));
 const winter=tagCandidates({style:'123456',gender:'남성',name:'남성 긴팔 기모 니트',material:'면100%'});
 assert.ok(winter.includes('남자니트'));assert.ok(winter.includes('겨울니트'));assert.ok(!winter.some(t=>/여자|여성/.test(t)));
 const uncertain=tagCandidates({style:'123456',name:'긴팔 가디건',material:'아크릴100%'});
 assert.ok(!uncertain.some(t=>/겨울|여름|여자|여성|남자|남성/.test(t)));
});
test('356938 retains all ten valid tags even when their order differs',()=>{
 const names=tagCandidates({style:'356938',name:'여성 카라 긴팔 가디건'}).slice(0,10);
 const existing=[...names].reverse().map((name,i)=>({name,id:String(i+1)}));
 assert.equal(planTagChanges(existing,names).filter(t=>t.keep).length,10);
 const changed=[...existing.slice(1),{name:'관계없는태그',id:'999'}];
 assert.equal(planTagChanges(changed,names).filter(t=>!t.keep).length,1);
});
test('free text and duplicated dictionary ids are never retained for speed',()=>{
 assert.deepEqual(planTagChanges([{name:'a',id:''},{name:'b',id:'1'},{name:'a',id:'1'}],['a','b']).map(t=>t.keep),[false,true,false]);
});
test('seller code preserves six digit style and limits only the short name to seven characters',()=>{
 assert.equal(sellerProductCode({style:'356944',name:'지오다노 여성 집업 긴팔 꽈배기 가디건 356944'}),'356944 꽈배기가디건');
 assert.equal(sellerProductCode({style:'356956',name:'지오다노 남성 아가일 브이넥 니트 356956'}),'356956 아가일니트');
 assert.ok(sellerProductCode({style:'123456',name:'아주긴상품명테스트입니다'}).split(' ')[1].length<=7);
 assert.throws(()=>sellerProductCode({style:'12345',name:'니트'}));
});
test('verified copy product uses actual materials, stand collar, long sleeves and first day',()=>{
 const f=learnedFields({style:'356944',material:'아크릴 54%, 폴리에스터 26%, 나일론 20%',manufactured:'2026-08'});
 assert.deepEqual(f.materials,['아크릴','폴리에스테르','나일론']);
 assert.equal(f.neckline,'스텐드/차이나칼라');assert.equal(f.sleeve,'긴팔');assert.equal(f.manufactureDate,'2026-08-01');assert.equal(f.tags,undefined);
});
test('a different product never inherits cardigan tags or a guessed neckline',()=>{
 const f=learnedFields({style:'123456',name:'반팔 티셔츠',material:'면 100%',manufactured:'2025-01'});
 assert.equal(f.tags,undefined);assert.equal(f.neckline,null);assert.equal(f.sleeve,'반팔');assert.deepEqual(f.materials,['면']);
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

test('076931 uses reviewed padded outerwear attributes without knit, genuine leather or feather tags',()=>{
 const f=learnedFields({style:'076931',name:'남성 스웨이드 목넥 패딩 푸퍼 076931',material:'폴리에스터 100%',manufactured:'2026-09'});
 assert.equal(f.sleeve,'긴팔');assert.equal(f.neckline,'스텐드/차이나칼라');assert.deepEqual(f.materials,['폴리에스테르']);
 assert.equal(f.tags,undefined);
});
test('only attributes exposed by the selected copy category are required',()=>{
 const fields={materials:['폴리에스테르'],tags:Array.from({length:10},(_,i)=>'t'+i),sleeve:null,neckline:null};
 assert.equal(assertLearnedFields(fields,['주요소재','총기장','종류','핏','충전재']),fields);
 assert.throws(()=>assertLearnedFields(fields,['소매기장']),/소매기장/);
 assert.throws(()=>assertLearnedFields({...fields,sleeve:'긴팔'},['소매기장','네크라인']),/네크라인/);
 assert.equal(assertLearnedFields({...fields,tags:[]},[]).tags.length,0);
 const {tags,...withoutTags}=fields;assert.equal(assertLearnedFields(withoutTags,[]),withoutTags);
 assert.throws(()=>assertLearnedFields({...withoutTags,materials:[]},[]),/소재/);
});

test('376921 has photo-reviewed long sleeves even when the title omits sleeve length, without generating tags',()=>{
 const f=learnedFields({style:'376921',name:'여성 숏 푸퍼 러버 자켓',material:'폴리우레탄 100%',get smartstoreTags(){throw Error('Manual tags must not be read');}});
 assert.equal(f.sleeve,'긴팔');assert.equal(f.neckline,'스텐드/차이나칼라');assert.equal(f.tags,undefined);
 assert.equal(assertLearnedFields(f,['주요소재','소매기장']),f);
 const other=learnedFields({style:'123456',name:'여성 자켓',material:'폴리우레탄 100%'});
 assert.equal(other.sleeve,null);assert.throws(()=>assertLearnedFields(other,['소매기장']),/소매기장/);
});
test('absent sleeve and neckline rows are skipped without touching copied category attributes',async()=>{
 const fields={materials:['폴리에스테르'],sleeve:'긴팔',neckline:'스텐드/차이나칼라'};const inspected=[];
 const page={getByRole:()=>({getByRole:()=>({filter:({hasText})=>{inspected.push(hasText);if(hasText==='주요소재')return {getByRole:()=>({count:async()=>0})};return {count:async()=>0};}})})};
 await fillLearnedAttributes(page,fields);assert.deepEqual(inspected,['주요소재','소매기장','네크라인']);
});

test('additional attributes follow the verified style and never carry heavy-down or an invented filling weight',()=>{
 const f=learnedFields({style:'076931',name:'남성 스웨이드 목넥 패딩 푸퍼',material:'폴리에스터 100%'});assert.equal(f.attributes['충전재'],'솜/폴리에스테르');assert.deepEqual(f.attributes['특징'],['경량','방풍']);assert.equal(f.attributes['충전량(최소)'],undefined);
 const other=learnedFields({style:'123456',name:'남성 패딩',material:'폴리에스터 100%'});assert.equal(other.attributes['핏'],undefined);assert.equal(other.attributes['특징'],undefined);assert.equal(other.attributes['사용대상'],'남성용');
});
