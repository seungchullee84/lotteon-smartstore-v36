import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {load} from 'cheerio';
import {pointPicker,savePointSelection} from '../smartstore-point-picker.mjs';
import {reviewSellingPoints} from '../smartstore-selling-point-review.mjs';
import {displaySellingPoints,assertRequiredSellingPoints} from '../smartstore-selling-points.mjs';
import {buildSmartstoreDetail,smartstoreDetailDocument} from '../smartstore-detail.mjs';
import {smartstorePreparationStatus} from '../smartstore-preparation-status.mjs';

// Saved OCR-backed choices that used to pass selection/review but render only one card.
const points=[
 {title:'탄탄한 착용감',description:'265g/m* 중량의 탄탄한 폴리ㆍ레이온 혼방 립 원단 사용.',evidence:'265g/m* 중량의 탄탄한 폴리ㆍ레이온 혼방 립 원단 사용'},
 {title:'쌀쌀할 때도 따뜻하게',description:'브러쉬 표면 가공을 거쳐 피부에 당는 감촉이 부드럽고 따뜻한 착용감 선사.',evidence:'브러쉬 표면 가공을 거쳐 피부에 당는 감촉이 부드럽고 따뜻한 착용감 선사'},
 {title:'세탁 후에도 깔끔하게',description:'세탁 후 변형 부담을 줄여 깔끔하게.',evidence:'세탁 후에도 형태 변형 최소화'},
];
const source=points.map(point=>point.evidence).join('\n');
const base={style:'326924',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',name:'여성 기모 헨리넥 긴팔티',gender:'여성',images:{},colors:[],sizes:['S','M','L']};
async function fixture(run){
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'point-display-'));
 const root=path.join(dataRoot,'smartstore-details',base.style);await mkdir(root,{recursive:true});
 const selection={style:base.style,sourceUrl:base.sourceUrl,detailHash:'current-official-image',method:'user-selected-official-points',points:structuredClone(points)};
 await writeFile(path.join(root,'selling-point-selection.json'),JSON.stringify(selection));
 try{await run({dataRoot,root,selection,options:{dataRoot,sourceOverride:{text:source,detailHash:selection.detailHash}}});}
 finally{await rm(dataRoot,{recursive:true,force:true});}
}

test('사용·선사로 끝나는 선택 문구 세 개를 같은 순서와 근거로 표시한다',()=>{
 const original=structuredClone(points),display=displaySellingPoints(points);
 assert.equal(display.length,3);assert.deepEqual(points,original);
 assert.deepEqual(display.map(point=>point.title),points.map(point=>point.title));
 assert.deepEqual(display.map(point=>point.evidence),points.map(point=>point.evidence));
 assert.equal(display[0].description,'탄탄한 폴리·레이온 혼방 립 원단을 사용했어요.');
 assert.equal(display[1].description,'기모 표면 가공을 거쳐 피부에 닿는 감촉이 부드럽고 따뜻한 착용감을 선사해요.');
 assert(display.every(point=>point.description.endsWith('요.')));
 assert.deepEqual(displaySellingPoints(display),display);
});

test('선택·저장·재열기·재검토·두 템플릿의 화면과 PNG 문서에 같은 세 소구점이 나온다',async()=>fixture(async({dataRoot,options,selection})=>{
 const picker=await pointPicker(base,dataRoot,options);
 const selected=picker.selectedIds.map(id=>picker.candidates.find(point=>point.id===id));
 assert.equal(selected.length,3);assert(selected.every(point=>point.displayReady));
 const saved=await savePointSelection(base,dataRoot,{channel:'smartstore',style:base.style,revision:picker.revision,selectedIds:picker.selectedIds},options);
 assert.deepEqual(saved.points,points);
 const reviewed=await reviewSellingPoints(base,source,{dataRoot,detailHash:selection.detailHash,supplement:true});
 assert.equal(reviewed.status,'ready');assert.deepEqual(reviewed.points,points);
 const reopened=await pointPicker(base,dataRoot,options);assert.deepEqual(reopened.selectedIds,picker.selectedIds);
 for(const detailTemplate of [1,2]){
  const product={...base,detailTemplate,smartstoreDetail:{style:base.style,sellingPoints:reviewed.points,sellingPointReview:{status:'ready'},photoCount:1}};
  for(const build of [buildSmartstoreDetail,smartstoreDetailDocument]){
   const $=load(build(product,{includeVideo:false}).html);
   assert.deepEqual($('[data-product-points] h3').toArray().map(node=>$(node).text()),points.map(point=>point.title));
   assert.deepEqual($('[data-product-points] p').toArray().map(node=>$(node).text()),selected.map(point=>point.displayDescription));
  }
  assert.equal(smartstorePreparationStatus(product,{extras:[]}).templateReady,true);
 }
}));

