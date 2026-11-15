import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLotteCategory,allLotteStandardPaths,assertLotteCategory} from '../lotte-category-validation.mjs';
import {commonFor} from '../category-catalog.mjs';
import {MENS_UNDERWEAR_CATEGORY} from '../category.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const standard=read('category-catalog-standard.json'),common=read('category-catalog-common.json');
const product={gender:'여성',sourceCategory:['WOMEN','PANTS','트레이닝/스웻팬츠'],rawName:'여성 스웨트 팬츠',category:{commonMiddle:'여성특수목적의류',commonSmall:'여성패션트레이닝복',channelMiddle:'트레이닝복',channelSmall:'트레이닝하의'}};
test('complete fields are checked against one exact parent path and canonical codes',()=>{
 const v=validateLotteCategory(product);assert.equal(v.ready,true,JSON.stringify(v.issues));assert.match(v.category.commonSmall,/00866/);assert.ok(v.category.channelCodes.small);
 const wrong=structuredClone(product);wrong.category.channelMiddle='청바지';assert.equal(validateLotteCategory(wrong).ready,false);assert.throws(()=>assertLotteCategory(wrong),/분류/);
});
test('wrong code, stale detail, gender change, and mismatched common type cannot pass',()=>{
 for(const change of [{commonSmall:'99999 : 여성패션트레이닝복'},{channelCodes:{small:'BC00000000'}},{channelDetail:'없는 세분류'},{commonMiddle:'여성의류하의',commonSmall:'여성청바지'}])assert.equal(validateLotteCategory({...product,category:{...product.category,...change}}).ready,false,JSON.stringify(change));
 assert.equal(validateLotteCategory({...product,gender:'남성'}).ready,false);
});
test('all mapped adult catalogue paths validate and each swapped parent is rejected',()=>{
 let mapped=0,unmapped=0;
 for(const gender of ['남성','여성'])for(const p of allLotteStandardPaths(standard).filter(p=>p.major.name==='브랜드'+gender+'의류')){
   const c=commonFor(p,gender,common);if(!c){unmapped++;continue;}
   const input={gender,category:{commonMajor:c.major,commonMiddle:c.middle,commonSmall:c.small,channelMajor:p.major.name,channelMiddle:p.middle.name,channelSmall:p.small.name,channelDetail:p.detail?.name||''}};
   const v=validateLotteCategory(input);assert.equal(v.ready,true,p.small.name+' '+JSON.stringify(v.issues));
   assert.equal(validateLotteCategory({...input,category:{...input.category,channelMiddle:'다른 부모 분류'}}).ready,false);mapped++;
 }
 assert.equal(mapped,123);assert.equal(unmapped,6);
});
test('missing details and failed catalogue collection remain unverified',()=>{
 const s=structuredClone(standard);const small=s.majors.find(m=>m.name==='브랜드여성의류').middles.find(m=>m.name==='트레이닝복').smalls.find(s=>s.name==='트레이닝하의');small.details=[{code:'BC_TEST',name:'세분류'}];
 assert.ok(validateLotteCategory(product,{standard:s,common}).issues.some(x=>x.code==='channel-detail'));
 assert.equal(validateLotteCategory(product,{standard:{...standard,complete:false},common}).ready,false);
 assert.equal(validateLotteCategory(product,{standard,common:{...common,incomplete:true}}).ready,false);
});
test('explicit underwear rule and individually observed accessory evidence stay usable',()=>{
 assert.equal(validateLotteCategory({gender:'남성',rawName:'지워머 긴팔 내의',sourceCategory:['MEN','INNERWEAR'],category:MENS_UNDERWEAR_CATEGORY}).ready,true);
 assert.equal(validateLotteCategory({gender:'남성',rawName:'일반 팬츠',category:MENS_UNDERWEAR_CATEGORY}).ready,false);
 const scarf={gender:'여성',category:{commonMajor:'L0001 : 패션/장신',commonMiddle:'M0357 : 패션액세서리',commonSmall:'01068 : 머플러',channelMajor:'브랜드잡화/넥타이',channelMiddle:'워머/목도리',channelSmall:'머플러'}};
 assert.equal(validateLotteCategory(scarf).ready,true);
 assert.equal(validateLotteCategory({...scarf,category:{...scarf.category,channelMajor:'잡화',channelMiddle:'워머/머플러',channelSmall:'니트머플러'}}).ready,true);
 assert.equal(validateLotteCategory({...scarf,category:{...scarf.category,commonSmall:'99999 : 머플러'}}).ready,false);
});
