import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';import path from 'node:path';
import {pointPicker,savePointSelection} from '../smartstore-point-picker.mjs';

const points=[
 {title:'여유로운 릴렉스핏',description:'여유 있게 떨어지는 릴렉스 실루엣.',evidence:'여유 있게 떨어지는 릴렉스 핏으로 편안한 착용감과 활동성을 갖춘'},
 {title:'포인트 있게 연출',description:'스포티하면서도 감각적인 지퍼 디테일이 돋보이는 하프 집업 스웨터입니다.',evidence:'스포티하면서도 감각적인 지퍼 디테일이 돋보이는 하프 집업 스웨터입니다.'},
 {title:'탄탄한 착용감',description:'2) 더블 자카드(Double Jacquard) 조직을 적용하여 탄탄.',evidence:'2) 더블 자카드(Double Jacquard) 조직을 적용하여 탄탄하고 안정적인 형태감 유지'},
];
const text=points.map(point=>point.evidence).join('\n'),digest=value=>createHash('sha256').update(value).digest('hex');
const identity={style:'356946',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=current',detailHash:'current-detail',textHash:digest(text)};
const applied=()=>({...identity,sellingPoints:structuredClone(points),sellingPointSource:{...identity},sellingPointReview:{status:'ready'}});
async function fixture(run){
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'applied-point-picker-')),root=path.join(dataRoot,'smartstore-details',identity.style);await mkdir(root,{recursive:true});
 try{await run({dataRoot,root,product:{style:identity.style,sourceUrl:identity.sourceUrl,smartstoreDetail:applied()},options:{dataRoot,sourceOverride:{text,detailHash:identity.detailHash}}});}
 finally{await rm(dataRoot,{recursive:true,force:true});}
}
const selectedTitles=picker=>picker.selectedIds.map(id=>picker.candidates.find(candidate=>candidate.id===id).title);

test('템플릿에 실제 적용된 검증 소구점 3개를 선택창 후보와 체크 상태로 유지한다',async()=>fixture(async({product,options,dataRoot})=>{
 const picker=await pointPicker(product,dataRoot,options);
 assert.deepEqual(selectedTitles(picker),points.map(point=>point.title));
 assert.ok(points.every(point=>picker.candidates.some(candidate=>candidate.title===point.title&&candidate.evidence===point.evidence)));
 const saved=await savePointSelection(product,dataRoot,{channel:'smartstore',style:product.style,revision:picker.revision,selectedIds:picker.selectedIds},options);
 assert.deepEqual(saved.points,points);assert.deepEqual(selectedTitles(await pointPicker(product,dataRoot,options)),points.map(point=>point.title));
}));

for(const recordName of ['selling-point-review.json','draft.json'])test('재열기 때 같은 원본의 '+recordName+' 적용 소구점도 복원한다',async()=>fixture(async({root,product,options,dataRoot})=>{
 delete product.smartstoreDetail;
 const record=recordName==='draft.json'?{style:identity.style,sourceUrl:identity.sourceUrl,officialDetailHash:identity.detailHash,sellingPoints:points}:{...identity,version:14,status:'ready',points};
 await writeFile(path.join(root,recordName),JSON.stringify(record));
 assert.deepEqual(selectedTitles(await pointPicker(product,dataRoot,options)),points.map(point=>point.title));
}));

test('다른 품번·출처·상세해시 또는 원문 근거가 없는 적용 자료를 후보로 가져오지 않는다',async()=>fixture(async({root,product,options,dataRoot})=>{
 for(const field of ['style','sourceUrl','detailHash']){
  const invalid={...identity,[field]:'different'};
  product.smartstoreDetail={...applied(),sellingPointSource:invalid};
  await writeFile(path.join(root,'selling-point-review.json'),JSON.stringify({...invalid,points}));
  await writeFile(path.join(root,'draft.json'),JSON.stringify({...invalid,officialDetailHash:invalid.detailHash,sellingPoints:points}));
  const picker=await pointPicker(product,dataRoot,options);assert.equal(picker.candidates.some(point=>point.title==='포인트 있게 연출'),false,field);
 }
 product.smartstoreDetail=applied();product.smartstoreDetail.sellingPoints[2].evidence='현재 공식 원문에 없는 장점';
 const picker=await pointPicker(product,dataRoot,options);assert.equal(picker.candidates.some(point=>point.evidence==='현재 공식 원문에 없는 장점'),false);
}));

test('상세이미지가 없는 상품은 텍스트 해시까지 일치할 때만 적용 소구점을 복원한다',async()=>fixture(async({product,options,dataRoot})=>{
 options.sourceOverride.detailHash=null;product.smartstoreDetail.sellingPointSource.detailHash=null;
 assert.deepEqual(selectedTitles(await pointPicker(product,dataRoot,options)),points.map(point=>point.title));
 product.smartstoreDetail.sellingPointSource.textHash='old-text';
 const picker=await pointPicker(product,dataRoot,options);assert.equal(picker.candidates.some(point=>point.title==='포인트 있게 연출'),false);
}));

test('명시적으로 저장한 선택 순서를 유지하고 2~4개 제한도 그대로 검증한다',async()=>fixture(async({root,product,options,dataRoot})=>{
 await writeFile(path.join(root,'selling-point-selection.json'),JSON.stringify({...identity,points:[points[2],points[0],points[1]]}));
 const picker=await pointPicker(product,dataRoot,options);assert.deepEqual(selectedTitles(picker),[points[2],points[0],points[1]].map(point=>point.title));
 await assert.rejects(savePointSelection(product,dataRoot,{channel:'smartstore',style:product.style,revision:picker.revision,selectedIds:picker.selectedIds.slice(0,1)},options),/2~4/);
 await assert.rejects(savePointSelection(product,dataRoot,{channel:'smartstore',style:product.style,revision:picker.revision,selectedIds:Array(5).fill(picker.selectedIds[0])},options),/2~4/);
}));
