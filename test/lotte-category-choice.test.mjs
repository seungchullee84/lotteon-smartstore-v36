import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {lotteCategoryChoices,createManualLotteCategory,readManualLotteCategory,saveManualLotteCategory} from '../lotte-category-choice.mjs';
import {bridgeLotteCategory,requireLotteCategoryBridge} from '../lotte-category-bridge.mjs';
import {allLotteStandardPaths} from '../lotte-category-validation.mjs';
import {createProductEditStore,applyProductEdits} from '../product-edits.mjs';
const base={style:'375908',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test-product',gender:'여성',rawName:'여성 패딩',category:{commonMajor:'L0011 : 여성의류',commonMiddle:'M0066 : 여성의류아우터',commonSmall:'00856 : 여성패딩'}};
const manualChoice={common:['L0011','M0066','00856'],channel:['BC34000000','BC34110000','BC34110100','']};
// The first leaf under this parent is a valid manual alternative, regardless of title ranking.
manualChoice.channel[2]=allLotteStandardPaths().find(p=>p.major.code==='BC34000000'&&p.middle.code==='BC34110000'&&p.small.name!=='패딩/다운점퍼').small.code;

test('picker lists saved parents/children, all 83 apparel leaves and only known accessory common paths',()=>{
 const choices=lotteCategoryChoices();
 assert.equal(choices.common.filter(n=>['L0011','L0014'].includes(n.code)).reduce((sum,n)=>sum+n.children.reduce((s,m)=>s+m.children.length,0),0),83);
 assert.equal(choices.common.reduce((sum,n)=>sum+n.children.reduce((s,m)=>s+m.children.length,0),0),86);
 const paths=allLotteStandardPaths();
 for(const root of choices.channel)for(const middle of root.children)for(const small of middle.children)assert.ok(paths.some(p=>p.major.code===root.code&&p.middle.code===middle.code&&p.small.code===small.code));
 assert.equal(choices.channel.length,5);
});
test('explicit manual paths survive bridge and repeated input preparation despite conflicting auto ranking',()=>{
 const category=createManualLotteCategory(base,manualChoice),p={...base,category};
 assert.notEqual(category.channelSmall,bridgeLotteCategory(base).category.channelSmall);
 const result=bridgeLotteCategory(p);assert.equal(result.complete,true);assert.equal(result.manual,true);
 assert.equal(result.category.commonSmall,base.category.commonSmall);assert.deepEqual(result.category,category);
 assert.deepEqual(requireLotteCategoryBridge({...p,rawName:'다른 이름 패딩 다운'}),category);
 assert.deepEqual(bridgeLotteCategory({...p,category:requireLotteCategoryBridge(p)}).category,category);
});
test('unknown or swapped parents, required detail, changed identity and modified codes never silently become another category',()=>{
 assert.throws(()=>createManualLotteCategory(base,{...manualChoice,common:['L0014','M0066','00856']}),/1차/);
 assert.throws(()=>createManualLotteCategory(base,{...manualChoice,channel:['BC31000000',...manualChoice.channel.slice(1)]}),/2차/);
 const category=createManualLotteCategory(base,manualChoice),p={...base,category};
 for(const changed of [{style:'375909'},{sourceUrl:base.sourceUrl+'-new'},{gender:'남성'}])assert.equal(bridgeLotteCategory({...p,...changed}).complete,false);
 assert.equal(bridgeLotteCategory({...p,category:{...category,channelSmall:'패딩/다운점퍼'}}).complete,false);
 assert.equal(bridgeLotteCategory({...p,category:{...category,channelCodes:{...category.channelCodes,small:'WRONG'}}}).complete,false);
 const altered=structuredClone(category.manualSelection);altered.category.channelMiddle='없는 이름';assert.throws(()=>readManualLotteCategory(p,altered),/이름과 코드/);
 const common=JSON.parse(readFileSync(new URL('../data/category-catalog-common.json',import.meta.url),'utf8'));
 const standard={majors:[{code:'A',name:'대',middles:[{code:'B',name:'중',smalls:[{code:'C',name:'소',details:[{code:'D',name:'세'}]}]}]}]};
 assert.throws(()=>createManualLotteCategory(base,{...manualChoice,channel:['A','B','C','']},{common,standard}),/끝까지/);
 assert.equal(createManualLotteCategory(base,{...manualChoice,channel:['A','B','C','D']},{common,standard}).channelDetail,'세');
});
test('manual choice persists per product and source; fresh images and unrelated edits are preserved',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'lotte-choice-'));
 try{
  const category=createManualLotteCategory(base,manualChoice),fields={lotteCategorySelection:JSON.stringify(category.manualSelection),commonMiddle:category.commonMiddle,commonSmall:category.commonSmall,channelMiddle:category.channelMiddle,channelSmall:category.channelSmall,name:'직접 수정한 이름'};
  const store=createProductEditStore(root);await store.save({style:base.style,fields},base.style);
  const fresh={...base,images:{main:'new-source.jpg'},category:bridgeLotteCategory(base).category};
  const loaded=await createProductEditStore(root).apply(fresh);
  assert.deepEqual(loaded.category,category);assert.deepEqual(loaded.images,fresh.images);assert.equal(loaded.name,fields.name);
  assert.deepEqual(requireLotteCategoryBridge(loaded),category);
  const changed=await store.apply({...fresh,sourceUrl:base.sourceUrl+'-changed'});
  assert.equal(changed.category.channelSmall,fresh.category.channelSmall);assert.equal(changed.category.manualSelection,undefined);assert.equal(changed.userEditedFields.channelSmall,undefined);assert.equal(changed.name,fields.name);
  const cleared=applyProductEdits({...base,category},{style:base.style,fields:{lotteCategorySelection:''}});assert.equal(cleared.category.manualSelection,undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('explicit Apply saves locally, while a busy or changed product is never updated',async()=>{
 const category=createManualLotteCategory(base,manualChoice);let state={product:base,folder:'folder-a',busy:false},saved;
 const updated=await saveManualLotteCategory({getState:()=>({...state}),editStore:{save:async record=>{saved=record;}},product:base,category});
 assert.equal(saved.style,base.style);assert.deepEqual(updated.category,category);assert.equal(state.product,base,'caller must apply only a successful response');
 await assert.rejects(saveManualLotteCategory({getState:()=>({...state,busy:true}),editStore:{save:async()=>assert.fail('busy must not save')},product:base,category}),/작업 상태/);
 await assert.rejects(saveManualLotteCategory({getState:()=>({...state}),editStore:{save:async()=>{state={product:{...base,style:'375909'},folder:'folder-b',busy:false};}},product:base,category}),/바뀌어/);
 assert.equal(state.product.style,'375909');assert.equal(state.product.category.manualSelection,undefined);
});
