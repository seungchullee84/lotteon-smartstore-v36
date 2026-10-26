import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';import {chromium} from 'playwright';
import {registerLongPhotoLayout,extractLongMannequinPhotos,mannequinPhotoRegions} from '../smartstore-long-photo-import.mjs';
import {stageImportedPhotos,allImportedPhotoChoices} from '../smartstore-photo-import.mjs';
import {BRAND_VIDEO_HEADING_HEIGHT} from '../smartstore-brand-video.mjs';
import {ocrPhotoSections,detectLongPhotoRegions} from '../smartstore-long-photo-detect.mjs';

test('제작 기록이 없는 구형 긴 상세도 매장 구간·색상명·사진 경계로 분리한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'long-ocr-'));try{
 const colors=['01다크브라운','02카멜'];const lines=[['STYLE 076931',30,40,20],['01다크브라운',30,200,30],['02카멜',450,200,30],['매장 마네킹 실제 착용사진',230,500,30],['COLOR 01',30,580,12],['01다크브라운',30,620,36],['DETAIL',450,1330,16],['COLOR 02',30,1580,12],['027+',30,1620,36],['DETAIL',450,2330,16],['MATERIAL & SIZE',30,2500,16]];
 const tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'+lines.map(([text,left,top,height],i)=>[5,1,1,1,i+1,1,left,top,300,height,96,text].join('\t')).join('\n');
 const rects=[{left:30,top:700,width:400,height:534},{left:438,top:700,width:390,height:260},{left:438,top:968,width:390,height:260},{left:30,top:1700,width:400,height:534},{left:438,top:1700,width:390,height:260},{left:438,top:1968,width:390,height:260}];
 const layers=await Promise.all(rects.map(async(r,i)=>({input:await sharp({create:{width:r.width,height:r.height,channels:3,background:i<3?'#5c4530':'#a48b50'}}).png().toBuffer(),left:r.left,top:r.top})));
 // Large palette and official photos must not become additional candidates.
 layers.push({input:await sharp({create:{width:800,height:400,channels:3,background:'#7799aa'}}).png().toBuffer(),left:30,top:2700});
 const bytes=await sharp({create:{width:860,height:3600,channels:3,background:'#fff'}}).composite(layers).png().toBuffer();
 const options={style:'076931',colors,recognize:async()=>({tsv})};const regions=await detectLongPhotoRegions(bytes,options);assert.equal(regions.length,6);assert.deepEqual(regions.map(r=>r.color),[...Array(3).fill(colors[0]),...Array(3).fill(colors[1])]);
 assert.deepEqual(regions.map(({color,...r})=>r),rects);
 const crops=await extractLongMannequinPhotos(bytes,{...options,dataRoot:root,backfill:false});assert.equal(crops.length,6);
 assert.equal(ocrPhotoSections(tsv,{...options,style:'076930',width:860,height:3600}).length,0);
 assert.equal(ocrPhotoSections(tsv.replace('매장 마네킹 실제 착용사진','공식 상품 사진'),{...options,width:860,height:3600}).length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('긴 상세와 업로드용 분할 이미지에서 확인된 색상별 사진만 분리하고 재압축도 대조한다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'long-photos-'));try{
 const regions=[{color:'01화이트',left:0,top:1100,width:428,height:500},{color:'01화이트',left:432,top:1100,width:428,height:500},{color:'02블랙',left:0,top:1900,width:428,height:500},{color:'02블랙',left:432,top:1900,width:428,height:500}];
 const layers=await Promise.all(regions.map(async(r,i)=>({input:await sharp({create:{width:r.width,height:r.height,channels:3,background:['#acaab1','#ae875a','#202838','#35372d'][i]}}).png().toBuffer(),left:r.left,top:r.top})));
 const bytes=await sharp({create:{width:860,height:3600,channels:3,background:'#fff'}}).composite(layers).png().toBuffer();
 const brandIntroHeight=700,officialTop=2800,style='326924',colors=['01화이트','02블랙'];
 await registerLongPhotoLayout(bytes,{style,regions,brandIntroHeight,officialTop,dataRoot});
 const options={style,colors,dataRoot,backfill:false,detect:false};const crops=await extractLongMannequinPhotos(bytes,options);assert.equal(crops.length,4);assert.deepEqual(crops.map(c=>c.colorHint),['01화이트','01화이트','02블랙','02블랙']);
 for(let i=0;i<4;i++){const {left,top,width,height}=regions[i];const expected=await sharp(bytes).extract({left,top,width,height}).png().toBuffer();assert.deepEqual(crops[i].bytes,expected);}
 const first=brandIntroHeight+BRAND_VIDEO_HEADING_HEIGHT;
 const part=await sharp(bytes).extract({left:0,top:first,width:860,height:officialTop-first}).png().toBuffer();assert.equal((await extractLongMannequinPhotos(part,options)).length,4);
 const jpg=await sharp(bytes).jpeg({quality:94}).toBuffer();assert.equal((await extractLongMannequinPhotos(jpg,options)).length,4);
 const resized=await sharp(bytes).resize({width:750}).jpeg({quality:92}).toBuffer();assert.equal((await extractLongMannequinPhotos(resized,options)).length,4);
 assert.equal((await extractLongMannequinPhotos(bytes,{...options,style:'326925'})).length,0);assert.equal((await extractLongMannequinPhotos(bytes,{...options,colors:['99레드']})).length,0);
 const changed=await sharp(bytes).composite([{input:await sharp({create:{width:428,height:500,channels:3,background:'#e00000'}}).png().toBuffer(),left:0,top:1100}]).png().toBuffer();assert.equal((await extractLongMannequinPhotos(changed,options)).length,0);
 const source={style,colors,sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=1',sellerCode:style,candidates:[{url:'https://shop-phinf.pstatic.net/long.png'}]};
 const stage=await stageImportedPhotos(source,path.join(dataRoot,'collected'),{dataRoot,recognizePhoto:async()=>'',fetchImpl:async()=>new Response(bytes,{headers:{'Content-Type':'image/png'}})});assert.equal(stage.candidates.length,4);assert(stage.candidates.every(c=>c.extractedFromLong));assert.equal(allImportedPhotoChoices(stage,{style,colors,sourceUrl:source.sourceUrl}).length,4);
 const photo=stage.candidates[0];const m=await sharp(await readFile(path.join(dataRoot,'collected/smartstore-photo-import',photo.file))).metadata();assert.equal(m.width,428);assert.equal(m.height,500);
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
test('위치 기록은 색상 착용사진만 포함하고 팔레트·브랜드·공식 보완사진·안내는 제외한다',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:860,height:1200}});await page.setContent('<img width="860" height="600"><section data-color-palette><img width="100" height="100"></section><section id="smartstore-color-0"><h2>01화이트</h2><img width="400" height="500"><img width="400" height="500"></section><section id="smartstore-color-1"><h2>02블랙</h2><p>지오다노 공식 상품 사진</p><img width="400" height="500"></section><section data-official-detail><img width="860" height="3000"></section>');const regions=await page.evaluate(mannequinPhotoRegions);assert.equal(regions.length,2);assert(regions.every(r=>r.color==='01화이트'&&r.width===400&&r.height===500));}finally{await browser.close();}
});
