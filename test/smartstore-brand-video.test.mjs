import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {prepareVideo,fixtureVideo,videoOptions} from './helpers/brand-video.mjs';
import {requireBrandVideo,exportBrandVideo,serveBrandVideo,brandVideoHtml} from '../smartstore-brand-video.mjs';
test('공통 MP4 누락·원본 변조는 대체 영상 없이 중단, 내보내기는 원본 바이트 보존',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'brand-video-'));
 try{
  await assert.rejects(requireBrandVideo(root),/공통 MP4가 없습니다/);
  await prepareVideo(root);await assert.rejects(requireBrandVideo(root),/원본과 다릅니다/);
  const saved=await exportBrandVideo(path.join(root,'detail'),root,videoOptions);
  assert.deepEqual(await readFile(saved.path),fixtureVideo);assert.equal(saved.storePlayback,'unverified');
  await writeFile(path.join(root,'brand-video/common.mp4'),Buffer.from('corrupt'));
  await assert.rejects(requireBrandVideo(root,videoOptions),/원본과 다릅니다/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('MP4 range·suffix·HEAD·범위 오류 응답과 로컬 재생 옵션',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'brand-video-'));await prepareVideo(root);
 const server=http.createServer((req,res)=>serveBrandVideo(req,res,root,videoOptions).catch(e=>{res.statusCode=500;res.end(e.message);}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  const full=await fetch(url);assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await full.arrayBuffer()),fixtureVideo);
  for(const [range,start,end] of [['bytes=4-7',4,7],['bytes=8-',8,fixtureVideo.length-1],['bytes=-4',fixtureVideo.length-4,fixtureVideo.length-1]]){
   const res=await fetch(url,{headers:{Range:range}});assert.equal(res.status,206);assert.equal(res.headers.get('content-range'),`bytes ${start}-${end}/${fixtureVideo.length}`);assert.deepEqual(Buffer.from(await res.arrayBuffer()),fixtureVideo.subarray(start,end+1));
  }
  for(const range of ['bytes=999-','bytes=8-4','bytes=','bytes=-0','bytes=1-2,4-5']){const res=await fetch(url,{headers:{Range:range}});assert.equal(res.status,416);}
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),String(fixtureVideo.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  const html=brandVideoHtml('detail_브랜드영상.mp4');assert.match(html,/controls autoplay muted loop playsinline/);assert.match(html,/aspect-ratio:9\/14/);assert.doesNotMatch(html,/iframe|youtube|<script/);
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
