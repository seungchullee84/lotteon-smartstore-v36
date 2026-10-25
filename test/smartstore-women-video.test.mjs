import test from 'node:test';
import assert from 'node:assert/strict';
import {productVideoOptions,productVideoUrl,requireBrandVideo,WOMEN_VIDEO_HASH} from '../smartstore-brand-video.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {fixtureVideo,videoOptions} from './helpers/brand-video.mjs';
test('여성 상품만 전용 MP4 선택, 남성 공용 미확인은 공통 영상 유지',()=>{
 for(const gender of ['여성','여자','WOMEN','female']){assert.deepEqual(productVideoOptions({gender}),{filename:'women.mp4',expectedHash:WOMEN_VIDEO_HASH});assert.match(productVideoUrl({gender}),/variant=women/);}
 for(const gender of ['남성','남녀공용','공용','','여성 남성']){assert.deepEqual(productVideoOptions({gender}),{});assert.doesNotMatch(productVideoUrl({gender}),/variant=women/);}
});
test('여성 영상 누락시 공통으로 대체하지 않고 중단, 별도 파일 원본 검증',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'women-video-'));
 try{await mkdir(path.join(root,'brand-video'));await writeFile(path.join(root,'brand-video/common.mp4'),fixtureVideo);
 await assert.rejects(requireBrandVideo(root,{...videoOptions,filename:'women.mp4'}),/women.mp4/);
 await writeFile(path.join(root,'brand-video/women.mp4'),fixtureVideo);
 const selected=await requireBrandVideo(root,{...videoOptions,filename:'women.mp4'});assert.deepEqual(selected.bytes,fixtureVideo);assert.match(selected.file,/women.mp4$/);
 await assert.rejects(requireBrandVideo(root,productVideoOptions({gender:'여성'})),/원본과 다릅니다/);
 }finally{await rm(root,{recursive:true,force:true});}
});
