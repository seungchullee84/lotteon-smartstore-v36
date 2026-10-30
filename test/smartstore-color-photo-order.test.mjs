import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {prepareTrustedFolder} from '../smartstore-folder-trust.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';

test('모든 품번의 현재 폴더 사진은 파일명과 관계없이 대표·정면·후면·옆면·디테일 순서로 기존 템플릿에 연결한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'color-photo-order-'));try{
  for(const style of ['123456','654321']){
   const dataRoot=path.join(root,'data'),folder=path.join(root,style),pictures=path.join(root,'photos',style);await mkdir(folder,{recursive:true});await mkdir(pictures,{recursive:true});
   const product={style,sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+style,name:'테스트 상의',colors:['01블랙'],images:{}};
   const roles=['front','side','back','front','detail'],names=['1.jpg','a-side.jpg','b-back.jpg','c-front.jpg','d-detail.jpg'];
   const photos=[];for(let i=0;i<names.length;i++){const bytes=await sharp({create:{width:90,height:120,channels:3,background:{r:i*35,g:30,b:40}}}).jpeg().toBuffer(),file=path.join(pictures,names[i]);await writeFile(file,bytes);photos.push({name:names[i],file,bytes});}
   const mapped=photos.map((photo,i)=>({...photo,color:'01블랙',role:roles[i],reviewed:true}));
   const p=await prepareTrustedFolder(product,folder,{dataRoot,photos,mapped,description:'편안한 착용감을 제공합니다.',recognizePhoto:()=>assert.fail('확인한 사진을 다시 OCR하지 않는다')});
   const hashes=photos.map(photo=>createHash('sha256').update(photo.bytes).digest('hex'));
   assert.deepEqual(p.smartstoreDetail.storeColorPhotoHashes['01블랙'],[hashes[0],hashes[3],hashes[2],hashes[1],hashes[4]]);
   assert.equal(p.smartstoreDetail.providedImages.length,0);
   for(const detailTemplate of [1,2]){const html=buildSmartstoreDetail({...p,detailTemplate}).html;assert(!html.includes('data-folder-photos'));assert(html.includes('smartstore-color-0'));for(const src of p.smartstoreDetail.colorImages['01블랙'])assert(html.includes(src));}
   for(const photo of photos)assert.deepEqual(await readFile(photo.file),photo.bytes);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
