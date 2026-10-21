import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readSourceImage,inspectDetailSource} from '../source-image.mjs';
const response=(type,bytes,status=200)=>({ok:()=>status===200,status:()=>status,headers:()=>({'content-type':type}),body:async()=>bytes});
test('200 HTML 안내페이지를 상세 이미지로 처리하지 않음',async()=>{
 await assert.rejects(readSourceImage(response('text/html',Buffer.from('<html>missing</html>'))),/HTML 페이지/);
 await assert.rejects(readSourceImage(response('image/jpeg',Buffer.from('<html>missing</html>'))),/유효한 이미지/);
});
test('원본 누락은 승인한 경우에만 대체 구성을 허용',async()=>{
 const make=()=>({images:{detail:'https://example.test/original.jpg'},originalDetailUrl:'https://example.test/original.jpg',warnings:[]});
 const missing=async()=>response('text/html',Buffer.from('<html>missing</html>'));
 const blocked=make();await assert.rejects(inspectDetailSource(blocked,missing),/HTML/);assert.ok(blocked.images.detail);
 const allowed=make();await inspectDetailSource(allowed,missing,true);assert.equal(allowed.images.detail,undefined);assert.equal(allowed.detailFallbackApproved,true);assert.ok(allowed.missingOriginalDetailUrl);
});
test('승인 상태여도 정상 원본은 그대로 유지하고 통신 실패를 누락으로 간주하지 않음',async()=>{
 const p={images:{detail:'original'},originalDetailUrl:'original',warnings:[]};
 const bytes=await sharp({create:{width:10,height:10,channels:3,background:'white'}}).jpeg().toBuffer();
 assert.deepEqual(await inspectDetailSource(p,async()=>response('image/jpeg',bytes),true),bytes);assert.equal(p.images.detail,'original');
 await assert.rejects(inspectDetailSource(p,async()=>{throw Error('timeout');},true),/timeout/);assert.equal(p.images.detail,'original');
});
test('MIME 표기와 상관없이 실제 이미지 바이트 검증',async()=>{
 const bytes=await sharp({create:{width:10,height:10,channels:3,background:'white'}}).jpeg().toBuffer();
 assert.deepEqual(await readSourceImage(response('application/octet-stream',bytes)),bytes);
 await assert.rejects(readSourceImage(response('image/jpeg',bytes,404)),/404/);
});
