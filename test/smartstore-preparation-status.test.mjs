import test from 'node:test';
import assert from 'node:assert/strict';
import {smartstorePreparationStatus} from '../smartstore-preparation-status.mjs';

test('모든 품번은 사진과 근거 소구점을 함께 준비한 경우에만 완료한다',()=>{
 for(const style of ['123456','654321','999999']){
  const product={style,smartstoreDetail:{photoCount:5,sellingPoints:[{},{},{}]}};
  const listing={extras:[{},{},{}],manifest:{photoReview:{status:'ready'}}};
  assert.equal(smartstorePreparationStatus(product,listing).templateReady,true);
  const insufficient=smartstorePreparationStatus({...product,smartstoreDetail:{...product.smartstoreDetail,sellingPoints:[{}]}},listing);
  assert.equal(insufficient.status,'needs-review');assert.match(insufficient.message,/1\/3/);
  const unmapped=smartstorePreparationStatus(product,{...listing,manifest:{photoReview:{status:'needs-review',message:'색상 확인 필요'}}});
  assert.equal(unmapped.templateReady,false);assert.match(unmapped.message,/색상 확인 필요/);
  const pending=smartstorePreparationStatus({...product,smartstoreDetail:{...product.smartstoreDetail,pendingPhotoCount:2}},listing);
  assert.equal(pending.status,'needs-review');assert.match(pending.message,/사진 2장/);
 }
});
