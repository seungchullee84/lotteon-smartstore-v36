import test from 'node:test';
import assert from 'node:assert/strict';
import {smartstorePreparationStatus} from '../smartstore-preparation-status.mjs';

test('모든 품번은 구매 장점 2~4개와 사진 연결을 모두 확인한다',()=>{
 for(const style of ['123456','654321','999999']){
  const product={style,smartstoreDetail:{photoCount:5,sellingPoints:[{},{},{}]}};
  const listing={extras:[{},{},{}],manifest:{photoReview:{status:'ready'}}};
  assert.equal(smartstorePreparationStatus(product,listing).templateReady,true);
  const insufficient=smartstorePreparationStatus({...product,smartstoreDetail:{...product.smartstoreDetail,sellingPoints:[{}]}},listing);
  assert.equal(insufficient.status,'needs-review');assert.equal(insufficient.sellingPointCount,1);
  const empty=smartstorePreparationStatus({...product,smartstoreDetail:{...product.smartstoreDetail,sellingPoints:[]}},listing);assert.equal(empty.status,'needs-review');
  const unmapped=smartstorePreparationStatus(product,{...listing,manifest:{photoReview:{status:'needs-review',message:'색상 확인 필요'}}});
  assert.equal(unmapped.templateReady,false);assert.match(unmapped.message,/색상 확인 필요/);
  const pending=smartstorePreparationStatus({...product,smartstoreDetail:{...product.smartstoreDetail,pendingPhotoCount:2}},listing);
  assert.equal(pending.status,'needs-review');assert.match(pending.message,/사진 2장/);
 }
});

test('상세사진 개수에는 하단 공식 보완 컷을 포함하고 팔레트 중복은 세지 않는다',()=>{
 const detail={photoCount:3,sellingPoints:[{},{}],colorImages:{'01화이트':['a','b','c'],'02블랙':['d','e']},paletteImages:{'01화이트':'a','02블랙':'d'}};
 const status=smartstorePreparationStatus({style:'123456',smartstoreDetail:detail},{extras:[],manifest:{photoReview:{status:'ready'}}});
 assert.equal(status.detailCount,5);assert.equal(status.templateReady,true);assert.equal(detail.photoCount,3);
});

test('선택적 공식 사진이 없어도 나머지 준비는 계속하고 누락 사유만 보관한다',()=>{
 const detail={photoCount:5,sellingPoints:[{},{},{}],paletteImages:{},palettePendingReasons:{'04블랙':'공식 사진 조회 시간이 초과되었습니다.'},galleryPendingReasons:{'04블랙':'공식 사진이 없습니다.'}};
 const listing={extras:[],manifest:{photoReview:{status:'ready'}}};
 const pending=smartstorePreparationStatus({style:'356946',smartstoreDetail:detail},listing);
 assert.equal(pending.templateReady,true);assert.equal(pending.status,'ready');assert.deepEqual(pending.palettePendingColors,['04블랙']);assert.equal(pending.message,undefined);assert.match(pending.optionalPhotoNotes.join(' '),/04블랙.*조회 시간/);assert.match(pending.optionalPhotoNotes.join(' '),/공식 사진이 없습니다/);
 const ready=smartstorePreparationStatus({style:'356946',smartstoreDetail:{...detail,paletteImages:{'04블랙':'/smartstore-photo/current'}}},listing);
 assert.equal(ready.templateReady,true);assert.deepEqual(ready.palettePendingColors,[]);
});
