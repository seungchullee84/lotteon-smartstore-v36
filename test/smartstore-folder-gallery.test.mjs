import test from 'node:test';import assert from 'node:assert/strict';
import {folderPhotoGallery} from '../smartstore-folder-gallery.mjs';
import {chromium} from 'playwright';

test('14개 폴더 사진은 순서와 원본 비율을 유지하며 전체 폭·2열 템플릿에 모두 배치된다',async()=>{
 const urls=Array.from({length:14},(_,i)=>'/smartstore-photo/'+String(i).padStart(24,'0'));
 const draft={acceptAllFolderPhotos:true,providedImages:urls};
 const html=folderPhotoGallery({style:'123456'},draft,(src,alt)=>'<img data-source="'+src+'" alt="'+alt+'" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27750%27 height=%271000%27%3E%3C/svg%3E" style="display:block;width:100%;height:auto;">');
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:900,height:1000}});
  await page.setContent('<div style="width:848px">'+html+'</div>');
  const images=page.locator('[data-folder-photos] img');assert.equal(await images.count(),14);
  assert.deepEqual(await images.evaluateAll(imgs=>imgs.map(img=>img.dataset.source)),urls);
  const sizes=await images.evaluateAll(imgs=>imgs.map(img=>({w:img.width,h:img.height,fit:getComputedStyle(img).objectFit})));
  assert(sizes[0].w>sizes[1].w*1.9);assert.equal(sizes[1].w,sizes[2].w);
  assert(sizes.every(s=>Math.abs(s.h/s.w-1000/750)<.01&&s.fit!=='cover'));
  assert.equal(await page.locator('[data-folder-photo-block]').count(),5);
  assert(!html.includes('미분류'));assert(!html.includes('블랙'));assert(!html.includes('옆면'));
 }finally{await browser.close();}
 assert.equal(folderPhotoGallery({style:'654321'},{...draft,acceptAllFolderPhotos:false},()=>assert.fail()),'');
});
