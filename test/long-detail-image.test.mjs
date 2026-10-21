import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {saveLongDetailImage} from '../long-detail-image.mjs';
test('상세·사이즈·고시를 한 장에 순서대로 연결하고 원본 우선 유지',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'long-detail-'));
 try{
  for(const [key,width,height,color] of [['detail',100,200,'red'],['size',200,100,'blue'],['info',100,300,'green']])await sharp({create:{width,height,channels:3,background:color}}).jpeg().toFile(path.join(folder,key+'.jpg'));
  const output=path.join(folder,'combined.png');const r=await saveLongDetailImage({images:{detail:'d',size:'s',info:'i'},originalDetailUrl:'d',colors:[]},folder,output);
  assert.deepEqual(r,{width:100,height:550,count:3});const meta=await sharp(output).metadata();assert.equal(meta.format,'png');
  const {data}=await sharp(output).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.ok(data[0]>200);assert.ok(data[201*100*3+2]>200);
  await assert.rejects(saveLongDetailImage({images:{info:'i'},originalDetailUrl:'missing'},folder,output),/중단/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
