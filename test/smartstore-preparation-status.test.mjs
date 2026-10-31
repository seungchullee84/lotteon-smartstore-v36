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
