import {requireBrandVideo,BRAND_VIDEO_HEADING_HEIGHT} from './smartstore-brand-video.mjs';
import {insertNativeBrandVideo,assertNativeVideoToolbar,nativeVideoIdentity} from './smartstore-native-video.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
export async function openSmartstoreEditor(page,{check=()=>{}}={}){
 check();
 const input=page.locator('button[data-nclicks-code="descrip.sebtn"]');
 if(!await input.isVisible()){
  const heading=page.getByRole('button',{name:/^상세설명/});
  if(await heading.isVisible())await heading.click();
 }
 // ONE can rebuild/disable the launch button while applying its document to the form.
 await input.waitFor({state:'visible',timeout:30000});check();
 const [editor]=await Promise.all([page.waitForEvent('popup',{timeout:45000}),input.click({timeout:30000})]);
 await editor.bringToFront();return editor;
}
export async function smartstoreUploadParts(png,folder,brandFile,{includeVideo=true,dataRoot,videoOptions}={}){
 const video=includeVideo?await requireBrandVideo(dataRoot,videoOptions):null;
 const meta=await sharp(png,{limitInputPixels:false}).metadata();
 const brand=await sharp(brandFile).metadata();const firstHeight=Math.round(meta.width*brand.height/brand.width)+BRAND_VIDEO_HEADING_HEIGHT;
 if(meta.width!==860||meta.height<=firstHeight)throw Error('상세페이지 이미지 크기를 확인해 주세요.');
 const dest=path.join(folder,'smartstore-upload');await mkdir(dest,{recursive:true});
 const digest=createHash('sha256').update(await readFile(png)).digest('hex').slice(0,16);
 const parts=[];
 for(let top=0,index=0;top<meta.height;index++){
  let height=index===0?firstHeight:Math.min(8000,meta.height-top);
  const file=path.join(dest,digest+'-'+String(index).padStart(2,'0')+'.png');
  let bytes;do{bytes=await sharp(png,{limitInputPixels:false}).extract({left:0,top,width:860,height}).png({compressionLevel:9}).toBuffer();if(bytes.length<=19000000)break;height=Math.floor(height*.7);}while(height>100);
  if(bytes.length>19000000)throw Error('상세이미지 조각 용량을 확인해 주세요.');
  await writeFile(file,bytes);parts.push(file);top+=height;
 }
 return {files:parts,video:video?{file:video.file,sha256:video.sha256}:null,includeVideo,dataRoot,videoOptions,hash:digest};
}
export const insertSmartstoreVideo=insertNativeBrandVideo;
export async function applySmartstoreImageLayout(editor,image,{check=()=>{}}={}){
 check();await image.scrollIntoViewIfNeeded();await editor.bringToFront();
 const componentId=await image.evaluate(n=>n.closest('.se-component.se-image').id);
 const select=async()=>{
  const box=await image.boundingBox(),viewportHeight=await editor.evaluate(()=>innerHeight);
  const top=Math.max(box.y,160),bottom=Math.min(box.y+box.height,viewportHeight-40);
  if(bottom<=top)throw Error('상세이미지 선택 위치를 확인하지 못했습니다.');
  // Locator-relative input keeps the selected image correct for tall PNGs and
  // browser zoom, instead of clicking near the fixed toolbar with page coordinates.
  await image.click({position:{x:box.width/2,y:(top+bottom)/2-box.y}});
  await editor.waitForFunction(id=>!!document.getElementById(id)?.querySelector('.se-section-image.se-is-selected'),componentId,{timeout:15000});
 };
 await select();
 const extend=editor.locator('button[data-name="content-mode-without-pagefull"][data-value="extend"]').filter({visible:true}).first();
 try{await extend.waitFor({state:'visible',timeout:1500});}catch{check();await select();}
 await extend.click();
 await editor.waitForFunction(id=>!!document.getElementById(id)?.querySelector('.se-component-content-extend'),componentId,{timeout:15000});
 check();
}
export async function uploadSmartstoreDetail(page,parts,{check=()=>{},log=()=>{}}={}){
 if(!/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/copy\/\d+/.test(page.url()))throw Error('상세페이지는 스마트스토어 복사등록 화면에서만 교체합니다.');
 check();
 const editor=await openSmartstoreEditor(page,{check});
 await editor.bringToFront();
 await editor.locator('iframe[id^="input_buffer"]').waitFor({state:'attached',timeout:30000});
 await editor.locator('.se-text-paragraph').first().waitFor({state:'visible',timeout:30000});check();
 if(parts.includeVideo!==false){await requireBrandVideo(parts.dataRoot,parts.videoOptions);await assertNativeVideoToolbar(editor);}
 // The restored document and ONE's input buffer initialise asynchronously.
 await editor.waitForFunction(()=>{
   const signature=[...document.querySelectorAll('.se-component')].map(n=>n.id).join('|');
   const state=window.__smartstoreUIReady;
   if(!state||state.signature!==signature){window.__smartstoreUIReady={signature,since:performance.now()};return false;}
   return signature&&performance.now()-state.since>800;
 });
 // Select inside ONE's document. Never send Ctrl+A to the seller's product form.
 await editor.locator('.se-component.se-text .se-text-paragraph').last().click({force:true});
 await editor.waitForFunction(()=>document.activeElement?.id?.startsWith('input_buffer'));
 await editor.keyboard.press('Control+A');await editor.evaluate(()=>new Promise(requestAnimationFrame));
 await editor.keyboard.press('Control+A');await editor.evaluate(()=>new Promise(requestAnimationFrame));
 await editor.keyboard.press('Backspace');
 await editor.waitForFunction(()=>document.querySelectorAll('.se-component').length<=1);
 const existing=await editor.locator('.se-component.se-image,.se-component.se-video,.se-component.se-oembed').count();
 if(existing)throw Error('기존 상세설명이 남아 있어 새 이미지를 올리지 않았습니다.');
 const choose=async(file)=>{
  check();const before=await editor.locator('.se-component.se-image').count();
  const empty=editor.locator('.se-component.se-text .se-text-paragraph').last();
  if(await empty.count())await empty.click({force:true});
  await editor.locator('button[data-group="documentToolbar"][data-name="image"]').click();
  const input=editor.locator('input[type="file"]');
  await input.waitFor({state:'attached',timeout:15000});await input.setInputFiles(file);
  await editor.waitForFunction(count=>document.querySelectorAll('.se-component.se-image').length>count,before,{timeout:60000});
  const lastImage=editor.locator('.se-component.se-image img').last();
  await lastImage.scrollIntoViewIfNeeded();
  await editor.waitForFunction(()=>/^https:\/\//.test([...document.querySelectorAll('.se-component.se-image img')].at(-1)?.src||''),null,{timeout:60000});
  await applySmartstoreImageLayout(editor,lastImage,{check});
 };
 await choose(parts.files[0]);log('브랜드 소개 이미지 업로드');
 if(parts.includeVideo!==false){await editor.locator('.se-component.se-text .se-text-paragraph').last().click({force:true});parts.videoIdentity=await insertSmartstoreVideo(editor,{check,dataRoot:parts.dataRoot,videoOptions:parts.videoOptions});}
 for(const file of parts.files.slice(1))await choose(file);
 const order=await editor.locator('.se-component').evaluateAll(ns=>ns.filter(n=>/se-image|se-video|se-oembed/.test(n.className)).map(n=>n.className));
 const includeVideo=parts.includeVideo!==false;
 if(order.length!==parts.files.length+Number(includeVideo)||!order[0].includes('se-image')||(includeVideo?!/se-video|se-oembed/.test(order[1])||order.slice(2).some(c=>!c.includes('se-image')):order.some(c=>!c.includes('se-image'))))throw Error('브랜드 소개·상품상세 및 영상 설정에 맞는 순서를 확인해 주세요.');
 check();await Promise.all([editor.waitForEvent('close',{timeout:30000}),editor.getByRole('button',{name:'등록',exact:true}).click()]);
 const content=await page.locator('textarea[name="editorContent"]').inputValue();
 if(content!=='true')throw Error('판매자센터 상세설명 반영 결과를 확인하지 못했습니다.');
 // Reopen the saved ONE document to verify persistence, rather than trust its boolean placeholder.
 return verifySmartstoreDetail(page,parts,{check,log});
}
export async function verifySmartstoreDetail(page,parts,{check=()=>{},log=()=>{}}={}){
 check();
 const verified=await openSmartstoreEditor(page,{check});
 await verified.locator('.se-component.se-image img').nth(parts.files.length-1).waitFor({state:'visible',timeout:30000});
 const expected=parts.files.map(file=>path.basename(file));
 const names=[];
 for(let i=0;i<expected.length;i++){
  check();const image=verified.locator('.se-component.se-image img').nth(i);await image.scrollIntoViewIfNeeded();
  await verified.waitForFunction(i=>/^https:\/\//.test(document.querySelectorAll('.se-component.se-image img')[i]?.src||''),i,{timeout:30000});
  names.push(await image.evaluate(n=>decodeURIComponent(new URL(n.src).pathname.split('/').at(-1))));
 }
 const includeVideo=parts.includeVideo!==false;
 const videoCount=await verified.locator('.se-component.se-oembed,.se-component.se-video').count();
 const video=includeVideo&&videoCount===1&&await verified.locator('.se-component.se-video').count()===1?await nativeVideoIdentity(verified.locator('.se-component.se-video')):[];
 const leftoverUrl=await verified.locator('.se-component.se-text').evaluateAll(ns=>ns.some(n=>/youtube\.com\/|youtu\.be\//.test(n.innerText)));
 if(leftoverUrl)throw Error('저장된 상세페이지에 영상 주소 문장이 남아 있습니다.');
 if(JSON.stringify(names)!==JSON.stringify(expected)||await verified.locator('.se-component.se-image .se-component-content-extend').count()!==expected.length||(includeVideo?!video.length||JSON.stringify(video)!==JSON.stringify(parts.videoIdentity?.identity):videoCount!==0))throw Error('저장된 상세페이지의 이미지·MP4 영상·옆트임 설정 대조 결과가 다릅니다.');
 await verified.close();
 log('상세페이지 이미지 '+parts.files.length+'장 반영 확인 · '+(includeVideo?'공통 MP4 포함 · 판매페이지 자동재생 미검증':'영상 제외'));
 return {detailUploaded:true,detailParts:parts.files.length,videoUploaded:includeVideo,videoSha256:parts.videoIdentity?.sha256,videoPlayback:includeVideo?'unverified':null,colorNavigation:false,imageLayout:'extend'};
}
