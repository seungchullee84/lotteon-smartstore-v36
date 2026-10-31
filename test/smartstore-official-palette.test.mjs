import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';import {load} from 'cheerio';
import {attachOfficialPalette} from '../smartstore-official-palette.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('같은 품번·출처·상세 해시의 공식 원본만 빈 팔레트에 연결하고 원본 바이트·매장 사진·판매 옵션을 보존한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'official-palette-')),folder=path.join(root,'product'),draftRoot=path.join(root,'draft');
 try{
  await mkdir(folder);await mkdir(draftRoot);const detail=Buffer.from('current detail'),original=await sharp({create:{width:120,height:150,channels:3,background:'#feadbc'}}).jpeg().toBuffer();
  await writeFile(path.join(folder,'detail.jpg'),detail);await writeFile(path.join(draftRoot,'front.jpg'),original);
  const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=current',colors:['01피치','02블랙','03화이트'],sizes:['M','L'],images:{}};
  const prepared={style:product.style,acceptAllFolderPhotos:true,paletteImages:{'02블랙':'/smartstore-photo/store'},colorImages:{'02블랙':['/smartstore-photo/store']},photoFiles:{},photoCount:1};
  const entry={style:product.style,color:'01피치',sourceUrl:product.sourceUrl,sourceImageUrl:'https://www.giordano.co.kr/front.jpg',sourceHash:hash(original),sourceDetailHash:hash(detail),file:'front.jpg',verified:true,role:'front'};
  await attachOfficialPalette(product,prepared,[entry,{...entry,color:'02블랙'},{...entry,color:'03화이트',sourceDetailHash:'old'}],{folder,draftRoot});
  assert.equal(prepared.paletteImages['02블랙'],'/smartstore-photo/store');assert.equal(prepared.paletteImages['03화이트'],undefined);assert.equal(prepared.photoCount,1);
  assert.deepEqual(prepared.colorImages,{'02블랙':['/smartstore-photo/store']});assert.deepEqual(product.colors,['01피치','02블랙','03화이트']);
  assert.deepEqual(await readFile(path.join(folder,prepared.photoFiles[prepared.paletteImages['01피치']])),original);
  for(const detailTemplate of [1,2]){const $=load(buildSmartstoreDetail({...product,detailTemplate,smartstoreDetail:prepared}).html);assert.equal($('[data-color-palette] img').length,2);assert.equal($('[data-palette-photo-pending]').length,1);assert.equal($('[data-official-palette-original]').length,1);}
  for(const override of [{style:'654321'},{sourceUrl:'https://wrong.example'},{sourceDetailHash:'changed'},{verified:false},{role:'side'},{sourceImageUrl:'https://wrong.example/front.jpg'}]){
   const fresh={...prepared,paletteImages:{},photoFiles:{}};await attachOfficialPalette(product,fresh,[{...entry,...override}],{folder,draftRoot});assert.deepEqual(fresh.paletteImages,{});
  }
  await assert.rejects(attachOfficialPalette(product,{...prepared,paletteImages:{}},[{...entry,file:'../front.jpg'}],{folder,draftRoot}),/경로/);
  await writeFile(path.join(draftRoot,'front.jpg'),'modified');await assert.rejects(attachOfficialPalette(product,{...prepared,paletteImages:{}},[entry],{folder,draftRoot}),/원본이 변경/);
 }finally{await rm(root,{recursive:true,force:true});}
});