test('두 개 또는 세 개의 명시적 선택을 재검토가 임의로 추가하지 않는다',async()=>fixture(async({dataRoot,root,options,selection})=>{
 for(const order of [[2,0],[2,0,1]]){
  await writeFile(path.join(root,'selling-point-selection.json'),JSON.stringify(selection));
  const picker=await pointPicker(base,dataRoot,options),selectedIds=order.map(i=>picker.selectedIds[i]);
  const saved=await savePointSelection(base,dataRoot,{channel:'smartstore',style:base.style,revision:picker.revision,selectedIds},options);
  assert.deepEqual(saved.points,order.map(i=>points[i]));
  const reviewed=await reviewSellingPoints(base,source,{dataRoot,detailHash:selection.detailHash,supplement:true});
  assert.deepEqual(reviewed.points,saved.points);
  const reopened=await pointPicker(base,dataRoot,options);
  assert.deepEqual(reopened.selectedIds,selectedIds);
 }
}));

test('표시할 수 없는 선택 문구는 일부만 성공 처리하거나 기존 선택을 덮어쓰지 않는다',async()=>fixture(async({dataRoot,root,options,selection})=>{
 const broken={title:'다양한 코디에 활용',description:'다양한 코디에 편안한 착용 중간문구.',evidence:'다양한 코디에 편안한 착용 중간문구.'};
 selection.points=[points[0],points[2],broken];
 await writeFile(path.join(root,'selling-point-selection.json'),JSON.stringify(selection));
 options.sourceOverride.text+='\n'+broken.evidence;
 const picker=await pointPicker(base,dataRoot,options),bad=picker.candidates.find(point=>point.title===broken.title);
 assert.equal(bad.displayReady,false);assert.equal(bad.displayDescription,'');
 const before=await readFile(path.join(root,'selling-point-selection.json'),'utf8');
 await assert.rejects(savePointSelection(base,dataRoot,{channel:'smartstore',style:base.style,revision:picker.revision,selectedIds:picker.selectedIds},options),/표시 문구.*다양한 코디에 활용/);
 assert.equal(await readFile(path.join(root,'selling-point-selection.json'),'utf8'),before);
 const detail={sellingPoints:selection.points,photoCount:1};
 assert.throws(()=>assertRequiredSellingPoints(detail),/표시 문구/);
 for(const detailTemplate of [1,2])for(const build of [buildSmartstoreDetail,smartstoreDetailDocument])assert.throws(()=>build({...base,detailTemplate,smartstoreDetail:{...detail,style:base.style}},{includeVideo:false}),/표시 문구.*일부만 적용하지 않았습니다/);
 const status=smartstorePreparationStatus({...base,smartstoreDetail:detail},{extras:[]});
 assert.equal(status.templateReady,false);assert.equal(status.sellingPointCount,2);assert.match(status.message,/3개 중 1개 표시 문구/);
 const reviewed=await reviewSellingPoints(base,options.sourceOverride.text,{dataRoot,detailHash:selection.detailHash,supplement:true});
 assert.equal(reviewed.status,'needs-review');assert.deepEqual(reviewed.points,selection.points);assert.match(reviewed.message,/표시 문구/);
}));
