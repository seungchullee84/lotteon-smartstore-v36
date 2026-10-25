import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {searchProductTags,saveSelectedProductTags,selectedProductTagResearch,removeProductTag} from '../smartstore-tag-selection.mjs';
const product={style:'326932',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',rawName:'브러시드 테리 후드 풀오버',gender:'여성',officialDescription:'안쪽 기모 처리'};
const index={tags:['여성후드티','기모후드티','남성후드티','여성니트','후디'].map((name,n)=>({name,id:String(n+1),decision:'include',kind:'garment'})).concat({name:'기모후드티코디',id:'9',decision:'exclude',kind:'garment'})};
test('단어로 연관 사전 태그를 찾고 현재 상품 근거와 현재 검색 검증 여부를 구분한다',()=>{
 const r=searchProductTags(product,'후드',{index});assert(r.items.some(t=>t.name==='여성후드티'&&t.related));assert(r.items.some(t=>t.name==='남성후드티'&&!t.related));assert(!r.items.some(t=>t.name.includes('코디')));assert(r.items.every(t=>t.dictionaryObserved&&!t.searchVerified));assert(r.items.slice(0,2).every(t=>t.related));
 assert.throws(()=>searchProductTags(product,' ',{index}),/1~40/);
});
test('직접 선택은 상품 근거 없음도 원본 사전 ID로 보관하며 자동 추천에는 섞지 않는다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'selected-tags-'));try{
  const tags=[{id:'1',name:'여성후드티'},{id:'2',name:'기모후드티'}];await saveSelectedProductTags(product,tags,{dataRoot,index});
  const chosen=selectedProductTagResearch(product,{dataRoot,index});assert.equal(chosen.manual,true);assert.deepEqual(chosen.candidates,tags);
  assert.notEqual(selectedProductTagResearch({...product,style:'026982'},{dataRoot,index}).manual,true);
  for(const invalid of [[{id:'1',name:'남성후드티'}],[{id:'9',name:'기모후드티코디'}],[...tags,tags[0]]])await assert.rejects(()=>saveSelectedProductTags(product,invalid,{dataRoot,index}));
  await removeProductTag(product,tags[0],{dataRoot,index});assert.deepEqual(selectedProductTagResearch(product,{dataRoot,index}).candidates,[tags[1]]);
  await removeProductTag(product,tags[1],{dataRoot,index});const empty=selectedProductTagResearch(product,{dataRoot,index});assert.equal(empty.manual,true);assert.deepEqual(empty.candidates,[],'삭제한 태그를 자동으로 다시 채우지 않음');
  const unrelated=[{id:'3',name:'남성후드티'},{id:'4',name:'여성니트'}];await saveSelectedProductTags(product,unrelated,{dataRoot,index});assert.deepEqual(selectedProductTagResearch(product,{dataRoot,index}).candidates,unrelated);
  assert(!selectedProductTagResearch({...product,style:'026982'},{dataRoot,index}).candidates.some(t=>t.id==='3'||t.id==='4'));
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
