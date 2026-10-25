import test from 'node:test';import assert from 'node:assert/strict';
import {applySelectedSmartstoreTitle,smartstoreTitle,assertSmartstoreInputTitle} from '../smartstore-title.mjs';
import {smartstorePlan} from '../smartstore-form.mjs';
test('직접 고친 이름은 27~39자 추천 기준과 정규화를 거치지 않고 실제 입력 계획까지 보존한다',()=>{
 const p={style:'026982',name:'공식 상품명',gender:'남성',country:'한국',material:'면 60%',washing:'손세탁',manufactured:'2026-08',consumerPrice:59800,colors:['03그레이'],sizes:['L'],images:{detail:'https://example.com/detail.jpg'}};
 for(const title of ['남성 기모 테리 패치 후드티 026982','지오다노  남자 NEW 후드티 026982','가'.repeat(45)]){
  const selected=applySelectedSmartstoreTitle(p,{style:p.style,title});const plan=smartstorePlan(selected,59800);
  assert.equal(smartstoreTitle(selected),title);assert.equal(plan.name,title);assert.equal(plan.nameUserEdited,true);assert.equal(assertSmartstoreInputTitle(plan.name,plan.nameUserEdited),title);assert.equal(plan.save,false);
 }
 assert.throws(()=>applySelectedSmartstoreTitle(p,{style:'375908',title:'다른 품번'}),/품번/);
 assert.throws(()=>applySelectedSmartstoreTitle(p,{style:p.style,title:' '}),/입력/);
 assert.throws(()=>assertSmartstoreInputTitle('짧은 자동생성 이름',false),/27~39/);
});
