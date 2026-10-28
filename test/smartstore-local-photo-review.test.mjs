import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {localPhotoReview,applyLocalPhotoReview} from '../smartstore-local-photo-review.mjs';

test('폴더 사진 선택은 원본을 보존하고 동일 바이트의 다른 파일도 색상별로 저장하며 변경된 원본은 재확인한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'local-photo-review-'));
 try{
  const desktop=path.join(root,'desktop'),dataRoot=path.join(root,'data'),folder=path.join(desktop,'상품등록기사진폴더/056933');await mkdir(folder,{recursive:true});
  const bytes=Buffer.from('test-only image bytes');await writeFile(path.join(folder,'기존상품_01_a.jpg'),bytes);await writeFile(path.join(folder,'기존상품_02_b.jpg'),bytes);
  const product={style:'056933',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=1',colors:['01네이비','02그레이']},options={dataRoot,desktop};
  const photos=await localPhotoReview(product,options);assert.equal(photos.length,2);assert.notEqual(photos[0].id,photos[1].id);
  const choices=photos.map((p,i)=>({id:p.id,color:product.colors[i],role:'front'}));await applyLocalPhotoReview(product,choices,options);
  const saved=await localPhotoReview(product,options);assert.deepEqual(saved.map(p=>p.color),product.colors);
  for(const p of saved)assert.deepEqual(await readFile(p.file),bytes);
  await assert.rejects(applyLocalPhotoReview(product,[...choices.slice(0,1),{...choices[1],color:'다른색'}],options),/색상/);
  await writeFile(path.join(folder,'기존상품_02_b.jpg'),Buffer.from('changed image'));await assert.rejects(applyLocalPhotoReview(product,choices,options),/색상|각도|사진/);
  const changed=await localPhotoReview(product,options);assert.equal(changed[1].role,'provided');
 }finally{await rm(root,{recursive:true,force:true});}
});
