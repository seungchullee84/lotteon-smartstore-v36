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

test('공식 색상 사진 조회 실패는 원인을 표시하고 채워진 팔레트는 다시 막지 않는다',()=>{
 const detail={photoCount:5,sellingPoints:[{},{},{}],paletteImages:{},palettePendingReasons:{'04블랙':'공식 사진 조회 시간이 초과되었습니다.'}};
 const listing={extras:[],manifest:{photoReview:{status:'ready'}}};
 const pending=smartstorePreparationStatus({style:'356946',smartstoreDetail:detail},listing);
 assert.equal(pending.templateReady,false);assert.deepEqual(pending.palettePendingColors,['04블랙']);assert.match(pending.message,/04블랙.*조회 시간/);
 const ready=smartstorePreparationStatus({style:'356946',smartstoreDetail:{...detail,paletteImages:{'04블랙':'/smartstore-photo/current'}}},listing);
 assert.equal(ready.templateReady,true);assert.deepEqual(ready.palettePendingColors,[]);
});
