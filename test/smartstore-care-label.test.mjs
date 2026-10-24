import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,unlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {isCareLabelPhoto,saveCareLabelSelection,prepareCareLabelImages} from '../smartstore-care-label.mjs';
import {validateAnalysis} from '../smartstore-auto-prepare.mjs';

test('care labels are identified by explicit names or a verified content hash, not an old date filename',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-label-'));
 try{
  const bytes=await sharp({create:{width:20,height:30,channels:3,background:'#fff'}}).jpeg().toBuffer();
  assert.equal(isCareLabelPhoto({name:'케어라벨.jpg',bytes}),true);
  assert.equal(isCareLabelPhoto({name:'20261024_125149.jpg',bytes}),false);
  const careLabels=await saveCareLabelSelection(root,[{name:'20261024_125149.jpg',bytes}]);
  assert.equal(isCareLabelPhoto({name:'renamed.jpg',bytes},{careLabels}),true);
  await assert.rejects(saveCareLabelSelection(root,Array(4).fill({name:'label.jpg',bytes})),/최대 3장/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('a deleted local label is not replaced by a stale cached label',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-current-label-'));
 try{
  const source=path.join(root,'photos'),folder=path.join(root,'output'),dataRoot=path.join(root,'data');
  await mkdir(source);await mkdir(folder);const product={style:'076931',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test'};
  const bytes=await sharp({create:{width:20,height:30,channels:3,background:'#fff'}}).jpeg().toBuffer();
  const draftRoot=path.join(dataRoot,'smartstore-details',product.style);const careLabels=await saveCareLabelSelection(draftRoot,[{name:'date.jpg',bytes}]);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...product,careLabels}));
  const file=path.join(source,'date.jpg');await writeFile(file,bytes);
  assert.equal((await prepareCareLabelImages(product,folder,{dataRoot,photoRoots:[source]})).length,1);
  await unlink(file);
  assert.deepEqual(await prepareCareLabelImages(product,folder,{dataRoot,photoRoots:[source]}),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('label analysis allows an absent printed color but still requires the correct product',()=>{
 const product={colors:['01블랙']},unknown=[{id:'label',name:'date.jpg'}],description='공식 상품 설명입니다';
 const result={points:[{title:'특징',description:'설명',evidence:description}],photos:[{id:'label',color:'',confidence:.99,sameProduct:true,role:'care-label'}]};
 assert.equal(validateAnalysis(result,product,description,unknown),result);
 assert.throws(()=>validateAnalysis({...result,photos:[{...result.photos[0],sameProduct:false}]},product,description,unknown),/색상·품번/);
});
