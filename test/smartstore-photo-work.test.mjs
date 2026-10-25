import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {workingProductPhoto,normalizedPhotoBytes} from '../smartstore-photo-work.mjs';
import {saveCareLabelSelection} from '../smartstore-care-label.mjs';

test('세로 상품사진은 비율을 유지해 가운데 배치하고 흰 여백으로 750×1000 JPG를 만든다',async()=>{
 const source=await sharp({create:{width:200,height:400,channels:3,background:'#ff0000'}}).png().toBuffer();
 const result=await normalizedPhotoBytes(source),meta=await sharp(result).metadata();
 assert.equal(meta.width,750);assert.equal(meta.height,1000);assert.equal(meta.format,'jpeg');
 const {data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
 assert(pixel(50,500).every(v=>v>245));assert(pixel(375,500)[0]>240);assert(pixel(375,500)[1]<15);
 assert(pixel(110,500).every(v=>v>245));assert(pixel(140,500)[0]>240,'200:400 비율이 유지되어 가로 폭이 약 500px');
});

test('현재 품번만 변환하고 원본을 보존하며 동일 사진 캐시 재사용·손상 복구를 한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-photo-work-'));
 try{
  const source=await sharp({create:{width:80,height:120,channels:3,background:'#345678'}}).jpeg().toBuffer();
  const file=path.join(root,'original.jpg');await writeFile(file,source);
  const dataRoot=path.join(root,'data'),product={style:'026981'};
  const work=await workingProductPhoto({file},product,{dataRoot});assert(work.includes(path.join('smartstore-photo-work','026981')));
  const before=await stat(work);assert.equal(await workingProductPhoto({file},product,{dataRoot}),work);assert.equal((await stat(work)).mtimeMs,before.mtimeMs);
  assert.deepEqual(await readFile(file),source);
  await writeFile(work,Buffer.from('corrupt'));assert.equal(await workingProductPhoto({file},product,{dataRoot}),work);assert.equal((await sharp(work).metadata()).width,750);
  await assert.rejects(stat(path.join(dataRoot,'smartstore-photo-work','026982')),/ENOENT/);
  const careRoot=path.join(root,'labels');await mkdir(careRoot);const labels=await saveCareLabelSelection(careRoot,[{name:'care.png',bytes:source}]);
  const label=await sharp(path.join(careRoot,labels[0].file)).metadata();assert.equal(label.width,750);assert.equal(label.height,1000);assert.equal(label.format,'jpeg');
 }finally{await rm(root,{recursive:true,force:true});}
});
