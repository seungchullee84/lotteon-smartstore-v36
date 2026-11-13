import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeNotice,parseWashing} from '../notice.mjs';
import {buildKeywords,productClassification} from '../product.mjs';
test('116934 실제 이미지: 품번 예외 없이 혼용률 및 세탁 추출',async()=>{const p=await analyzeNotice(fileURLToPath(new URL('./fixtures/116934.jpg',import.meta.url)));assert.match(p.material,/면/);assert.match(p.material,/폴리우레탄/);assert.ok([...p.material.matchAll(/\d+/g)].every(m=>Number(m[0])<=100));assert.match(p.washing,/손세탁/);assert.match(p.washing,/표백제 금지/);assert.ok(p.washing.length>0);});
test('326903 긴 이미지에서도 정보고시 행을 찾아 추출',async()=>{const p=await analyzeNotice(fileURLToPath(new URL('./fixtures/326903.jpg',import.meta.url)));assert.match(p.material,/면/);assert.ok([...p.material.matchAll(/\d+/g)].every(m=>Number(m[0])<=100));assert.match(p.washing,/건조기 금지/);});
test('375918 복합 소재의 누락된 %를 추측하지 않음',async()=>{const p=await analyzeNotice(fileURLToPath(new URL('./fixtures/375918.jpg',import.meta.url)));assert.equal(p.material,'');assert.match(p.materialOCR,/인조가죽100/);assert.match(p.fieldStatus.material,/확인 필요/);assert.match(p.washing,/옷걸이에 걸어서 그늘건조/);});
test('기계세탁 허용을 손세탁 전용으로 바꾸지 않음',()=>assert.match(parseWashing('세탁기로 약하게 세탁 (손세탁 가능)').value,/세탁기로/));
test('품목에 맞는 키워드는 쉼표 포함 40자 이내',()=>{for(const name of ['남성 [변우석] 브러시드 테리 카고 팬츠 116934','여성 퍼펙트 긴팔 티셔츠 326903']){const s=buildKeywords({name,gender:name.startsWith('남성')?'남성':'여성'});assert.ok(s.length<=40);assert.ok(s.startsWith('지오다노'));assert.doesNotMatch(s,/변우석|\d|\[/);}});
test('남성 스웻팬츠 분류는 여성상의로 이어지지 않음',()=>{const p=productClassification('<div class="navi"><a>Home</a><a class="prdpath1">MEN</a><a>PANTS</a><a>트레이닝/스웻팬츠</a><a>카고 팬츠</a></div>');assert.equal(p.category.commonMiddle,'M0297 : 남성의류하의');assert.equal(p.category.channelMiddle,'바지');assert.equal(p.category.channelSmall,'기모팬츠');});
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

test('스마트스토어 소재와 색상에 구분선이 없어도 소재 행만 RapidOCR에 전달한다',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'notice-material-row-'));
 try{
  const file=path.join(dir,'info.jpg');
  const rules=Buffer.from('<svg width="400" height="200"><path d="M25 60h350 M25 137h350" stroke="black"/></svg>');
  await sharp({create:{width:400,height:200,channels:3,background:'white'}}).composite([{input:rules}]).jpeg().toFile(file);
  const tsv=['header','5\t1\t1\t1\t1\t1\t34\t74\t24\t15\t95\t소재','5\t1\t1\t1\t2\t1\t34\t110\t24\t15\t95\t색상'].join('\n');
  const expected='폴리에스터 95%, 폴리우레탄 5%';
  const makeWorker=material=>async()=>({
   async recognize(input){
    if(Buffer.isBuffer(input))return {data:{text:expected}};
    return {data:{tsv,text:'제품 소재 '+material+'\n색상 01화이트'}};
   },
   async terminate(){},
  });
  const recognizeMaterial=async image=>{
   const {width,height}=await sharp(image).metadata();
   assert.deepEqual([width,height],[552,112]);
   return '폴리에스터95%, 폴리우레탄5%';
  };
  const success=await analyzeNotice(file,()=>{},undefined,{createWorker:makeWorker('폴리에스터 95%, 폴리우레탄 546'),recognizeMaterial});
  assert.deepEqual(success.materialBand,{left:112,top:62,width:264,height:44});
  assert.equal(success.material,expected);
  assert.match(success.fieldStatus.material,/RapidOCR/);
  assert.equal(success.materialOCR,undefined);
  const conflict=await analyzeNotice(file,()=>{},undefined,{createWorker:makeWorker('폴리에스터 90%, 폴리우레탄 10%'),recognizeMaterial});
  assert.equal(conflict.material,'');
  assert.match(conflict.fieldStatus.material,/확인 필요/);
  const fallback=await analyzeNotice(file,()=>{},undefined,{
   createWorker:makeWorker('폴리에스터 95%, 폴리우레탄 546'),recognizeMaterial:async()=>{throw Error('missing model');},
  });
  assert.equal(fallback.material,expected);
  assert.equal(fallback.rapidMaterialUnavailable,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
