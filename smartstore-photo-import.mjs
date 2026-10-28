import {excludedPhotoReason} from './smartstore-photo-exclusions.mjs';
import {savePhotoMappings} from './smartstore-photo-mapping-cache.mjs';
import {extractLongMannequinPhotos} from './smartstore-long-photo-import.mjs';
import {createWorker} from 'tesseract.js';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {findPhotos} from './smartstore-photo-files.mjs';
import {imageDownloadFolder} from './desktop-downloads.mjs';
import {assertDetailOnlyProduct,readDetailOnlySellerCode,isSmartstoreDetailEditUrl} from './smartstore-detail-only.mjs';
import {openSmartstoreEditor} from './smartstore-detail-upload.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const safeStyle=style=>{if(!/^\d{6}$/.test(style||''))throw Error('사진을 가져올 품번 6자리를 확인해 주세요.');};

// Read only rendered editor components, including image strips. Never inspect app internals.
export function editorPhotoPositions(colors){
 const compact=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/브리티시/g,'브리티쉬').replace(/[+\/]/g,'+').replace(/(?:STR|ST|스트라이프)$/i,'STR');let color='';const out=[];
 const imgs=[...document.querySelectorAll('.se-component img')];
 for(const c of document.querySelectorAll('.se-component')){
  const text=(c.innerText||'').trim();
  if((out.length>0&&/^상품\s*디테일/.test(text))||/^[◆★☆\s]*상세페이지[◆★☆\s]*$|^PRODUCT DETAIL$|^디테일까지|정품.*출고.*안내|교환.*반품.*안내|교환.*추천방법|교환.*추천\s*방법|매장\s*위치|^상담\s*안내|^배송\s*안내|^매장\s*안내|^SHOP INFORMATION/i.test(text))break;
  if(c.classList.contains('se-text')){
   const matches=colors.filter(v=>compact(v)===compact(text));
   const match=matches.length===1?matches[0]:null;
   if(match)color=match;else if(/^\d{2}\s*[^\d\n]{1,35}$/.test(text))color='';
  }
  if(c.matches('.se-image,.se-imageStrip')&&[...c.querySelectorAll('img')].some(n=>n.naturalWidth>0&&n.naturalHeight>n.naturalWidth*3))break;
  if(!color||!c.matches('.se-image,.se-imageStrip'))continue;
  for(const img of c.querySelectorAll('img'))out.push({index:imgs.indexOf(img),colorHint:color});
 }
 return out;
}
// ONE restores later color headings and image strips after its first image appears.
export async function settledEditorPhotoPositions(editor,colors,{check=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let last='',stable=0;
 for(let i=0;i<40;i++){
  check();const snapshot=await editor.evaluate(()=>({signature:[...document.querySelectorAll('.se-component')].map(c=>c.className+'|'+(c.innerText||'')+'|'+[...c.querySelectorAll('img')].map(n=>n.naturalWidth+'x'+n.naturalHeight).join(',')).join('\n')}));
  if(snapshot.signature===last)stable++;else stable=0;
  last=snapshot.signature;if(stable>=5)return editor.evaluate(editorPhotoPositions,colors);
  await pause(400);
 }
 throw Error('상세설명 색상 구간을 아직 불러오는 중입니다. 사진 수집을 다시 시도해 주세요.');
}
export function naverPhotoUrl(value){
 const u=new URL(value);if(u.protocol==='http:')u.protocol='https:';
 if(u.protocol!=='https:'||u.username||u.password||u.port||!['shop-phinf.pstatic.net','shop1.phinf.naver.net','shop2.phinf.naver.net'].includes(u.hostname))throw Error('네이버 상품사진 원본 주소가 아닙니다.');
 // Preserve the editor URL: never guess an original or a larger image variant.
 return u.href;
}
export function exactSellerRows(rows,style){
 safeStyle(style);return rows.filter(r=>{try{assertDetailOnlyProduct(r.code,style);return true;}catch{return false;}});
}
export async function selectSearchChoice(control){
 if(await control.isChecked())return;
 const label=control.locator('xpath=ancestor::label[1]');
 if(await label.count())await label.click({timeout:5000});else await control.check({timeout:5000});
 if(!await control.isChecked())throw Error('상품조회 검색 조건 선택을 확인하지 못했습니다.');
}
export async function preparePhotoSourceList(list,{check=()=>{},log=()=>{}}={}){
 await list.getByRole('button',{name:'초기화',exact:true}).click({timeout:15000});check();
 await list.getByRole('link',{name:/^판매중\s*\d+건$/}).click();
 await list.getByRole('button',{name:'검색',exact:true}).waitFor({state:'visible'});
 const size=list.locator('.selectize-input').filter({hasText:/개씩/});
 await size.click();check();
 const options=list.locator('.selectize-dropdown .option:visible');
 const fiveHundred=options.getByText('500개씩',{exact:true}),threeHundred=options.getByText('300개씩',{exact:true});
 const count=await fiveHundred.count()?500:300;
 if(count===500)await fiveHundred.click();else await threeHundred.click();
 await list.locator('.selectize-input .item').filter({hasText:new RegExp('^'+count+'개씩$')}).waitFor({state:'visible'});check();
 log('착용사진 가져오기 시작 · 판매중 상품 · '+count+'개씩 표시');
}
export async function findPhotoSourceForm(context,style,{check=()=>{},log=()=>{}}={}){
 safeStyle(style);check();
 const lists=context.pages().filter(p=>!p.isClosed()&&/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/origin-list(?:\?|$)/.test(p.url()));
 if(lists.length>1)throw Error('상품조회 창이 여러 개입니다. 검색할 상품조회 창 하나만 남겨 주세요.');
 if(!lists.length){
  const list=await context.newPage();await list.goto('https://sell.smartstore.naver.com/#/products/origin-list',{waitUntil:'domcontentloaded'});check();lists.push(list);
 }
 if(lists.length){
  const list=lists[0];await list.bringToFront();check();
  try{await preparePhotoSourceList(list,{check,log});}catch{check();throw Error('등록기 전용 크롬에서 스마트스토어 로그인을 완료해 주세요. 현재 로그인 세션을 재사용하며 상품 저장은 하지 않습니다.');}check();
  await selectSearchChoice(list.getByRole('radio',{name:'판매자상품코드',exact:true}));
  await list.getByRole('textbox',{name:'검색어 입력',exact:true}).fill(style);
  const period=list.getByRole('button',{name:'전체',exact:true});if(await period.count()===1)await period.click();
  check();await list.getByRole('button',{name:'검색',exact:true}).click();
  await list.locator('[role="row"][row-id] [col-id="sellerManagementCode"]').filter({hasText:style}).first().waitFor({state:'visible',timeout:20000});check();
  const rows=exactSellerRows(await list.locator('[role="row"][row-id]').evaluateAll(nodes=>nodes.filter(n=>n.querySelector('[col-id="edit"] button')).map(n=>({id:n.getAttribute('row-id'),code:n.querySelector('[col-id="sellerManagementCode"]')?.textContent||''}))),style);
  if(!rows.length)throw Error('판매자 상품코드가 일치하는 상품을 찾지 못했습니다.');
  log('판매자 상품코드 '+style+' 검색 · 일치 '+rows.length+'건 중 첫 상품 한 건만 사진 수집');
  await list.locator('[role="row"][row-id]').filter({has:list.locator('[col-id="sellerManagementCode"]').filter({hasText:rows[0].code.trim()})}).first().getByRole('button',{name:'수정',exact:true}).click();
 }
 // The seller center can reuse its named edit window instead of creating a new popup.
 const deadline=Date.now()+20000;
 do{
  const edits=context.pages().filter(p=>!p.isClosed()&&isSmartstoreDetailEditUrl(p.url()));
  const focused=[];for(const page of edits)if(await page.evaluate(()=>document.hasFocus()).catch(()=>false))focused.push(page);
  check();for(const page of [...focused,...edits.filter(p=>!focused.includes(p))]){
   try{const code=await readDetailOnlySellerCode(page);assertDetailOnlyProduct(code,style);return {page,sellerCode:code};}catch(error){check();}
  }
  if(!lists.length)break;await new Promise(r=>setTimeout(r,250));
 }while(Date.now()<deadline);
 throw Error('같은 판매자 상품코드의 조회/수정 화면을 확인하지 못했습니다.');
}
// Automatic recovery reads the saved source in its own temporary context. This
// avoids ONE's named editor reusing another product's unsaved editor window.
export async function readIsolatedPhotoSource(context,product,{check=()=>{},log=()=>{},readSource=readExistingPhotos}={}){
 check();
 const session=await context.storageState();check();
 const naverHost=host=>host.replace(/^\./,'')==='naver.com'||host.endsWith('.naver.com');
 const storageState={cookies:session.cookies.filter(c=>naverHost(c.domain)),origins:session.origins.filter(o=>naverHost(new URL(o.origin).hostname))};
 const isolated=await context.browser().newContext({storageState});
 try{
  check();log('자동 색상 대조 · 저장된 동일 품번 상품을 별도 읽기 창에서 확인 · 열린 편집 내용 유지');
  const source=await readSource(isolated,product,{check,log});check();return source;
 }finally{await isolated.close();}
}

export async function readExistingPhotos(context,product,{check=()=>{},log=()=>{}}={}){
 const {page,sellerCode}=await findPhotoSourceForm(context,product.style,{check,log});check();
 const formUrl=page.url(),editors=[];
 const openEditors=context.pages().filter(p=>!p.isClosed()&&/^https:\/\/sell\.smartstore\.naver\.com\/#\/editor(?:\?|$)/.test(p.url()));
 for(const p of context.pages())if(!p.isClosed()&&/^https:\/\/sell\.smartstore\.naver\.com\/#\/editor(?:\?|$)/.test(p.url())&&await p.opener()===page)editors.push(p);
 if(!editors.length&&openEditors.length){
  const formUrls=[...new Set(context.pages().filter(p=>!p.isClosed()&&isSmartstoreDetailEditUrl(p.url())).map(p=>p.url()))];
  if(openEditors.length!==1||formUrls.length!==1||formUrls[0]!==formUrl)throw Error('열린 상세 편집기의 상품 연결이 불명확합니다. 현재 상품의 편집기 한 개를 남겨 주세요.');
  editors.push(openEditors[0]);log('현재 열린 상세 편집기 사용 · 부모 창 연결 복구');
 }
 if(editors.length>1)throw Error('이 상품의 상세 편집기가 여러 개입니다. 사용할 편집기 하나만 남겨 주세요.');
 let editor=editors[0]||await openSmartstoreEditor(page,{check}),fresh=null;
 // ONE initially exposes an empty text component while restoring the saved document.
 // Wait for the restored image components before looking for their color headings.
 await editor.locator('.se-component.se-image,.se-component.se-imageStrip').first().waitFor({state:'attached',timeout:20000});
 const readPositions=async()=>{const positions=await settledEditorPhotoPositions(editor,product.colors,{check});const long=await editor.locator('.se-component img').evaluateAll(nodes=>nodes.map((n,index)=>({index,width:n.naturalWidth,height:n.naturalHeight})).filter(n=>!n.width||n.width>=300&&n.height>n.width*3));for(const p of long)if(!positions.some(v=>v.index===p.index))positions.push({index:p.index,longImage:true});return positions;};
 let positions=await readPositions();
 if(!positions.length&&editors.length)throw Error('현재 열린 상세 편집기에서 마네킹 사진을 찾지 못했습니다. 저장된 다른 상세로 대체하지 않았습니다.');
 if(!positions.length){
  // A named edit window may still hold an unsaved replacement. Read the saved
  // product in a fresh window, preserving that existing editor and its contents.
  fresh=await context.newPage();await fresh.goto(formUrl,{waitUntil:'domcontentloaded'});
  await fresh.locator('input[name="product.name"]').waitFor({state:'attached',timeout:20000});check();
  assertDetailOnlyProduct(await readDetailOnlySellerCode(fresh),product.style);
  editor=await openSmartstoreEditor(fresh,{check});
  await editor.locator('.se-component.se-image,.se-component.se-imageStrip').first().waitFor({state:'attached',timeout:20000});
  positions=await readPositions();
 }
 if(!positions.length){if(fresh){await editor.close();await fresh.close();}throw Error('저장된 상세설명에서 색상별 사진이나 긴 상세이미지를 확인하지 못했습니다.');}
 const candidates=[];
 for(const pos of positions){
  check();if(page.url()!==formUrl)throw Error('수집 중 조회/수정 상품이 변경되었습니다.');
  const img=editor.locator('.se-component img').nth(pos.index);await img.scrollIntoViewIfNeeded();
  await editor.waitForFunction(i=>{const n=document.querySelectorAll('.se-component img')[i];return n&&/^https?:/.test(n.src)&&n.complete&&n.naturalWidth>0;},pos.index,{timeout:10000});
  const data=await img.evaluate(n=>({url:n.src,width:n.naturalWidth,height:n.naturalHeight}));
  if(data.width<300||data.height<300||data.height>150000||pos.longImage&&data.height<=data.width*3)continue;
  // A long external store notice can be appended after the product photos.
  // Do not download it or abort the valid Naver photo collection for it.
  let url;
  try{url=naverPhotoUrl(data.url);}catch{
   log('상품사진 제외 · 네이버 원본이 아닌 외부 안내 이미지');continue;
  }
  candidates.push({...pos,...data,url});
 }
 check();assertDetailOnlyProduct(await readDetailOnlySellerCode(page),product.style);
 if(fresh){await editor.close();await fresh.close();}
 return {style:product.style,colors:product.colors,sourceUrl:product.sourceUrl,formUrl,sellerCode,candidates};
}
export async function stageImportedPhotos(source,folder,{fetchImpl=fetch,signal,dataRoot=path.resolve(folder,'..'),recognizePhoto}={}){
 safeStyle(source.style);assertDetailOnlyProduct(source.sellerCode,source.style);
 const dir=path.join(folder,'smartstore-photo-import');await mkdir(dir,{recursive:true});const candidates=[],seen=new Set();
 for(const item of source.candidates){
  signal?.throwIfAborted();const url=naverPhotoUrl(item.url);
  const response=await fetchImpl(url,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
  if(!response.ok||!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('기존 상품의 사진 파일을 가져오지 못했습니다.');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>19000000)throw Error('가져올 사진이 19MB를 초과합니다.');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
  const meta=await sharp(bytes,{limitInputPixels:150000000}).metadata();if(!['jpeg','png','webp'].includes(meta.format)||meta.width<300||meta.height<300)continue;
  const pieces=meta.height>meta.width*3?await extractLongMannequinPhotos(bytes,{style:source.style,colors:source.colors||[],dataRoot,check:()=>signal?.throwIfAborted()}):[{bytes,colorHint:item.colorHint}];
  for(const piece of pieces){
  const photo=piece.bytes,photoMeta=await sharp(photo).metadata();
  let recognize=recognizePhoto;
  if(!recognize&&!piece.extractedFromLong&&source.candidates.slice(-4).includes(item))recognize=async b=>{const worker=await createWorker('kor+eng');try{return (await worker.recognize(await sharp(b).resize({width:1000,withoutEnlargement:true}).toBuffer())).data.text;}finally{await worker.terminate();}};
  const excluded=await excludedPhotoReason(photo,{dataRoot,recognize});if(excluded)continue;
  const sha256=hash(photo),id=sha256.slice(0,24);if(seen.has(id))continue;seen.add(id);
  const file=id+({jpeg:'.jpg',png:'.png',webp:'.webp'})[photoMeta.format];await writeFile(path.join(dir,file),photo);
  candidates.push({id,file,sha256,url,colorHint:piece.colorHint,width:photoMeta.width,height:photoMeta.height,...(piece.extractedFromLong?{extractedFromLong:true,sourceRectangle:piece.sourceRectangle,layoutHash:piece.layoutHash}:{})});
  }
 }
 if(!candidates.length)throw Error('수집할 마네킹 사진을 확인하지 못했습니다. 긴 상세의 제작 자료와 사진 위치가 일치하는지 확인해 주세요.');
 const result={...source,candidates,createdAt:new Date().toISOString(),status:'review'};await writeFile(path.join(dir,'manifest.json'),JSON.stringify(result,null,2));return result;
}
export async function applyImportedPhotos(product,folder,choices,{dataRoot,desktop,signal,automatic=false}={}){
 const stage=JSON.parse(await readFile(path.join(folder,'smartstore-photo-import/manifest.json'),'utf8'));
 if(stage.style!==product.style||stage.sourceUrl!==product.sourceUrl)throw Error('사진을 수집한 품번·공식 출처와 현재 상품이 다릅니다.');
 assertDetailOnlyProduct(stage.sellerCode,product.style);
 if(!Array.isArray(choices)||!choices.length||new Set(choices.map(c=>c.id)).size!==choices.length)throw Error('적용할 사진을 한 장 이상 선택해 주세요.');
 const selected=[];for(const choice of choices){
  const source=stage.candidates.find(c=>c.id===choice.id);if(!source||!product.colors.includes(choice.color)||!['front','side','back','detail'].includes(choice.role))throw Error('선택한 사진의 색상과 정면·측면·뒷면·디테일을 확인해 주세요.');
  if(!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(source.file))throw Error('수집 사진 경로가 올바르지 않습니다.');
  const bytes=await readFile(path.join(folder,'smartstore-photo-import',source.file));if(hash(bytes)!==source.sha256)throw Error('수집 후 사진 원본이 변경되었습니다.');selected.push({...choice,...source,bytes});
 }
 // Validate the entire batch before touching the style folder. Existing photos are never overwritten.
 desktop||=path.dirname(await imageDownloadFolder());const target=path.join(desktop,'상품등록기사진폴더',product.style);await mkdir(target,{recursive:true});
 const originals=await findPhotos(product,{desktop});let hasMain=originals.some(p=>/^1(?:번)?\.(jpe?g|png|webp)$/i.test(p.name));
 if(!automatic&&!hasMain&&!selected.some(p=>p.role==='front'))throw Error('대표사진이 없으므로 정면 사진을 한 장 선택해 주세요.');
 const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(root,{recursive:true});let old;
 try{old=JSON.parse(await readFile(path.join(root,'draft.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(old&&(old.style!==product.style||old.sourceUrl!==product.sourceUrl))throw Error('기존 사진 매칭 자료의 품번·출처를 다시 확인해 주세요.');
 const records=[...(old?.photoMapping?.files||[])];let count=0,importedMainPhoto=old?.importedMainPhoto;
 const main=originals.find(p=>/^1(?:번)?\.(jpe?g|png|webp)$/i.test(p.name));
 signal?.throwIfAborted();
 if(automatic&&main&&importedMainPhoto?.version===1&&importedMainPhoto.style===product.style&&importedMainPhoto.sourceUrl===product.sourceUrl&&importedMainPhoto.name===main.name&&importedMainPhoto.hash===hash(main.bytes)&&!selected.some(p=>p.sha256===importedMainPhoto.hash)){
  // Replace only a main image created by this importer and still byte-identical.
  // User-supplied/modified 1.jpg files have no matching ownership record.
  const next=selected[0],name='1'+path.extname(next.file),destination=path.join(target,name),archive=path.join(root,'imported-originals',importedMainPhoto.hash+path.extname(main.name));
  if(hash(await readFile(main.file))!==importedMainPhoto.hash)throw Error('대표사진이 변경되어 자동 교체하지 않았습니다.');
  if(destination!==main.file&&originals.some(p=>p.file===destination))throw Error('대표 1번 사진이 여러 개여서 자동 교체하지 않았습니다.');
  await mkdir(path.dirname(archive),{recursive:true});await writeFile(archive,main.bytes,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST'||hash(await readFile(archive))!==importedMainPhoto.hash)throw e;});
  signal?.throwIfAborted();const temporary=destination+'.import-tmp';await writeFile(temporary,next.bytes);await rename(temporary,destination);if(destination!==main.file)await unlink(main.file);
  originals.splice(originals.indexOf(main),1);originals.unshift({name,file:destination,bytes:next.bytes,id:next.id});
  importedMainPhoto={version:1,style:product.style,sourceUrl:product.sourceUrl,name,hash:next.sha256};count++;
 }
 for(const p of selected){
  signal?.throwIfAborted();const known=originals.find(f=>hash(f.bytes)===p.sha256);let name=known?.name;
  if(!name){name=!hasMain&&(automatic||p.role==='front')?'1'+path.extname(p.file):'기존상품_'+p.color.slice(0,2)+'_'+p.id+path.extname(p.file);await writeFile(path.join(target,name),p.bytes,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST'||hash(await readFile(path.join(target,name)))!==p.sha256)throw e;});if(/^1\./.test(name)){hasMain=true;importedMainPhoto={version:1,style:product.style,sourceUrl:product.sourceUrl,name,hash:p.sha256};}count++;}
  const record={name,hash:p.sha256,color:p.color,role:p.role,source:'seller-detail',sourceUrl:p.url};const i=records.findIndex(r=>r.hash===p.sha256);if(i>=0)records[i]=record;else records.push(record);
 }
 const importedColorPhotos=[];for(const p of selected){let group=importedColorPhotos.find(g=>g.color===p.color);if(!group){group={color:p.color,hashes:[]};importedColorPhotos.push(group);}group.hashes.push(p.sha256);}
 const draft={...old,style:product.style,sourceUrl:product.sourceUrl,importedMainPhoto,importedColorPhotos,photoMapping:{...old?.photoMapping,files:records}};
 await writeFile(path.join(root,'draft.json.tmp'),JSON.stringify(draft,null,2));await rename(path.join(root,'draft.json.tmp'),path.join(root,'draft.json'));
 await savePhotoMappings(dataRoot,product,records);
 return {count,selectedCount:selected.length,target};
}

export function allImportedPhotoChoices(stage,product,known=[],ignored=[]){
 if(stage.style!==product.style||stage.sourceUrl!==product.sourceUrl)throw Error('현재 품번과 사진 출처가 다릅니다.');
 assertDetailOnlyProduct(stage.sellerCode,product.style);const counts=new Map();
 return stage.candidates.filter(p=>!ignored.some(record=>record.hash===p.sha256)).map(p=>{
  if(!product.colors.includes(p.colorHint))throw Error('사진 위 색상명이 현재 상품 색상과 다릅니다.');
  counts.set(p.colorHint,(counts.get(p.colorHint)||0)+1);if(counts.get(p.colorHint)>4)throw Error(p.colorHint+' 사진이 4컷을 초과합니다. 색상 구간을 확인해 주세요.');
  const prior=known.find(k=>k.hash===p.sha256&&k.color===p.colorHint&&['front','side','back','detail'].includes(k.role));
  // Source order is enough for the detail template, but never invent a front/side angle.
  return {id:p.id,color:p.colorHint,role:prior?.role||'detail'};
 });
}

export function assertImportedPhotoCoverage(stage,prepared,choices,{requireSellingPoints=true}={}){
 const expected=new Map(),selected=new Map();for(const p of stage.candidates.filter(p=>!choices||choices.some(c=>c.id===p.id))){const color=choices?.find(c=>c.id===p.id)?.color||p.colorHint;expected.set(color,(expected.get(color)||0)+1);if(p.sha256){if(!selected.has(color))selected.set(color,[]);selected.get(color).push(p.sha256);}}
 for(const [color,count] of expected){
  const actual=prepared.smartstoreDetail?.storeColorPhotoCounts?.[color]??prepared.smartstoreDetail?.colorImages?.[color]?.length??0;
  if(actual!==count)throw Error(color+' 사진 반영 수가 수집 결과와 다릅니다. (수집 '+count+'장 · 반영 '+actual+'장)');
  const hashes=prepared.smartstoreDetail?.storeColorPhotoHashes?.[color],wanted=selected.get(color);
  if(hashes&&wanted&&(hashes.length!==wanted.length||hashes.some((hash,i)=>hash!==wanted[i])))throw Error(color+' 사진 원본·순서가 최신 수집 결과와 다릅니다.');
 }
 for(const [color,count] of Object.entries(prepared.smartstoreDetail?.storeColorPhotoCounts||{}))if(count&&!expected.has(color))throw Error(color+' 사진이 최신 수집 선택에 없습니다. 이전 사진이 남았는지 확인해 주세요.');
 if(requireSellingPoints&&!prepared.smartstoreDetail?.sellingPoints?.length)throw Error(prepared.smartstoreDetail?.sellingPointReview?.message||'공식 원문 소구점 확인이 필요합니다. 소구점 없는 상세페이지는 완료 처리하지 않습니다.');
}
