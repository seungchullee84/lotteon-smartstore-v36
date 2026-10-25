import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runSmartstoreDetailOnly,bindSmartstoreDetailEdit,isSmartstoreDetailEditUrl,assertDetailOnlyProduct} from '../smartstore-detail-only.mjs';
import {uploadSmartstoreDetail} from '../smartstore-detail-upload.mjs';
import {requireChannel} from '../channel-routing.mjs';
function form(url,sellerCode){return {url:()=>url,isClosed:()=>false,setDefaultTimeout(){},async bringToFront(){},locator(selector){assert.equal(selector,'#seller-code1');return {async count(){return 1;},async waitFor(){},async inputValue(){return sellerCode;}};}};}
test('상세 전용 연결은 단일 조회/수정 창의 판매자 상품코드 숫자로 대조한다',async()=>{
 const edit=form('https://sell.smartstore.naver.com/#/products/edit/123','26982 후드티');
 const copy=form('https://sell.smartstore.naver.com/#/products/copy/123','다른 상품');
 assert.equal(await bindSmartstoreDetailEdit({pages:()=>[edit,copy]},'026982'),edit);
 await assert.rejects(bindSmartstoreDetailEdit({pages:()=>[copy]},'026982'),/조회\/수정/);
 await assert.rejects(bindSmartstoreDetailEdit({pages:()=>[edit,edit]},'026982'),/여러 개/);
 await assert.rejects(bindSmartstoreDetailEdit({pages:()=>[edit]},'356954'),/품번/);
 assert.equal(isSmartstoreDetailEditUrl(edit.url()),true);assert.equal(isSmartstoreDetailEditUrl(copy.url()),false);
});
test('상세 전용 실행은 현재 자료로 연결·제작·상세 업로드만 호출하고 제품 데이터를 바꾸지 않는다',async()=>{
 const product={style:'026982',name:'사용자 상품명',price:77700,options:['보존'],tags:['보존'],images:{main:'원본 대표'}};
 const before=JSON.stringify(product),calls=[];
 const result=await runSmartstoreDetailOnly({product,folder:'prepared',connect:async p=>{assert.equal(p,product);calls.push('connect-edit');},render:async(p,f)=>{assert.equal(f,'prepared');calls.push('render-detail');return {files:['detail.png']};},upload:async(p,f,d)=>{assert.equal(d.files[0],'detail.png');calls.push('upload-detail');return {detailUploaded:true};}});
 assert.deepEqual(calls,['connect-edit','render-detail','upload-detail']);assert.equal(JSON.stringify(product),before);
 assert.equal(result.detailOnly,true);assert.equal(result.saved,false);assert.equal(result.published,false);
});
test('연결 품번 확인 실패와 중단 뒤에는 상세 제작·업로드를 진행하지 않는다',async()=>{
 await assert.rejects(runSmartstoreDetailOnly({product:{style:'026982'},folder:'prepared',connect:async()=>{throw Error('품번 불일치');},render:()=>assert.fail('제작 금지'),upload:()=>assert.fail('업로드 금지')}),/품번/);
 const controller=new AbortController();await assert.rejects(runSmartstoreDetailOnly({product:{style:'026982'},folder:'prepared',signal:controller.signal,connect:async()=>controller.abort(),render:()=>assert.fail('제작 금지'),upload:()=>assert.fail('업로드 금지')}),/abort/i);
});
test('전체 상세 업로드의 기본 복사등록 제한과 상세 전용 edit 제한을 구분한다',async()=>{
 await assert.rejects(uploadSmartstoreDetail({url:()=> 'https://sell.smartstore.naver.com/#/products/edit/123'},{}),/복사등록/);
 await assert.rejects(uploadSmartstoreDetail({url:()=> 'https://sell.smartstore.naver.com/#/products/copy/123'},{},{mode:'edit'}),/조회\/수정/);
 assert.equal(requireChannel('smartstore-detail-only','smartstore'),'smartstore');assert.throws(()=>requireChannel('smartstore-detail-only','lotte'));
});
test('상세 전용 버튼은 전체입력·태그·대표/추가 이미지 전송 경로를 호출하지 않는다',async()=>{
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="smartstoreDetailOnly"/);
 const handler=app.slice(app.indexOf("$('smartstoreDetailOnly').onclick"),app.indexOf('const autoStageLabels='));
 assert.match(handler,/post\('smartstore-detail-only'/);assert.doesNotMatch(handler,/flushManualTagSelection|currentProductEdits|smartstore-auto|selectedTags|selectedTitle/);
});
