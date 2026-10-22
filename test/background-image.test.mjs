import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {generateBackground} from '../background-image.mjs';
import {prepareMainImage} from '../main-image.mjs';

test('API 합성 결과를 1500 정사각형으로 적용하고 원본을 보존',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'background-api-'));
 try{
  const original=await sharp({create:{width:100,height:150,channels:3,background:'#ddd'}}).jpeg().toBuffer();
  await writeFile(path.join(folder,'main.jpg'),original);
  const generated=await sharp({create:{width:1024,height:1024,channels:3,background:'#abc'}}).jpeg().toBuffer();
  let calls=0;
  const result=await generateBackground({folder,apiKey:'test-secret',fetchImpl:async(url,request)=>{
   calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');
   assert.equal(request.headers.Authorization,'Bearer test-secret');
   assert.equal(request.body.get('model'),'gpt-image-1.5');
   assert.deepEqual(Buffer.from(await request.body.get('image').arrayBuffer()),original);
   return Response.json({data:[{b64_json:generated.toString('base64')}]});
  }});
  assert.equal(calls,1);
  assert.equal(await prepareMainImage(folder),path.join(folder,result.file));
  const metadata=await sharp(await prepareMainImage(folder)).metadata();
  assert.equal(metadata.width,1500);assert.equal(metadata.height,1500);
  assert.deepEqual(await readFile(path.join(folder,'main.jpg')),original);
  const previous=await readFile(path.join(folder,'background-image.json'),'utf8');
  await assert.rejects(generateBackground({folder,apiKey:'test-secret',fetchImpl:async()=>new Response('secret should never be shown',{status:429})}),/한도 또는 잔액/);
  assert.equal(await readFile(path.join(folder,'background-image.json'),'utf8'),previous);
  await assert.rejects(generateBackground({folder,apiKey:'test-secret',fetchImpl:async()=>Response.json({data:[]})}),/받지 못했습니다/);
  assert.equal(await readFile(path.join(folder,'background-image.json'),'utf8'),previous);
  await assert.rejects(generateBackground({folder,apiKey:''}),/API 키/);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('중단된 합성 결과를 대표이미지에 적용하지 않음',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'background-abort-'));
 try{
  await sharp({create:{width:100,height:150,channels:3,background:'#ddd'}}).jpeg().toFile(path.join(folder,'main.jpg'));
  const controller=new AbortController();
  await assert.rejects(generateBackground({folder,apiKey:'test-secret',signal:controller.signal,fetchImpl:async()=>{
   controller.abort();return Response.json({data:[]});
  }}),{name:'AbortError'});
  await assert.rejects(readFile(path.join(folder,'background-image.json')),{code:'ENOENT'});
 }finally{await rm(folder,{recursive:true,force:true});}
});
