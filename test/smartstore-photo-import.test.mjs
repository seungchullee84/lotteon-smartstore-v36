import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,readdir,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';import {chromium} from 'playwright';
import {editorPhotoPositions,naverPhotoUrl,exactSellerRows,stageImportedPhotos,applyImportedPhotos,allImportedPhotoChoices,selectSearchChoice} from '../smartstore-photo-import.mjs';
import {prepareTrustedFolder} from '../smartstore-folder-trust.mjs';
import {findPhotos} from '../smartstore-photo-files.mjs';
test('판매자 코드 숫자를 정확히 대조하고 같은 코드 중 하나만 선택할 수 있다',()=>{
 const rows=[{code:'326922 설명A'},{code:'326922 설명B'},{code:'1326922'},{code:'326923'},{code:'326922 356954'}];assert.deepEqual(exactSellerRows(rows,'326922'),rows.slice(0,2));
 for(const u of ['https://evil.test/a.jpg','http://127.0.0.1/a.jpg','https://shop-phinf.pstatic.net@evil.test/a'])assert.throws(()=>naverPhotoUrl(u));
 assert.equal(naverPhotoUrl('http://shop1.phinf.naver.net/a.jpg?type=w860'),'https://shop1.phinf.naver.net/a.jpg?type=w860');
});
test('색상 아래 1~3컷은 선택 단계 없이 전부 연결하며 미확인 각도는 정면으로 추정하지 않는다',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'import-auto-'));try{
 const folder=path.join(dir,'collected'),dataRoot=path.join(dir,'data'),desktop=path.join(dir,'desktop');await mkdir(folder,{recursive:true});
 const product={style:'326922',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=1',colors:['01화이트','03블랙'],images:{},sizes:['S'],name:'여성 터틀넥 티셔츠 326922',material:'면 60%'};
 const candidates=[];for(const color of product.colors)for(let i=0;i<3;i++)candidates.push({colorHint:color,url:'https://shop-phinf.pstatic.net/'+candidates.length+'.jpg'});
 const buffers=await Promise.all(candidates.map((_,i)=>sharp({create:{width:750,height:1000,channels:3,background:{r:i*30,g:70,b:120}}}).jpeg().toBuffer()));
 const stage=await stageImportedPhotos({...product,sellerCode:'326922',candidates},folder,{fetchImpl:async url=>new Response(buffers[Number(new URL(url).pathname.slice(1,-4))],{headers:{'Content-Type':'image/jpeg'}})});
 const choices=allImportedPhotoChoices(stage,product);assert.equal(choices.length,6);assert(choices.every(p=>p.role==='detail'));
 await applyImportedPhotos(product,folder,choices,{dataRoot,desktop,automatic:true});
 const draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details/326922/draft.json'),'utf8'));
 const photos=await findPhotos(product,{desktop});const mapped=photos.map(p=>({...p,...draft.photoMapping.files.find(r=>r.name===p.name)}));
 const prepared=await prepareTrustedFolder(product,folder,{dataRoot,photos,mapped,old:draft,description:'공식 터틀넥 설명',detailHash:null,recognizePhoto:()=>assert.fail('확인된 사진 OCR 불필요')});
 assert.equal(prepared.smartstoreDetail.photoCount,6);const saved=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details/326922/draft.json'),'utf8'));
 for(const group of saved.photos){const expected=draft.importedColorPhotos.find(g=>g.color===group.color).hashes;assert.deepEqual(group.files.map(p=>path.basename(p).slice(0,64)),expected);}
 assert.equal(allImportedPhotoChoices(stage,product,[{hash:stage.candidates[0].sha256,color:'01화이트',role:'front'}])[0].role,'front');
 assert.throws(()=>allImportedPhotoChoices({...stage,candidates:[...stage.candidates,stage.candidates[0]]},product),/3컷/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('색상 제목 아래 단독·묶음 사진만 읽고 공식 상세 이후와 다른 색상은 제외한다',async()=>{
 const browser=await chromium.launch({headless:true});try{const p=await browser.newPage();await p.setContent('<div class="se-component se-text">01화이트</div><div class="se-component se-image"><img></div><div class="se-component se-imageStrip"><img><img></div><div class="se-component se-text">99다른색</div><div class="se-component se-image"><img></div><div class="se-component se-text">03블랙</div><div class="se-component se-image"><img></div><div class="se-component se-text">◆상세페이지◆</div><div class="se-component se-image"><img></div>');assert.deepEqual(await p.evaluate(editorPhotoPositions,['01화이트','03블랙']),[{index:0,colorHint:'01화이트'},{index:1,colorHint:'01화이트'},{index:2,colorHint:'01화이트'},{index:4,colorHint:'03블랙'}]);}finally{await browser.close();}
});
test('HTML 응답은 거부하고 원본 바이트 중복을 제거하며 선택 사진만 품번 폴더와 매칭 자료에 반영한다',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'import-photos-'));try{
 const folder=path.join(dir,'collected'),dataRoot=path.join(dir,'data'),desktop=path.join(dir,'desktop');await mkdir(folder,{recursive:true});
 const product={style:'326922',sourceUrl:'https://www.giordano.co.kr/shop/view.php?index_no=1',colors:['01화이트','03블랙']};
 const bytes=await sharp({create:{width:750,height:1000,channels:3,background:'#eee'}}).jpeg().toBuffer(),url='https://shop-phinf.pstatic.net/a.jpg';
 const source={...product,sellerCode:'326922 시스루 터틀넥',candidates:[{url,colorHint:'01화이트'},{url,colorHint:'03블랙'}]};
 await assert.rejects(stageImportedPhotos(source,folder,{fetchImpl:async()=>new Response('<html>',{headers:{'Content-Type':'text/html'}})}),/사진 파일/);
 const stage=await stageImportedPhotos(source,folder,{fetchImpl:async()=>new Response(bytes,{headers:{'Content-Type':'image/jpeg'}})});assert.equal(stage.candidates.length,1);
 const c=stage.candidates[0];assert.deepEqual(await readFile(path.join(folder,'smartstore-photo-import',c.file)),bytes);
 await assert.rejects(applyImportedPhotos({...product,style:'326923'},folder,[{id:c.id,color:'01화이트',role:'front'}],{dataRoot,desktop}),/품번/);
 await assert.rejects(applyImportedPhotos(product,folder,[{id:c.id,color:'01화이트',role:''}],{dataRoot,desktop}),/각도|정면/);
 const choices=[{id:c.id,color:'01화이트',role:'front'}];await applyImportedPhotos(product,folder,choices,{dataRoot,desktop});await applyImportedPhotos(product,folder,choices,{dataRoot,desktop});
 const target=path.join(desktop,'상품등록기사진폴더/326922');assert.deepEqual(await readdir(target),['1.jpg']);assert.deepEqual(await readFile(path.join(target,'1.jpg')),bytes);
 const draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details/326922/draft.json'),'utf8'));assert.equal(draft.photoMapping.files.length,1);assert.equal(draft.photoMapping.files[0].role,'front');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('검색 라디오·체크박스 위의 표시 라벨을 눌러 네이티브 입력 가림을 피한다',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage();await p.setContent('<label style="display:block;position:relative;width:200px;height:40px"><input aria-label="판매자상품코드" type="radio" name="type"><span style="position:absolute;inset:0;background:#fff">판매자상품코드</span></label><label style="display:block;position:relative;width:200px;height:40px"><input aria-label="전체" type="checkbox"><span style="position:absolute;inset:0;background:#fff">전체</span></label>');for(const role of ['radio','checkbox']){const input=p.getByRole(role);await selectSearchChoice(input);assert(await input.isChecked());await selectSearchChoice(input);assert(await input.isChecked());}}finally{await b.close();}
});
