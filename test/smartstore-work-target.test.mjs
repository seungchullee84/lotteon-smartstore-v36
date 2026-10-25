import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSmartstoreEditProduct,smartstoreWorkTarget} from '../smartstore-work-target.mjs';
import {fillSmartstore} from '../smartstore-form.mjs';
const edit='https://sell.smartstore.naver.com/#/products/edit/13770263563';
test('수정 대상의 품번은 정확히 대조하고 5자리 표기의 앞자리 0만 정규화한다',()=>{
 assert.deepEqual(smartstoreWorkTarget(edit),{mode:'edit',id:'13770263563'});
 assert.doesNotThrow(()=>assertSmartstoreEditProduct(edit,'지오다노 후드티 026982','026982'));
 assert.doesNotThrow(()=>assertSmartstoreEditProduct(edit+'?x=1','지오다노 후드티 26982','026982'));
 for(const title of ['지오다노 후드티 026981','지오다노 후드티 1026982','지오다노 후드티','지오다노 026982 026981'])assert.throws(()=>assertSmartstoreEditProduct(edit,title,'026982'),/품번/);
 assert.doesNotThrow(()=>assertSmartstoreEditProduct(edit.replace('/edit/','/copy/'),'복사 원본의 다른 상품명','026982'));
});
test('외부 도메인·로그인·목록·미지원 경로는 입력 대상으로 인식하지 않는다',()=>{
 for(const url of [edit.replace('sell.smartstore.naver.com','example.com'),edit+'/anything',edit.replace('/edit/13770263563','/origin-list'),edit.replace('/edit/','/update/'),edit.replace('https:','http:')])assert.equal(smartstoreWorkTarget(url),null);
});
test('다른 품번의 수정 화면에서는 첫 입력 전에 차단한다',async()=>{
 let mutations=0;
 const page={locator(){return {inputValue:async()=> '지오다노 니트 356954',fill:async()=>mutations++};}};
 await assert.rejects(fillSmartstore({url:()=>edit,playwright:page},{name:'지오다노 남성 기모 테리 패치 후드티 026982',style:'026982'},{}),/조회\/수정.*품번/);
 assert.equal(mutations,0);
});
