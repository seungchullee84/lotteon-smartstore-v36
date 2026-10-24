import {OFFICIAL_BRAND_VIDEO} from './smartstore-detail.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const VIDEO='https://www.youtube.com/watch?v=nRI2390T5GQ';
export async function smartstoreUploadParts(png,folder,brandFile){
 const meta=await sharp(png,{limitInputPixels:false}).metadata();
 const brand=await sharp(brandFile).metadata();const firstHeight=Math.round(meta.width*brand.height/brand.width);
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
 return {files:parts,video:VIDEO,hash:digest};
}
export async function insertSmartstoreVideo(editor,{check=()=>{}}={}){
 check();const before=await editor.locator('.se-component.se-oembed').count();
 await editor.locator('button[data-name="shopping-html"]').click();
 const field=editor.locator('textarea[title="HTML 변환"]');await field.waitFor({state:'visible'});
 await field.fill('<iframe width="848" height="477" src="'+OFFICIAL_BRAND_VIDEO.replaceAll('&','&amp;')+'" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>');
 await editor.getByRole('button',{name:'변환',exact:true}).click();await field.waitFor({state:'hidden'});
 await editor.waitForFunction(count=>document.querySelectorAll('.se-component.se-oembed').length===count+1,before,{timeout:45000});
 if(await editor.locator('.se-component.se-text').evaluateAll(ns=>ns.some(n=>n.innerText.includes('youtube.com/')||n.innerText.includes('youtu.be/'))))throw Error('영상 주소가 본문에 남아 있습니다.');
}
export async function uploadSmartstoreDetail(page,parts,{check=()=>{},log=()=>{}}={}){
 if(!/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/copy\/\d+/.test(page.url()))throw Error('상세페이지는 스마트스토어 복사등록 화면에서만 교체합니다.');
 check();
 const input=page.getByRole('button',{name:/^\s*스마트\s*에디터\s*ONE\s*으로\s*(?:작성|수정)\s*$/});
 if(!await input.isVisible())await page.getByRole('button',{name:/^상세설명/}).click();
 const popup=page.waitForEvent('popup',{timeout:15000});await input.click();const editor=await popup;
 await editor.bringToFront();
 await editor.locator('iframe[id^="input_buffer"]').waitFor({state:'attached',timeout:30000});
 await editor.locator('.se-text-paragraph').first().waitFor({state:'visible',timeout:30000});check();
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
  await editor.bringToFront();
  // A tall image's centre/top may be outside the viewport. Click its visible
  // part below ONE's fixed toolbar, using the current measured image bounds.
  const box=await lastImage.boundingBox(),viewportHeight=await editor.evaluate(()=>innerHeight);
  const top=Math.max(box.y,160),bottom=Math.min(box.y+box.height,viewportHeight-40);
  if(bottom<=top)throw Error('상세이미지 선택 위치를 확인하지 못했습니다.');
  await editor.mouse.click(box.x+box.width/2,Math.min(bottom-5,top+40));
  const fit=editor.locator('button[data-name="content-mode-without-pagefull"][data-value="fit"]').filter({visible:true}).first();
  try{await fit.waitFor({state:'visible',timeout:1500});}catch{
   check();const rect=await lastImage.boundingBox();const upper=Math.max(rect.y,160),lower=Math.min(rect.y+rect.height,viewportHeight-40);
   if(lower<=upper)throw Error('상세이미지 선택 위치를 확인하지 못했습니다.');
   await editor.mouse.click(rect.x+rect.width/2,Math.min(lower-5,upper+40));
  }
  await fit.click();
  await editor.waitForFunction(()=>[...document.querySelectorAll('button[data-name="content-mode-without-pagefull"][data-value="fit"]')].some(n=>n.classList.contains('se-is-selected')));
  check();
 };
 await choose(parts.files[0]);log('브랜드 소개 이미지 업로드');
 // HTML conversion creates ONE's native video without retaining a URL paragraph.
 await editor.locator('.se-component.se-text .se-text-paragraph').last().click({force:true});
 await insertSmartstoreVideo(editor,{check});
 for(const file of parts.files.slice(1))await choose(file);
 const order=await editor.locator('.se-component').evaluateAll(ns=>ns.filter(n=>/se-image|se-video|se-oembed/.test(n.className)).map(n=>n.className));
 if(order.length!==parts.files.length+1||!order[0].includes('se-image')||!/se-video|se-oembed/.test(order[1])||order.slice(2).some(c=>!c.includes('se-image')))throw Error('브랜드 소개·영상·상품상세 순서를 확인해 주세요.');
 check();await editor.getByRole('button',{name:'등록',exact:true}).click();
 await editor.waitForEvent('close',{timeout:15000}).catch(async()=>{if(!editor.isClosed())throw Error('편집창 등록 결과를 확인하지 못했습니다.');});
 const content=await page.locator('textarea[name="editorContent"]').inputValue();
 if(content!=='true')throw Error('판매자센터 상세설명 반영 결과를 확인하지 못했습니다.');
 // Reopen the saved ONE document to verify persistence, rather than trust its boolean placeholder.
 const verifying=page.waitForEvent('popup',{timeout:15000});await input.click();const verified=await verifying;
 await verified.locator('.se-component.se-image img').nth(parts.files.length-1).waitFor({state:'visible',timeout:30000});
 const expected=parts.files.map(file=>path.basename(file));
 const names=[];
 for(let i=0;i<expected.length;i++){
  check();const image=verified.locator('.se-component.se-image img').nth(i);await image.scrollIntoViewIfNeeded();
  await verified.waitForFunction(i=>/^https:\/\//.test(document.querySelectorAll('.se-component.se-image img')[i]?.src||''),i,{timeout:30000});
  names.push(await image.evaluate(n=>decodeURIComponent(new URL(n.src).pathname.split('/').at(-1))));
 }
 const video=await verified.locator('.se-component.se-oembed').first().innerHTML();
 const leftoverUrl=await verified.locator('.se-component.se-text').evaluateAll(ns=>ns.some(n=>/youtube\.com\/|youtu\.be\//.test(n.innerText)));
 if(leftoverUrl)throw Error('저장된 상세페이지에 영상 주소 문장이 남아 있습니다.');
 if(JSON.stringify(names)!==JSON.stringify(expected)||await verified.locator('.se-component.se-image .se-component-content-fit').count()!==expected.length||!video.includes('nRI2390T5GQ'))throw Error('저장된 상세페이지의 이미지·영상·문서 너비 설정 대조 결과가 다릅니다.');
 await verified.close();
 log('상세페이지 이미지 '+parts.files.length+'장 및 공식 영상 반영 확인');
 return {detailUploaded:true,detailParts:parts.files.length,videoUploaded:true,videoPlayback:'click-to-play',colorNavigation:false,imageLayout:'fit'};
}
