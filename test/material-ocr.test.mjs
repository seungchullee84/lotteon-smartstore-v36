import test from 'node:test';
import assert from 'node:assert/strict';
import {requireMaterialInput,reviewMaterialOCR,verifiedOcrMaterial,correctOcrMaterialPercent,recoverUnmarkedNoticeMaterial} from '../notice.mjs';
test('101 이상은 적지 않고 소재명과 정상 비율은 남김',()=>{
 assert.equal(reviewMaterialOCR('면 95%, 폴리우레탄 596').value,'면 95%, 폴리우레탄');
 assert.equal(reviewMaterialOCR('폴리에스터 1009%').value,'폴리에스터');
 assert.equal(reviewMaterialOCR('나일론 101').value,'나일론');
 assert.equal(reviewMaterialOCR('면 9596, 폴리우레탄 596').needsReview,true);
});
test('100과 정상 숫자는 그대로 유지',()=>{
 for(const text of ['면 100','폴리에스터 100%','면 95 폴리우레탄 5','면 96%, 폴리우레탄 4%'])assert.equal(reviewMaterialOCR(text).value,text);
});

test('376901 OCR rejects garbled characters and validates all three official components',()=>{
 const material='겉감표면: 인조가죽 100% / 겉감이면: 비스코스 69%, 폴리에스터 18%, 면 8%, 금속성섬유 5% / 안감: 폴리에스터 100%';
 assert.equal(verifiedOcrMaterial(material),material);
 const broken='겉감표면: 인조가죽 10096 / 겉감이면: H[ ATA 69%, 폴리에스터 18%, 면 8%, 금속성섬유 5% / 안감: 폴리에스터 100%';
 assert.equal(verifiedOcrMaterial(broken),'');
 assert.throws(()=>requireMaterialInput(broken),/읽을 수 없는 문자/);
 assert.equal(verifiedOcrMaterial('면 ９５％, 폴리우레탄 ５％'),'면 95%, 폴리우레탄 5%');
 assert.equal(verifiedOcrMaterial('면 95%, 폴리우레탄 5'),'');
 assert.throws(()=>requireMaterialInput('면 95%, 폴리우레탄 8%'),/혼용률/);
});

test('OCR 4596 and 1096 are corrected only when the complete material totals 100%',()=>{
 const raw='아크릴 4596, 나일론45%, 모1096';
 const result=correctOcrMaterialPercent(raw);
 assert.equal(result.material,'아크릴 45%, 나일론 45%, 모 10%');
 assert.equal(result.original,raw);
 assert.deepEqual(result.corrections,[{fiber:'아크릴',from:'4596',to:'45%'},{fiber:'모',from:'1096',to:'10%'}]);
 assert.equal(correctOcrMaterialPercent('아크릴 4596, 나일론45%, 모10%').material,result.material);
 assert.equal(correctOcrMaterialPercent('폴리에스터10096').material,'폴리에스터 100%');
 // Strict transcription validation remains unchanged; only the explicit OCR recovery path corrects digits.
 assert.equal(verifiedOcrMaterial(raw),'');
});

test('real 96% is preserved while a separate impossible percentage may be corrected',()=>{
 assert.equal(correctOcrMaterialPercent('면 96%, 폴리우레탄 4%'),null);
 assert.equal(verifiedOcrMaterial('면 96%, 폴리우레탄 4%'),'면 96%, 폴리우레탄 4%');
 assert.equal(correctOcrMaterialPercent('면 96%, 폴리우레탄 496').material,'면 96%, 폴리우레탄 4%');
});

test('OCR correction verifies 100% independently for every garment component',()=>{
 assert.equal(correctOcrMaterialPercent('겉감: 면9596, 폴리우레탄5% / 안감: 폴리에스터10096').material,
  '겉감: 면 95%, 폴리우레탄 5% / 안감: 폴리에스터 100%');
 assert.equal(correctOcrMaterialPercent('겉감: 면4596 / 안감: 폴리에스터5596'),null);
 assert.equal(correctOcrMaterialPercent('겉감: 면9596, 폴리우레탄5% / 안감: 폴리에스터9096'),null);
});

test('incomplete, ambiguous, invalid or missing percentage readings remain unfilled',()=>{
 for(const raw of ['아크릴4596, 나일론45%, 모15%','아크릴4596, 나일론45%, 모',
  '아크릴459, 나일론45%, 모1096','아크릴4596, 나일론45%, =10%',
  '면96, 폴리우레탄4%','면9696, 폴리우레탄4','면4596%, 폴리에스터55%',
  '면100096','면0096, 폴리에스터100%'])assert.equal(correctOcrMaterialPercent(raw),null,raw);
});

test('agreed bare 100 textile readings retain each garment part',()=>{
 const row='겉감:나일론100,안감:나일론100\n충전재:폴리에스터100';
 const notice={ocrText:'제품 소재 '+row+'\n색상 블랙',materialOCR:row,materialRecheck:row};
 assert.equal(recoverUnmarkedNoticeMaterial({...notice,materialRecheck:'겉감:나일론100,안감:나일론100'}),false);
 assert.equal(recoverUnmarkedNoticeMaterial({...notice,material:'면 100%'}),false);
 assert.equal(recoverUnmarkedNoticeMaterial(notice),true);
 assert.equal(notice.material,'겉감: 나일론 100% / 안감: 나일론 100% / 충전재: 폴리에스터 100%');
});
