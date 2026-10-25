import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {officialSectionMatch,embeddedOfficialSections} from '../smartstore-official-sections.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
async function chart(label){return sharp(Buffer.from(`<svg width="500" height="300"><rect width="500" height="300" fill="white"/><text x="20" y="48" font-size="35">${label}</text><path d="M20 75H480M20 130H480M20 185H480M20 240H480M180 75V260M350 75V260" stroke="black" stroke-width="3"/><text x="200" y="120" font-size="28">67 70 73</text><text x="25" y="175" font-size="25">COTTON</text><circle cx="280" cy="220" r="15" fill="black"/></svg>`)).jpeg({quality:92}).toBuffer();}
test('긴 원본 속 전체 섹션을 확인하며 다른 사진과 빈 이미지는 중복으로 처리하지 않는다',async()=>{
 const section=await chart('INFORMATION');const detail=await sharp({create:{width:500,height:1000,channels:3,background:'#7393b5'}}).composite([{input:section,left:0,top:650}]).jpeg({quality:90}).toBuffer();
 const matched=await officialSectionMatch(detail,section);assert.equal(matched.included,true);assert.ok(Math.abs(matched.top-650)<=1);
 const different=await sharp({create:{width:500,height:300,channels:3,background:'#1a3b24'}}).jpeg().toBuffer();
 assert.equal((await officialSectionMatch(detail,different)).included,false);
 const blank=await sharp({create:{width:500,height:300,channels:3,background:'#fff'}}).jpeg().toBuffer();assert.equal((await officialSectionMatch(detail,blank)).included,false);
});
test('원본 바이트를 유지하고 이미지가 바뀌면 포함 여부 캐시를 재검증한다',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'official-inclusion-'));try{
 const info=await chart('INFORMATION'),detail=await sharp({create:{width:500,height:900,channels:3,background:'#345678'}}).composite([{input:info,left:0,top:600}]).jpeg({quality:92}).toBuffer();
 await writeFile(path.join(folder,'detail.jpg'),detail);await writeFile(path.join(folder,'info.jpg'),info);
 const p={style:'123456',images:{detail:'d',info:'i'}};
 assert.deepEqual(await embeddedOfficialSections(p,folder),['info']);assert.deepEqual(await readFile(path.join(folder,'detail.jpg')),detail);
 assert.deepEqual(await embeddedOfficialSections(p,folder),['info']);
 await writeFile(path.join(folder,'info.jpg'),await sharp({create:{width:500,height:300,channels:3,background:'#213721'}}).jpeg().toBuffer());
 assert.deepEqual(await embeddedOfficialSections(p,folder),[]);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('포함된 정보만 추가 삽입에서 빼고 전체 원본과 원본에 없는 정보는 남긴다',()=>{
 const p={style:'123456',images:{detail:'https://x.test/detail.jpg',size:'https://x.test/size.jpg',check:'https://x.test/check.jpg',info:'https://x.test/info.jpg'},smartstoreDetail:{style:'123456',embeddedOfficialSections:['size','info']}};
 const html=buildSmartstoreDetail(p).html;assert.equal((html.match(/https:\/\/x.test\/detail.jpg/g)||[]).length,1);assert.ok(html.includes(p.images.check));assert.ok(!html.includes(p.images.size));assert.ok(!html.includes(p.images.info));
 const unverified=buildSmartstoreDetail({...p,smartstoreDetail:{style:p.style}}).html;for(const src of Object.values(p.images))assert.ok(unverified.includes(src));
 const noDetail=buildSmartstoreDetail({...p,images:{main:'https://x.test/main.jpg',size:p.images.size,check:p.images.check,info:p.images.info}}).html;
 for(const key of ['size','check','info'])assert.ok(noDetail.includes(p.images[key]));
});
