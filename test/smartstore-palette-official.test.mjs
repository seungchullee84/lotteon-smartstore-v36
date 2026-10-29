import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {prepareSmartstoreDetail} from '../smartstore-detail-files.mjs';

test('공식 정면 보완은 품번·URL·원본 해시가 일치하는 검증된 색상만 사용한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'palette-official-'));
 try{
  const folder=path.join(root,'collected'),dataRoot=path.join(root,'data'),draftRoot=path.join(dataRoot,'smartstore-details','375908'),photos=path.join(root,'photos');
  for(const dir of [folder,draftRoot,photos])await mkdir(dir,{recursive:true});
  const source=await sharp({create:{width:300,height:300,channels:3,background:'#aaa'}}).jpeg().toBuffer(),hash=createHash('sha256').update(source).digest('hex');
  await writeFile(path.join(folder,'detail.jpg'),source);
  const product={style:'375908',sourceUrl:'https://www.giordano.co.kr/example',colors:['01핑크','02세이지'],images:{detail:'https://www.giordano.co.kr/detail.jpg'}};
  const record={color:'01핑크',verified:true,sourceUrl:product.sourceUrl,sourceImageUrl:product.images.detail,sourceImageHash:hash,rect:{left:0,top:0,width:150,height:150}};
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({style:product.style,sourceUrl:product.sourceUrl,acceptAllFolderPhotos:true,officialPaletteFronts:[record,{...record,color:'02세이지',sourceImageHash:'0'.repeat(64)}]}));
  const result=(await prepareSmartstoreDetail(product,folder,{dataRoot,photoRoots:[photos]})).smartstoreDetail;
  assert.match(result.paletteImages['01핑크'],/^\/smartstore-photo\//);assert.equal(result.paletteImages['02세이지'],undefined);assert.equal(result.photoCount,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
