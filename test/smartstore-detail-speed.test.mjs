import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';import {openSmartstoreEditor,smartstoreUploadParts} from '../smartstore-detail-upload.mjs';
test('이미 열린 같은 상품 편집기는 새 popup 이벤트를 기다리지 않는다',async()=>{
 let focused=0;const page={url:()=> 'https://sell.smartstore.naver.com/#/products/edit/123',isClosed:()=>false,locator:()=>assert.fail('다시 열기 금지')};const editor={url:()=> 'https://sell.smartstore.naver.com/#/editor',isClosed:()=>false,opener:async()=>null,bringToFront:async()=>focused++};page.context=()=>({pages:()=>[page,editor]});assert.equal(await openSmartstoreEditor(page),editor);assert.equal(focused,1);
 const other={...page,url:()=> 'https://sell.smartstore.naver.com/#/products/edit/456'};page.context=()=>({pages:()=>[page,editor,other]});await assert.rejects(openSmartstoreEditor(page),/불명확/);
});
test('같은 상세 분할 파일은 검증 후 재사용하고 손상 파일은 복구한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'detail-speed-'));try{
 const png=path.join(root,'detail.png'),brand=path.join(root,'brand.png');await sharp({create:{width:860,height:1200,channels:3,background:'#eee'}}).png().toFile(png);await sharp({create:{width:860,height:100,channels:3,background:'#fff'}}).png().toFile(brand);
 const options={includeVideo:false,videoAfterTop:200,officialTop:400,bannerTop:800,footerTop:1000};const first=await smartstoreUploadParts(png,root,brand,options),bytes=await readFile(first.files[0]),before=(await stat(first.files[0])).mtimeMs;
 const second=await smartstoreUploadParts(png,root,brand,options);assert.deepEqual(second.files,first.files);assert.equal((await stat(first.files[0])).mtimeMs,before);await writeFile(first.files[0],'broken');await smartstoreUploadParts(png,root,brand,options);assert.deepEqual(await readFile(first.files[0]),bytes);
 await sharp({create:{width:860,height:1200,channels:3,background:'#aaa'}}).png().toFile(png);const changed=await smartstoreUploadParts(png,root,brand,options);assert.notEqual(changed.files[0],first.files[0]);
 }finally{await rm(root,{recursive:true,force:true});}
});
