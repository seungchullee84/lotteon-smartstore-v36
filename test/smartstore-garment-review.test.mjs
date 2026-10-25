import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';import path from'node:path';import os from'node:os';
import{saveGarmentReview,applyGarmentReview}from'../smartstore-garment-review.mjs';import{learnedFields}from'../smartstore-learned.mjs';import{smartstorePlan}from'../smartstore-form.mjs';
test('품번별 소매 대조 결과는 현재 사진·공식 상세가 같을 때만 실제 입력 계획으로 전달된다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'garment-review-'));try{
 const folder=path.join(root,'collected'),pictures=path.join(root,'photos');await mkdir(folder);await mkdir(pictures);await writeFile(path.join(folder,'detail.jpg'),'official');await writeFile(path.join(pictures,'1.jpg'),'front');
 const options={dataRoot:path.join(root,'data'),photoRoots:[pictures]};
 for(const [index,sleeve,neckline]of [[1,'긴팔','후드넥'],[2,'반팔','라운드넥'],[3,'민소매','V넥'],[4,'','']]){
 const p={style:'12345'+index,sourceUrl:'https://www.giordano.co.kr/'+index,name:'확인한 의류',gender:'여성',images:{detail:'https://www.giordano.co.kr/detail.jpg'},country:'한국',material:'면 100%',washing:'손세탁',manufactured:'2026-08',colors:['01블랙'],sizes:['S'],consumerPrice:10000};
 await saveGarmentReview(p,folder,{sleeve,neckline,evidence:index===4?'하의 사진, 소매·네크라인 해당 없음':'정면·옆면 사진 대조'},options);
 const checked=await applyGarmentReview(p,folder,options),plan=smartstorePlan(checked,10000);assert.equal(learnedFields(plan).sleeve,sleeve||null);assert.equal(learnedFields(plan).neckline,neckline||null);
 assert.equal((await applyGarmentReview({...checked,sourceUrl:p.sourceUrl+'changed'},folder,options)).reviewedGarmentAttributes,undefined);
 await writeFile(path.join(pictures,'1.jpg'),'changed');assert.equal((await applyGarmentReview(checked,folder,options)).reviewedGarmentAttributes,undefined);await writeFile(path.join(pictures,'1.jpg'),'front');
 await writeFile(path.join(folder,'detail.jpg'),'changed');assert.equal((await applyGarmentReview(checked,folder,options)).reviewedGarmentAttributes,undefined);await writeFile(path.join(folder,'detail.jpg'),'official');
 }
 }finally{await rm(root,{recursive:true,force:true});}
});
