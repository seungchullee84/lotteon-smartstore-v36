import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {officialColorChips,collectColorChips,colorChipPosition,decorateMainImage} from '../color-chips.mjs';
import {prepareMainImage} from '../main-image.mjs';
const canvas=()=>sharp({create:{width:1500,height:1500,channels:3,background:'#eeeeee'}});
test('공식 색상칩만 상품 색상 순서대로 가져옴',()=>{
 const html='<ul class="color_option"><li><img src="/_data/product/black.jpg" alt="02 블랙"></li><li><img src="/_data/product/ivory.jpg" alt="01 아이보리"></li><li><img src="https://other.invalid/x.jpg" alt="03 레드"></li></ul>';
 const values=officialColorChips(html,'https://www.giordano.co.kr/shop/detail.php',['01아이보리','02블랙','03레드']);
 assert.deepEqual(values.map(x=>x.name),['01 아이보리','02 블랙']);
});
test('하단 우선, 하단에 물체가 있으면 중단, 두 곳 모두 겹치면 생략',async()=>{
 assert.equal((await colorChipPosition(await canvas().jpeg().toBuffer(),4)).name,'bottom-right');
 const block=await sharp({create:{width:100,height:500,channels:3,background:'#222'}}).png().toBuffer();
 const bottom=await canvas().composite([{input:block,left:1400,top:1000}]).jpeg().toBuffer();
 assert.equal((await colorChipPosition(bottom,4)).name,'middle-right');
 const stripe=await sharp({create:{width:100,height:1500,channels:3,background:'#222'}}).png().toBuffer();
 assert.equal(await colorChipPosition(await canvas().composite([{input:stripe,left:1400,top:0}]).jpeg().toBuffer(),4),null);
 assert.equal(await colorChipPosition(bottom,20),null);
});
test('수집한 칩이 대표이미지 미리보기와 업로드 파일에 반영되고 원본 보존',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'auto-chips-'));
 try{
  const original=await canvas().jpeg().toBuffer();
  const file='main-composite-'+ 'a'.repeat(24)+'.jpg';await writeFile(path.join(folder,file),original);
  await writeFile(path.join(folder,'background-image.json'),JSON.stringify({file}));
  const chip=await sharp({create:{width:20,height:20,channels:3,background:'#223344'}}).jpeg().toBuffer();
  const p={colors:['01블랙'],colorChips:[{name:'01 블랙',url:'https://www.giordano.co.kr/_data/product/chip.jpg'}]};
  await collectColorChips(folder,p,async()=>({ok:()=>true,body:async()=>chip}));
  const output=await prepareMainImage(folder);assert.notEqual(output,path.join(folder,file));
  assert.equal(await prepareMainImage(folder),output);
  assert.deepEqual(await readFile(path.join(folder,file)),original);
  const pixel=await sharp(output).extract({left:1440,top:1440,width:1,height:1}).raw().toBuffer();assert.ok(pixel[0]<80);
  assert.equal(JSON.parse(await readFile(path.join(folder,'colorchip-status.json'),'utf8')).position,'bottom-right');
  const blocked=await sharp({create:{width:1500,height:1500,channels:3,background:'#222'}}).jpeg().toBuffer();await writeFile(path.join(folder,file),blocked);
  assert.equal(await decorateMainImage(folder,path.join(folder,file)),path.join(folder,file));
 }finally{await rm(folder,{recursive:true,force:true});}
});
