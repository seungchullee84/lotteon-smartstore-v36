import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {reviewNoticeMaterial,verifiedNoticeMaterialReview,applyNoticeMaterialReview} from '../openmaus-notice-review.mjs';

const material='아크릴 45%, 나일론 45%, 모 10%';
const sourceUrl='https://www.giordano.co.kr/shop/detail.php?pno='+'a'.repeat(32);
const noticeUrl='https://www.giordano.co.kr/data/326904-info.jpg';
const product=()=>({style:'326904',sourceUrl,images:{info:noticeUrl},material:'',
 fieldStatus:{country:'자동 추출'},noticeAnalysis:{ocrText:'아크릴 4596, 나일론45%, 모10%'},
 warnings:['소재 혼용률 숫자·% 인식이 불확실해 자동 입력하지 않았습니다.','세탁기호 확인']});
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'notice-review-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'product');await mkdir(folder);
 const bytes=await sharp({create:{width:120,height:40,channels:3,background:'#fff'}}).png().toBuffer();
 await writeFile(path.join(folder,'info.jpg'),bytes);
 const input={style:'326904',sourceUrl,noticeUrl,noticeHash:createHash('sha256').update(bytes).digest('hex')};
 return {root,folder,input};
}

test('successful re-reading fills actual material, persists exact source evidence, and does not claim human verification',async t=>{
 const {folder,input}=await fixture(t),p=product();
 const review=verifiedNoticeMaterialReview({...input,material:'아크릴45%, 나일론45%, 모10%'},input);
 assert.equal(await applyNoticeMaterialReview(p,folder,review),true);
 assert.equal(p.material,material);
 assert.equal(p.noticeAnalysis.material,material);
 assert.equal(p.fieldStatus.material,'자동 재판독 · 원본 확인 권장');
 assert.equal(p.noticeAnalysis.fieldStatus.material,p.fieldStatus.material);
 assert.equal(p.noticeAnalysis.ocrText,'아크릴 4596, 나일론45%, 모10%');
 for(const [key,value] of Object.entries(input))assert.equal(p.noticeAnalysis.materialReview[key],value);
 assert.equal(p.noticeAnalysis.materialReview.method,'OpenMausBot');
 assert.notEqual(p.noticeVerified,true);
 assert.deepEqual(p.warnings,['세탁기호 확인']);
 assert.deepEqual(JSON.parse(await readFile(path.join(folder,'product.json'),'utf8')),p);
});

test('wrong style, official page, notice URL, hash and incomplete percentages never become material',async t=>{
 const {folder,input}=await fixture(t);
 const wrong=[{style:'326903'},{sourceUrl:sourceUrl.replace(/a/g,'b')},{noticeUrl:noticeUrl.replace('326904','326903')},
  {noticeHash:'b'.repeat(64)},{material:'아크릴 4596, 나일론45%, 모10%'},{material:'아크릴 45, 나일론45%, 모10%'},
  {material:'아크릴45%, 나일론45%, 모15%'},{material:''}];
 for(const change of wrong){
  const response={...input,material,...change},p=product();
  assert.equal(verifiedNoticeMaterialReview(response,input),null);
  assert.equal(await applyNoticeMaterialReview(p,folder,response),false);
  assert.equal(p.material,'');
 }
});

test('changed image and current-product guards prevent a stale result from filling another product',async t=>{
 const {folder,input}=await fixture(t),review={...input,material};
 assert.equal(await applyNoticeMaterialReview(product(),folder,review,{isCurrent:()=>false}),false);
 let checks=0;
 assert.equal(await applyNoticeMaterialReview(product(),folder,review,{isCurrent:()=>++checks===1}),false);
 const changed=product();changed.style='326903';
 assert.equal(await applyNoticeMaterialReview(changed,folder,review),false);
 await writeFile(path.join(folder,'info.jpg'),'new official notice bytes');
 assert.equal(await applyNoticeMaterialReview(product(),folder,review),false);
});

test('existing and manually edited material, including a deliberate blank, remain unchanged',async t=>{
 const {folder,input}=await fixture(t),review={...input,material};
 for(const fields of [{material:'면 100%'},{userEditedFields:{material:'면 100%'}},{userEditedFields:{material:''}}]){
  const p={...product(),...fields},before=structuredClone(p);
  assert.equal(await applyNoticeMaterialReview(p,folder,review),false);
  assert.deepEqual(p,before);
 }
 const controller=new AbortController();controller.abort();
 assert.equal(await applyNoticeMaterialReview(product(),folder,review,{signal:controller.signal}),false);
});

test('only successful reviews from the same source and notice bytes are reused from cache',async t=>{
 const {root,folder}=await fixture(t);let calls=0;
 const options={dataRoot:root,checkCli:async()=>{},review:async(_cli,input)=>{calls++;return {...input,material};}};
 const first=await reviewNoticeMaterial(product(),folder,options);
 assert.equal(first.material,material);
 assert.deepEqual(await reviewNoticeMaterial(product(),folder,{...options,checkCli:async()=>{throw Error('not installed');}}),first);
 assert.equal(calls,1);
 const other=product();other.sourceUrl=sourceUrl.replace('a'.repeat(32),'b'.repeat(32));
 assert.equal((await reviewNoticeMaterial(other,folder,options)).sourceUrl,other.sourceUrl);
 assert.equal(calls,2);
 const bytes=await sharp({create:{width:120,height:40,channels:3,background:'#eee'}}).png().toBuffer();
 await writeFile(path.join(folder,'info.jpg'),bytes);
 const changed=await reviewNoticeMaterial(other,folder,options);
 assert.notEqual(changed.noticeHash,first.noticeHash);
 assert.equal(calls,3);
});

test('empty and invalid model readings do not create a cache entry that prevents the next retry',async t=>{
 const {root,folder}=await fixture(t);let calls=0;
 const options={dataRoot:root,checkCli:async()=>{},review:async(_cli,input)=>{
  calls++;return {...input,material:calls===1?'':calls===2?'아크릴45%, 나일론45%, =10%':material};
 }};
 assert.equal(await reviewNoticeMaterial(product(),folder,options),null);
 assert.equal(await reviewNoticeMaterial(product(),folder,options),null);
 assert.equal((await reviewNoticeMaterial(product(),folder,options)).material,material);
 assert.equal(calls,3);
});

test('untrusted source and changed response identity cannot supply automatically applied material',async t=>{
 const {root,folder}=await fixture(t);let calls=0;
 const options={dataRoot:root,checkCli:async()=>{},review:async(_cli,input)=>{calls++;return {...input,style:'326903',material};}};
 assert.equal(await reviewNoticeMaterial({...product(),sourceUrl:'https://example.com/product'},folder,options),null);
 assert.equal(await reviewNoticeMaterial({...product(),images:{info:'https://example.com/notice.jpg'}},folder,options),null);
 assert.equal(calls,0);
 assert.equal(await reviewNoticeMaterial(product(),folder,options),null);
 assert.equal(calls,1);
});
