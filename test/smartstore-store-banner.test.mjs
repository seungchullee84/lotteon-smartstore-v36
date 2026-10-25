import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {storeBannerAsset,STORE_BANNER_URL,STORE_BANNER_TEXT} from '../smartstore-store-banner.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {smartstoreUploadParts} from '../smartstore-detail-upload.mjs';
import {publishable} from '../github-sync.mjs';
test('성별 공식 모델 배너와 사용자 지정 스토어 링크가 고시 다음·혜택 앞에 들어간다',()=>{
 for(const [gender,kind] of [['여성','women'],['남성','men'],['남녀공용','unisex'],['','unisex']]){
  const p={style:'123456',gender,images:{detail:'https://www.giordano.co.kr/detail.jpg',info:'https://www.giordano.co.kr/info.jpg'}};
  assert.equal(storeBannerAsset(p),'store-discovery-'+kind+'.jpg');
  const html=buildSmartstoreDetail(p).html;
  assert.ok(html.indexOf('info.jpg')<html.indexOf('data-store-banner'));
  assert.ok(html.indexOf('data-store-banner')<html.indexOf('benefits.jpg'));
  assert.ok(html.includes('href="'+STORE_BANNER_URL+'"'));
  assert.ok(html.includes(STORE_BANNER_TEXT));
  assert.equal(publishable('public/smartstore-template/'+storeBannerAsset(p)),true);
 }
});
test('클릭 배너만 정확히 분리하고 전후 모든 픽셀을 보존한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'store-banner-'));
 try{
  const png=path.join(root,'detail.png'),brand=path.join(root,'brand.jpg');
  await sharp({create:{width:860,height:7000,channels:3,background:'#eee'}}).composite([{input:await sharp({create:{width:860,height:420,channels:3,background:'#24583b'}}).png().toBuffer(),top:4100,left:0}]).png().toFile(png);
  await sharp({create:{width:860,height:600,channels:3,background:'#fff'}}).jpeg().toFile(brand);
  const parts=await smartstoreUploadParts(png,root,brand,{includeVideo:false,storeBanner:{top:4100,height:420,url:STORE_BANNER_URL}});
  assert.deepEqual(parts.links,{});
  assert.deepEqual(parts.manualLinks,{2:STORE_BANNER_URL});
  assert.equal((await sharp(parts.files[2]).metadata()).height,420);
  let top=0;const layers=[];for(const f of parts.files){layers.push({input:await readFile(f),left:0,top});top+=(await sharp(f).metadata()).height;}
  assert.equal(top,7000);
  const restored=await sharp({create:{width:860,height:7000,channels:3,background:'#fff'}}).composite(layers).removeAlpha().raw().toBuffer();
  assert.deepEqual(restored,await sharp(png).removeAlpha().raw().toBuffer());
  await assert.rejects(smartstoreUploadParts(png,root,brand,{includeVideo:false,storeBanner:{top:4100,height:420,url:'https://example.com/'}}),/연결 주소/);
 }finally{await rm(root,{recursive:true,force:true});}
});
