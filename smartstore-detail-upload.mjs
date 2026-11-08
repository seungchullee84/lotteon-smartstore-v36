export function smartstorePartLayout(parts,index){return 'fit';}
export function smartstoreMediaOrder(parts){
 if(!Array.isArray(parts.files)||!parts.files.length)throw Error('첨부할 상세이미지가 없습니다.');
 const include=parts.includeVideo!==false,index=parts.videoAfterIndex??0;
 if(include&&(!Number.isInteger(index)||index<0||index>=parts.files.length))throw Error('브랜드 영상 삽입 위치를 확인해 주세요.');
 return parts.files.flatMap((_,i)=>include&&i===index?['image','video']:['image']);
}
import {requireBrandVideo,BRAND_VIDEO_HEADING_HEIGHT} from './smartstore-brand-video.mjs';
import {insertNativeBrandVideo,assertNativeVideoToolbar,nativeVideoIdentity} from './smartstore-native-video.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {STORE_BANNER_URL} from './smartstore-store-banner.mjs';
import {normalizeSmartstoreProductLink} from './smartstore-product-link.mjs';
import {isSmartstoreDetailEditUrl} from './smartstore-detail-only.mjs';
import {bindSmartstoreDraft} from './smartstore-upload-recovery.mjs';
export async function waitForSmartstoreEditorInput(editor,{check=()=>{}}={}){
 check();
 await editor.locator('iframe[id^="input_buffer"]').waitFor({state:'attached',timeout:30000});
 // Image captions also use se-text-paragraph, including hidden captions at
 // the start of restored documents. Wait for an actual visible text component.
 await editor.locator('.se-component.se-text .se-text-paragraph').filter({visible:true}).first().waitFor({state:'visible',timeout:30000});
 check();
}
export async function focusSmartstoreEditorInput(editor,{check=()=>{}}={}){
 check();
 // ONE's visible SVG caret sits above the paragraph and receives its pointer
 // events. Click through that layer, then verify ONE owns keyboard focus.
 await editor.locator('.se-component.se-text .se-text-paragraph').filter({visible:true}).last().click({force:true});
 // After attaching a photo, ONE can move its caret while leaving browser
 // focus on body. Focus its existing input buffer before sending any keys.
 if(!await editor.evaluate(()=>document.activeElement?.id?.startsWith('input_buffer')))await editor.locator('iframe[id^="input_buffer"]').focus();
 await editor.waitForFunction(()=>document.activeElement?.id?.startsWith('input_buffer'),null,{timeout:5000});
 check();
}
export async function attachSmartstorePhoto(editor,file,{check=()=>{},onSubmit=()=>{},timeout=15000}={}){
 const picker=editor.getByRole('dialog').filter({hasText:'내 사진 불러오기'}).filter({visible:true});
 const activePicker=picker.and(editor.locator(':not(.in-remove, .ng-leave)'));
 let chooser=null,clickedPicker=false,toolbarAttempts=0,nextToolbarAttempt=0;
 const capture=value=>{chooser=value;};
 editor.on('filechooser',capture);
 try{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
   check();
   if(chooser){onSubmit();await chooser.setFiles(file,{timeout:60000});check();return;}
   const count=await activePicker.count();
   if(count>1)throw Error('사진 선택 창을 한 곳으로 확인하지 못했습니다.');
   if(count===1){
    if(!clickedPicker){await activePicker.getByRole('button',{name:'내 사진',exact:true}).click({timeout:3000});clickedPicker=true;}
   // ONE keeps a closing dialog visible during its fade-out. Wait for it
   // before opening another one, and never send a file to that old dialog.
   }else if(!clickedPicker&&toolbarAttempts<3&&Date.now()>=nextToolbarAttempt&&!await picker.count()){
    toolbarAttempts++;nextToolbarAttempt=Date.now()+1500;
    await editor.locator('button[data-group="documentToolbar"][data-name="image"]').click({timeout:3000});
   }
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Object.assign(Error('현재 사진 선택 창의 내 사진 버튼과 파일 선택기를 확인하지 못했습니다.'),{code:'SMARTSTORE_UI_DELAY'});
 }finally{editor.off('filechooser',capture);}
}
export async function openSmartstoreEditor(page,{check=()=>{}}={}){
 check();
 // Reuse ONE's named window: Chrome does not emit a new popup event for it.
 const context=page.context?.();
 if(context){
  const editors=context.pages().filter(p=>!p.isClosed()&&/^https:\/\/sell\.smartstore\.naver\.com\/#\/editor(?:\?|$)/.test(p.url()));
  const linked=[];for(const editor of editors)if(await editor.opener()===page)linked.push(editor);
  const forms=[...new Set(context.pages().filter(p=>!p.isClosed()&&/\/#\/products\/(?:edit|copy)\/\d+/.test(p.url())).map(p=>p.url()))];
  const existing=linked.length===1?linked[0]:!linked.length&&editors.length===1&&forms.length===1&&forms[0]===page.url()?editors[0]:null;
  if(existing){check();await existing.bringToFront();return existing;}
  if(editors.length)throw Error('상세 편집기의 상품 연결이 불명확합니다. 사용할 상품과 편집기 한 개를 남겨 주세요.');
 }
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
export async function smartstoreUploadParts(png,folder,brandFile,{includeVideo=true,dataRoot,partsCacheRoot,log=()=>{},videoOptions,brandIntroHeight,videoAfterTop,footerTop,bannerTop,officialTop,signal}={}){
 signal?.throwIfAborted();
 const video=includeVideo?await requireBrandVideo(dataRoot,videoOptions):null;
 const meta=await sharp(png,{limitInputPixels:false}).metadata();
 const brand=videoAfterTop===undefined&&brandIntroHeight===undefined?await sharp(brandFile).metadata():null;const firstHeight=videoAfterTop??(brandIntroHeight??Math.round(meta.width*brand.height/brand.width))+BRAND_VIDEO_HEADING_HEIGHT;
 if(meta.width!==860||meta.height<=firstHeight)throw Error('상세페이지 이미지 크기를 확인해 주세요.');
 if(footerTop!==undefined&&(!Number.isInteger(footerTop)||footerTop<firstHeight||footerTop>=meta.height))throw Error('구매 혜택부터 하단까지의 이미지 구간을 확인해 주세요.');
 if(bannerTop!==undefined&&(!Number.isInteger(bannerTop)||footerTop===undefined||bannerTop<firstHeight||bannerTop>=footerTop))throw Error('하단 안내 위 배너 이미지 구간을 확인해 주세요.');
 if(!Number.isInteger(firstHeight)||firstHeight<=0)throw Error('브랜드 영상 삽입 위치를 확인해 주세요.');
 if(officialTop!==undefined&&(!Number.isInteger(officialTop)||officialTop<=0||(videoAfterTop===undefined&&officialTop<=firstHeight)||officialTop>=(bannerTop??footerTop??meta.height)))throw Error('공식 디테일부터 INFORMATION까지의 이미지 구간을 확인해 주세요.');
 // Content-addressed sections survive a new collection/output folder. The full
 // PNG and section boundaries still determine the key; every hit is hashed.
 const dest=partsCacheRoot||path.join(folder,'smartstore-upload');await mkdir(dest,{recursive:true});
 const boundaries=[...new Set([0,firstHeight,officialTop,bannerTop,footerTop,meta.height].filter(Number.isInteger))].sort((a,b)=>a-b);
 const digest=createHash('sha256').update(await readFile(png)).update(JSON.stringify({rule:'semantic-sections-aida-3',boundaries})).digest('hex').slice(0,16);
 const cacheFile=path.join(dest,digest+'-parts.json');
 let cached;try{cached=JSON.parse(await readFile(cacheFile,'utf8'));}catch{}
 const parts=[];let bannerLink=null,footerIndex,reusedCount=0;const records=[];
 for(let index=0;index<boundaries.length-1;index++){
  signal?.throwIfAborted();
  const top=boundaries[index],height=boundaries[index+1]-top;
  const footer=top===footerTop;
  const banner=top===bannerTop;
  const file=path.join(dest,digest+'-'+String(index).padStart(2,'0')+'.png');
  let bytes,reused=false;
  const record=cached?.files?.[index];
  if(record?.name===path.basename(file))try{const stored=await readFile(file);if(createHash('sha256').update(stored).digest('hex')===record.sha256){bytes=stored;reused=true;}}catch{}
  bytes||=await sharp(png,{limitInputPixels:false}).extract({left:0,top,width:860,height}).png({compressionLevel:6}).toBuffer();
  // Retry oversized sections with lossless filtering before rejecting them.
  // Keep every pixel, the 860px width, tables and semantic section boundaries.
  if(bytes.length>19000000){bytes=await sharp(bytes,{limitInputPixels:false}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();reused=false;}
  records.push({name:path.basename(file),sha256:createHash('sha256').update(bytes).digest('hex')});
  if(bytes.length>19000000)throw Error('상세 구간 한 장의 업로드 용량을 초과했습니다. 원본과 표를 유지하기 위해 중간 분할하지 않았습니다.');
  signal?.throwIfAborted();
  if(!reused)await writeFile(file,bytes);else reusedCount++;parts.push(file);
  if(footer)footerIndex=index;
  if(banner)bannerLink={index,file,url:STORE_BANNER_URL};
 }
 await writeFile(cacheFile,JSON.stringify({files:records}));
 log('업로드용 상세 '+parts.length+'장 준비 · 원본 일치 재사용 '+reusedCount+'장');
 return {files:parts,reusedCount,bannerLink,footerIndex,videoAfterIndex:boundaries.indexOf(firstHeight)-1,video:video?{file:video.file,sha256:video.sha256}:null,includeVideo,dataRoot,videoOptions,hash:digest};
}
async function imageForLink(editor, link) {
 const image=editor.locator('.se-component.se-image img').nth(link.index);
 const actual=await image.evaluate(node=>{
  const component=node.closest('.se-component.se-image');
  if(component?.querySelectorAll('img').length!==1)return null;
  return decodeURIComponent(new URL(node.src).pathname.split('/').at(-1));
 });
 if(actual!==path.basename(link.file))throw Error('연결할 사진의 파일명 또는 순서가 다릅니다.');
 return image;
}

async function openImageLinkInput(editor,image,check){
 await selectSmartstoreImage(editor,image,{check});
 check();
 const toolbar=editor.locator('button[data-name="image-link"]').filter({visible:true});
 await toolbar.click();
 const input=editor.locator('input[type="url"],input[placeholder*="URL"],input[placeholder*="주소"],input[placeholder*="http"]').filter({visible:true});
 await input.waitFor({state:'visible',timeout:5000});
 if(await input.count()!==1)throw Error('사진 링크 주소 입력란을 한 곳으로 확인하지 못했습니다.');
 return {input,toolbar};
}

async function submitImageLink(editor,image,url,check){
 const {input}=await openImageLinkInput(editor,image,check);
 check();await input.fill(url);
  // ONE uses an icon-only check button immediately to the right of this input.
  // Resolve it inside the input's row rather than another dialog's Apply button.
  const buttonIndex=await input.evaluate(n=>{
   const controls=[...document.querySelectorAll('button,[role="button"]')],r=n.getBoundingClientRect();
   for(let scope=n.parentElement,depth=0;scope&&depth<4;scope=scope.parentElement,depth++){
    const nearby=[...scope.querySelectorAll('button,[role="button"]')].filter(b=>{
     const s=b.getBoundingClientRect();return s.width>0&&s.height>0&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&s.left>=r.right-3&&s.left-r.right<120&&Math.abs((s.top+s.bottom-r.top-r.bottom)/2)<Math.max(20,r.height);
    });
    const checks=nearby.filter(b=>/적용|확인|완료|apply|confirm|check/i.test([b.textContent,b.getAttribute('aria-label'),b.title,b.className,b.getAttribute('data-name'),...[...b.querySelectorAll('[class]')].map(e=>e.getAttribute('class'))].join(' ')));
    if(checks.length===1)return controls.indexOf(checks[0]);
    if(nearby.length===1)return controls.indexOf(nearby[0]);
    if(nearby.length>1)return -1;
   }
   return -1;
  });
  if(buttonIndex<0)throw Error('링크 주소 오른쪽 체크 버튼을 확인하지 못했습니다.');
  check();await editor.locator('button,[role="button"]').nth(buttonIndex).click();
}

export async function applySmartstoreBannerLink(editor,parts,{check=()=>{},log=()=>{}}={}){
 const link=parts.bannerLink;if(!link)return;
 if(link.url!==STORE_BANNER_URL||!Number.isInteger(link.index)||parts.files[link.index]!==link.file)throw Error('배너 이미지와 연결 주소를 확인해 주세요.');
 try{
  check();const image=await imageForLink(editor,link);
  if(await image.evaluate((n,url)=>n.closest('a')?.href===url,link.url)){parts.bannerLinkSubmitted=true;return;}
  await submitImageLink(editor,image,link.url,check);
  parts.bannerLinkSubmitted=true;
 }catch(error){throw Error('배너 링크 연결 확인 실패: '+error.message);}
 check();log('배너 주소 입력·오른쪽 체크 완료 · 링크 검증 대기 없이 문서 너비 배치 처리 계속');
}

async function assertLinkedPhotoBytes(link){
 const current=createHash('sha256').update(await readFile(link.file)).digest('hex');
 if(current!==link.sha256)throw Error(link.style+' 비교 사진 파일이 변경되었습니다.');
}

export async function validateSmartstoreProductPhotoLinks(parts){
 const links=parts.imageLinks;
 if(links===undefined)return [];
 if(!Array.isArray(links)||links.length<1||links.length>2)throw Error('비교 상품의 사진 링크를 확인해 주세요.');
 const seen={styles:new Set(),indexes:new Set(),names:new Set(),urls:new Set()};
 for(const link of links){
  if(!link||typeof link.style!=='string'||!/^\d{6}$/.test(link.style)||!Number.isInteger(link.index)||link.index<0||
     typeof link.file!=='string'||parts.files[link.index]!==link.file||typeof link.sha256!=='string'||! /^[a-f0-9]{64}$/.test(link.sha256))throw Error('상품 사진과 링크 순서가 맞지 않습니다.');
  const name=path.basename(link.file),identity=normalizeSmartstoreProductLink(link.url);
  if(link.index===parts.bannerLink?.index||seen.styles.has(link.style)||seen.indexes.has(link.index)||seen.names.has(name)||seen.urls.has(identity))throw Error('비교 상품의 사진이나 연결 주소가 중복되었습니다.');
  seen.styles.add(link.style);seen.indexes.add(link.index);seen.names.add(name);seen.urls.add(identity);
  await assertLinkedPhotoBytes(link);
 }
 return links;
}

function sameProductDestination(actual,expected){
 try{return normalizeSmartstoreProductLink(actual)===normalizeSmartstoreProductLink(expected);}catch{return false;}
}

async function productPhotoLinkMatches(image,url){
 const current=await image.evaluate(node=>node.closest('a')?.href||null);
 return sameProductDestination(current,url);
}

export async function applySmartstoreProductPhotoLinks(editor,links,{check=()=>{},log=()=>{}}={}){
 for(const link of links){
  check();const image=await imageForLink(editor,link);
  if(!await productPhotoLinkMatches(image,link.url))await submitImageLink(editor,image,link.url,check);
 }
 for(const link of links){
  try{
   check();const image=await imageForLink(editor,link);
   if(!await productPhotoLinkMatches(image,link.url)){
    const {input,toolbar}=await openImageLinkInput(editor,image,check);
    const value=await input.evaluate(node=>node.value);
    if(!sameProductDestination(value,link.url))throw Error('다시 열었을 때 주소가 일치하지 않습니다.');
    check();await toolbar.click();await input.waitFor({state:'hidden',timeout:3000});
   }
   log(link.style+' 사진 구매 링크 확인');
  }catch(error){throw Error(link.style+' 사진 구매 링크를 확인하지 못했습니다. 편집기 사진은 유지했습니다. · '+error.message);}
 }
}
export const insertSmartstoreVideo=insertNativeBrandVideo;
export async function selectSmartstoreImage(editor,image,{check=()=>{}}={}){
 check();
 try{await image.click({timeout:3000});check();return;}catch{check();}
 // The editable image section receives ONE's pointer events; its bitmap can
 // be behind a link/selection layer. Let Playwright scroll and click that
 // container first, without rejecting it through a separate DOM hit test.
 const section=image.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," se-section-image ")][1]');
 const component=image.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," se-component ")][1]');
 const target=await section.count()?section:await component.count()?component:image;
 let clickIssue;
 try{
  await image.scrollIntoViewIfNeeded();
  const bitmap=await image.boundingBox(),container=await target.boundingBox();
  if(!bitmap||!container)throw Error('이미지 위치가 아직 표시되지 않았습니다.');
  await target.click({position:{x:bitmap.x-container.x+bitmap.width/2,y:bitmap.y-container.y+bitmap.height/2},timeout:3000});
  check();return;
 }catch(error){check();clickIssue=error;}
 for(const alignment of [null,'center','start']){
  check();await image.scrollIntoViewIfNeeded();
  if(alignment)await image.evaluate((n,block)=>n.scrollIntoView({block,inline:'nearest',behavior:'instant'}),alignment);
  const point=await image.evaluate(n=>{
   const r=n.getBoundingClientRect(),component=n.closest('.se-component.se-image');
   const l=Math.max(0,r.left),t=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
   if(right-l<2||bottom-t<2)return null;
   for(const yf of [.5,.75,.9,.25,.1])for(const xf of [.5,.25,.75]){
    const x=l+(right-l)*xf,y=t+(bottom-t)*yf,hit=document.elementFromPoint(x,y);
    const same=component&&hit?.closest('.se-component.se-image')===component;
    if((hit===n||same)&&!hit?.closest('button,input,select,textarea,[role="button"],[role="toolbar"]'))return {x:(x-r.left)/r.width,y:(y-r.top)/r.height};
   }
   return null;
  });
  if(!point)continue;
  const box=await image.boundingBox();if(!box?.width||!box?.height)continue;
  // DOM hit testing uses local CSS coordinates; boundingBox uses the page's
  // input coordinates. Fractions map correctly under zoom and inside frames.
  await editor.mouse.click(box.x+point.x*box.width,box.y+point.y*box.height);return;
 }
 throw Error('상세이미지 선택 영역 클릭 실패: '+clickIssue.message+' · 편집기 내용은 유지했습니다.');
}
export async function applySmartstoreImageLayout(editor,image,{check=()=>{},layout='fit'}={}){
 if(!['extend','fit'].includes(layout))throw Error('지원하지 않는 이미지 배치');
 const component=image.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," se-component ")][1]');
 for(let attempt=0;attempt<2;attempt++){
  check();if(await image.evaluate((n,value)=>!!n.closest('.se-component.se-image')?.querySelector('.se-component-content-'+value),layout))return;
  await image.scrollIntoViewIfNeeded();await editor.bringToFront();await selectSmartstoreImage(editor,image,{check});
  const button=editor.locator('button[data-name="content-mode-without-pagefull"][data-value="'+layout+'"]').filter({visible:true}).first();
  try{await button.waitFor({state:'visible',timeout:1500});}catch{check();await selectSmartstoreImage(editor,image,{check});}
  await button.click();
  // ONE may replace the image component and its id when switching layout.
  // Re-resolve the image's current ancestor instead of waiting on an old id.
  try{await component.locator('.se-component-content-'+layout).waitFor({state:'attached',timeout:attempt?10000:5000});check();return;}
  catch(error){check();if(attempt===0)continue;
   const observed=await image.evaluate(n=>({component:!!n.closest('.se-component.se-image'),classes:n.closest('.se-component.se-image')?.querySelector('.se-component-content')?.className||''})).catch(()=>({component:false,classes:''}));
   throw Error((layout==='fit'?'문서 너비':'옆트임')+' 배치 확인 실패 · 현재 이미지에 배치만 두 번 적용했습니다. 파일 재업로드·편집기 등록은 하지 않았습니다. · '+observed.classes);
  }
 }
}
export async function commitSmartstoreEditor(page,editor,imageCount,{check=()=>{},log=()=>{},bannerIndex,footerIndex,imageLinks=[],applyEditor=false}={}){
 check();
 // ONE can render the layout before its document model has finished updating.
 // Wait for a stable, fully hosted image set once, immediately before applying.
 try{await editor.waitForFunction(count=>{
  const images=[...document.querySelectorAll('.se-component.se-image img')];
  if(images.length!==count||images.some(n=>!/^https:\/\//.test(n.src))){delete window.__smartstoreLayoutReady;return false;}
  const signature=images.map(n=>n.closest('.se-component.se-image').id+'|'+n.src).join('\n');
  const before=window.__smartstoreLayoutReady;
  if(!before||before.signature!==signature){window.__smartstoreLayoutReady={signature,since:performance.now()};return false;}
  return performance.now()-before.since>=200;
 },imageCount,{timeout:30000});}catch(error){
  const observed=await editor.locator('.se-component.se-image img').evaluateAll(ns=>({count:ns.length,pending:ns.flatMap((n,i)=>/^https:\/\//.test(n.src)?[]:[i+1])}));
  const failure=Error('상세이미지 업로드 준비 확인 실패: 예상 '+imageCount+'장 / 현재 '+observed.count+'장 / 업로드 대기 '+(observed.pending.join(',')||'없음')+' · '+error.message);
  if(error.name==='TimeoutError')failure.code='SMARTSTORE_UI_DELAY';
  throw failure;
 }
 const images=editor.locator('.se-component.se-image img');
 const fitIndexes=Array.from({length:imageCount},(_,i)=>i);
 const missing=await images.evaluateAll((ns,fitIndexes)=>ns.flatMap((n,i)=>n.closest('.se-component.se-image')?.querySelector('.se-component-content-'+(fitIndexes.includes(i)?'fit':'extend'))?[]:[i]),fitIndexes);
 if(missing.length)log('최종 반영 전 문서 너비 배치 누락 '+missing.length+'장만 보정 · 파일 재업로드 없음');
 for(const i of missing){check();await applySmartstoreImageLayout(editor,images.nth(i),{check,layout:fitIndexes.includes(i)?'fit':'extend'});}
 const ready=await images.evaluateAll((ns,fitIndexes)=>ns.every((n,i)=>/^https:\/\//.test(n.src)&&n.closest('.se-component.se-image')?.querySelector('.se-component-content-'+(fitIndexes.includes(i)?'fit':'extend'))),fitIndexes);
 if(await images.count()!==imageCount||!ready)throw Error('최종 반영 전 상세이미지 개수·문서 너비을 확인하지 못했습니다. 편집기 내용은 유지했습니다.');
 if(imageLinks.length)await applySmartstoreProductPhotoLinks(editor,imageLinks,{check,log});
 check();if(!applyEditor){log('상세설명 교체 완료 · 편집기 등록 버튼 누르지 않음 · 현재 창에서 직접 확인해 주세요.');return {editorPrepared:true,editorApplied:false,detailUploaded:false,saved:false,published:false};}
 await Promise.all([editor.waitForEvent('close',{timeout:30000}),editor.getByRole('button',{name:'등록',exact:true}).click()]);
 if(await page.locator('textarea[name="editorContent"]').inputValue()!=='true')throw Error('판매자센터 상세설명 반영 결과를 확인하지 못했습니다.');
}
const detailMediaSelector='.se-component.se-image,.se-component.se-video,.se-component.se-oembed';
async function readDetailMedia(editor){
 return editor.locator(detailMediaSelector).evaluateAll(nodes=>nodes.map(node=>{
  if(node.matches('.se-video'))return {type:'video'};
  if(!node.matches('.se-image'))return {type:'unknown'};
  const src=node.querySelector('img')?.src;
  try{
   const u=new URL(src);
   return {type:'image',name:u.protocol==='https:'?decodeURIComponent(u.pathname.split('/').at(-1)):null};
  }catch{return {type:'image',name:null};}
 }));
}
function waitDetailImage(editor,index,file,timeout=60000){
 return editor.waitForFunction(({count,name})=>{
  const images=[...document.querySelectorAll('.se-component.se-image img')],last=images.at(-1);
  if(images.length!==count||!last||!/^https:\/\//.test(last.src))return false;
  try{return decodeURIComponent(new URL(last.src).pathname.split('/').at(-1))===name;}catch{return false;}
 },{count:index+1,name:path.basename(file)},{timeout});
}
async function detailPrefix(editor,tasks,{parts,resume,check}){
 check();
 if(resume?.pendingImage!==undefined){
  const pending=tasks.find(task=>task.type==='image'&&task.index===resume.pendingImage);
  if(!pending)throw Error('이전 상세이미지 첨부 위치가 달라졌습니다.');
  await waitDetailImage(editor,pending.index,pending.file,4000).catch(()=>{throw Error('이전 상세이미지의 첨부 결과를 확인하지 못했습니다. 현재 편집기에 중복 첨부하지 않았습니다.');});
 }
 const media=await readDetailMedia(editor);
 if(media.length<(resume?.confirmedCount||0)||media.length>tasks.length||media.some(({type,name},i)=>type!==tasks[i].type||type==='image'&&name!==path.basename(tasks[i].file)))throw Error('편집기에 남은 이미지·영상의 순서가 다릅니다. 현재 상세를 유지했습니다.');
 const videos=editor.locator('.se-component.se-video');
 if(media.some(x=>x.type==='video')){
  const identity=await nativeVideoIdentity(videos.first());
  const known=resume?.videoIdentity||parts.videoIdentity;
  if(!identity.length||known&&JSON.stringify(identity)!==JSON.stringify(known.identity)||!known&&!resume?.videoSubmitted)throw Error('이전에 올린 영상과 같은지 확인하지 못했습니다. 현재 상세를 유지했습니다.');
  parts.videoIdentity=known||{identity,sha256:parts.video?.sha256,storePlayback:'unverified'};
  if(resume)resume.videoIdentity=parts.videoIdentity;
 }else if(resume?.videoSubmitted)throw Error('이전 동영상 첨부 결과를 확인하지 못했습니다. 첨부 창을 확인해 주세요. 동영상을 다시 올리지 않았습니다.');
 if(resume){delete resume.pendingImage;resume.confirmedCount=media.length;}
 return media.length;
}
export async function uploadSmartstoreDetail(page,parts,{check:checkForm=()=>{},log=()=>{},mode='copy',applyEditor=false,measure=(_,fn)=>fn(),resume}={}){
 const allowed=mode==='edit'?isSmartstoreDetailEditUrl(page.url()):mode==='copy'&&/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/copy\/\d+(?:\?|$)/.test(page.url());
 if(!allowed)throw Error(mode==='edit'?'상세설명만 교체는 조회/수정 화면에서 실행해 주세요.':'상세페이지는 스마트스토어 복사등록 화면에서만 교체합니다.');
 smartstoreMediaOrder(parts); // Validate the sequence before opening the editor.
 const imageLinks=await validateSmartstoreProductPhotoLinks(parts);
 if(imageLinks.length&&applyEditor)throw Error('비교 사진 링크는 등록 전 편집기에서 먼저 확인해 주세요.');
 const tasks=parts.files.flatMap((file,index)=>[{type:'image',index,file},...(parts.includeVideo!==false&&index===(parts.videoAfterIndex??0)?[{type:'video'}]:[])]);
 const check=()=>{checkForm();resume?.binding?.check();};
 const {editor,from}=await measure('editor',async()=>{
  const existing=resume?.binding;
  if(existing)await existing.verify();
  const editor=existing?.page??await openSmartstoreEditor(page,{check});
  if(resume&&!existing)resume.binding=await bindSmartstoreDraft(editor,'html');
  check();await waitForSmartstoreEditorInput(editor,{check});
  if(resume?.cleared||resume?.clearing){
   if(await editor.locator('.se-component.se-text').evaluateAll(nodes=>nodes.some(n=>n.innerText.replace(/[\s\u200b\ufeff]/g,''))))throw Error('편집기에서 추가된 문구를 확인했습니다. 입력된 상세를 그대로 두었습니다.');
   const from=await detailPrefix(editor,tasks,{parts,resume,check});
   if(!resume.cleared&&from)throw Error('기존 상세가 남아 있습니다. 편집기 내용을 확인해 주세요.');
   resume.cleared=true;
   log('이전 편집기 확인 · 첨부가 확인된 '+from+'개 항목 유지');
   return {editor,from};
  }
  if(parts.includeVideo!==false){await requireBrandVideo(parts.dataRoot,parts.videoOptions);await assertNativeVideoToolbar(editor);}
  // Restored ONE documents and the keyboard input buffer initialise asynchronously.
  await editor.waitForFunction(()=>{
   const signature=[...document.querySelectorAll('.se-component')].map(n=>n.id).join('|');
   const state=window.__smartstoreUIReady;
   if(!state||state.signature!==signature){window.__smartstoreUIReady={signature,since:performance.now()};return false;}
   return signature&&performance.now()-state.since>800;
  });
  await focusSmartstoreEditorInput(editor,{check});
  await editor.keyboard.press('Control+A');await editor.evaluate(()=>new Promise(requestAnimationFrame));
  await editor.keyboard.press('Control+A');await editor.evaluate(()=>new Promise(requestAnimationFrame));
  check();if(resume)resume.clearing=true;
  await editor.keyboard.press('Backspace');
  await editor.waitForFunction(()=>document.querySelectorAll('.se-component').length<=1);
  if(await editor.locator(detailMediaSelector).count())throw Error('기존 상세설명이 남아 있어 새 이미지를 올리지 않았습니다.');
  if(resume)resume.cleared=true;
  return {editor,from:0};
 });
 for(const task of tasks.slice(from)){
  if(task.type==='video'){
   await measure('detailVideo',async()=>{
    check();
    if(resume?.videoSubmitted){
     await editor.locator('.se-component.se-video').first().waitFor({state:'attached',timeout:4000})
      .catch(()=>{check();throw Error('동영상 첨부 결과를 확인하지 못했습니다. 같은 파일을 다시 보내지 않았습니다.');});
     await detailPrefix(editor,tasks,{parts,resume,check});
     log('이미 첨부한 영상 확인 · 다시 올리지 않음');
     return;
    }
    await focusSmartstoreEditorInput(editor,{check});
    parts.videoIdentity=await insertSmartstoreVideo(editor,{check,dataRoot:parts.dataRoot,videoOptions:parts.videoOptions,onSubmit:()=>{if(resume)resume.videoSubmitted=true;}});
    if(resume){resume.videoIdentity=parts.videoIdentity;resume.confirmedCount=(resume.confirmedCount||0)+1;}
   });
   continue;
  }
  const {file,index}=task;
  let confirmed=false;
  await measure('detailImage'+(index+1),async()=>{
   check();
   if(confirmed||resume?.pendingImage===index){
    await waitDetailImage(editor,index,file,4000)
     .catch(()=>{check();throw Error('상세이미지 첨부 결과를 확인하지 못했습니다. 같은 파일을 다시 보내지 않았습니다.');});
    log('이미 첨부한 상세이미지 확인 · 다시 올리지 않음');
   }else{
    const empty=editor.locator('.se-component.se-text .se-text-paragraph').filter({visible:true}).last();
    if(await empty.count())await focusSmartstoreEditorInput(editor,{check});
    if(parts.bannerLink?.index===index&&index>0&&await empty.count()&&resume?.bannerSpaced!==true){
     check();await editor.keyboard.press('End');await editor.keyboard.press('Enter');
     if(resume)resume.bannerSpaced=true;
     await editor.evaluate(()=>new Promise(requestAnimationFrame));log('배너 앞 빈 줄 한 칸 분리');
    }
    const photoLink=imageLinks.find(link=>link.index===index);
    if(photoLink)await assertLinkedPhotoBytes(photoLink);
    await attachSmartstorePhoto(editor,file,{check,onSubmit:()=>{if(resume)resume.pendingImage=index;}});
    await waitDetailImage(editor,index,file);
   }
   check();
   if(resume&&!confirmed){delete resume.pendingImage;resume.confirmedCount=(resume.confirmedCount||0)+1;}
   confirmed=true;
   // Preserve ONE's per-image placement before the next insertion. The layout
   // helper already scrolls/selects when necessary; no separate scroll.
   await applySmartstoreImageLayout(editor,editor.locator('.se-component.se-image img').nth(index),{check,layout:smartstorePartLayout(parts,index)});
  });
 }
 return measure('detailFinish',async()=>{
  const count=await detailPrefix(editor,tasks,{parts,resume,check});
  if(count!==tasks.length)throw Error('상세이미지와 영상의 첨부 순서를 확인해 주세요.');
  if(!parts.bannerLinkSubmitted)await applySmartstoreBannerLink(editor,parts,{check,log});
  log('상세이미지 '+parts.files.length+'장 첨부 완료 · 최종 반영 전 확인');
  // Repair only missing layouts, including an image already attached when a prior layout step failed.
  const prepared=await commitSmartstoreEditor(page,editor,parts.files.length,{check,log,applyEditor,bannerIndex:parts.bannerLink?.index,footerIndex:parts.footerIndex,imageLinks});
  if(!applyEditor)return {...prepared,detailParts:parts.files.length,productPhotoLinksVerified:imageLinks.map(link=>link.style),bannerLinkStatus:parts.bannerLinkSubmitted?'submitted-unverified':'unverified',videoUploaded:parts.includeVideo!==false};
  return verifySmartstoreDetail(page,parts,{check:checkForm,log,applyEditor});
 });
}
export async function verifySmartstoreDetail(page,parts,{check=()=>{},log=()=>{},repairAttempt=0,applyEditor=false}={}){
 check();
 const verified=await openSmartstoreEditor(page,{check});
 await verified.locator('.se-component.se-image img').nth(parts.files.length-1).waitFor({state:'visible',timeout:30000});
 const expected=parts.files.map(file=>path.basename(file));
 const images=verified.locator('.se-component.se-image img');
 const pending=await images.evaluateAll(ns=>ns.flatMap((n,i)=>/^https:\/\//.test(n.src)?[]:[i]));
 // Hosted images need no scrolling or repeated per-image browser calls.
 for(const i of pending){check();await images.nth(i).scrollIntoViewIfNeeded();await verified.waitForFunction(i=>/^https:\/\//.test(document.querySelectorAll('.se-component.se-image img')[i]?.src||''),i,{timeout:30000});}
 const snapshot=await images.evaluateAll(ns=>ns.map(n=>({name:decodeURIComponent(new URL(n.src).pathname.split('/').at(-1)),src:n.src,link:n.closest('a')?.href||null,extended:!!n.closest('.se-component.se-image')?.querySelector('.se-component-content-extend'),fitted:!!n.closest('.se-component.se-image')?.querySelector('.se-component-content-fit')})));
 const names=snapshot.map(n=>n.name);
 const includeVideo=parts.includeVideo!==false;
 const videoCount=await verified.locator('.se-component.se-oembed,.se-component.se-video').count();
 const video=includeVideo&&videoCount===1&&await verified.locator('.se-component.se-video').count()===1?await nativeVideoIdentity(verified.locator('.se-component.se-video')):[];
 const leftoverUrl=await verified.locator('.se-component.se-text').evaluateAll(ns=>ns.some(n=>/youtube\.com\/|youtu\.be\//.test(n.innerText)));
 if(leftoverUrl)throw Error('저장된 상세페이지에 영상 주소 문장이 남아 있습니다.');
 const mismatch=[];
 if(JSON.stringify(names)!==JSON.stringify(expected))mismatch.push('이미지 파일명·순서');
 const bannerLinkVerified=!!parts.bannerLink&&snapshot[parts.bannerLink.index]?.link===parts.bannerLink.url;
 const bannerLinkStatus=!parts.bannerLink?'not-applicable':bannerLinkVerified?'verified':parts.bannerLinkSubmitted?'submitted-unverified':'unverified';
 // User confirmed that ONE applies the link even when its bitmap wrapper has
 // no readable href. This observation is recorded, but does not block layout.
 if(snapshot.length!==expected.length||snapshot.some((n,i)=>smartstorePartLayout(parts,i)==='fit'?!n.fitted:!n.extended))mismatch.push('문서 너비 배치');
 if(includeVideo?!video.length||JSON.stringify(video)!==JSON.stringify(parts.videoIdentity?.identity):videoCount!==0)mismatch.push('MP4 영상 식별자');
 const verification={expected,names,images:snapshot,videoCount,videoIdentity:video,expectedVideoIdentity:parts.videoIdentity?.identity,bannerLinkStatus,bannerLinkVerified,mismatch,repairAttempt};
 await writeFile(path.join(path.dirname(parts.files[0]),'detail-verification.json'),JSON.stringify(verification,null,2));
 if(mismatch.length===1&&mismatch[0]==='문서 너비 배치'&&repairAttempt===0){
  log('이미지·영상 일치 · 문서 너비 미반영 '+snapshot.filter(n=>!n.extended).length+'장만 재적용 · 파일 재업로드 없음');
  for(let i=0;i<snapshot.length;i++)if(smartstorePartLayout(parts,i)==='fit'?!snapshot[i].fitted:!snapshot[i].extended){check();await applySmartstoreImageLayout(verified,images.nth(i),{check,layout:smartstorePartLayout(parts,i)});}
  const prepared=await commitSmartstoreEditor(page,verified,expected.length,{check,log,applyEditor,bannerIndex:parts.bannerLink?.index,footerIndex:parts.footerIndex});
  if(!applyEditor)return {...prepared,detailParts:parts.files.length};
  return verifySmartstoreDetail(page,parts,{check,log,repairAttempt:1,applyEditor});
 }
 if(mismatch.length){log('상세 대조 차이: '+mismatch.join(' · '));throw Error('상세페이지 확인 불일치: '+mismatch.join(' · ')+'. 상품은 저장하지 않았습니다.');}
 await verified.close();
 log('상세페이지 이미지 '+parts.files.length+'장 반영 확인 · '+(includeVideo?'공통 MP4 포함 · 판매페이지 자동재생 미검증':'영상 제외'));
 return {detailUploaded:true,bannerLinkVerified,bannerLinkStatus,bannerLinkUrl:parts.bannerLink?.url||null,detailParts:parts.files.length,videoUploaded:includeVideo,videoSha256:parts.videoIdentity?.sha256,videoPlayback:includeVideo?'unverified':null,colorNavigation:false,imageLayout:'fit',footerImageLayout:'fit'};
}
