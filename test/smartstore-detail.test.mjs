import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {buildSmartstoreDetail,productSellingPoints} from '../smartstore-detail.mjs';
import {prepareSmartstoreDetail,saveSmartstoreDetail,localSmartstorePreview} from '../smartstore-detail-files.mjs';
import {buildDetailContent} from '../detail-html.mjs';
import {smartstorePlan} from '../smartstore-form.mjs';
import {publishable} from '../github-sync.mjs';
import {prepareVideo,videoOptions,fixtureVideo} from './helpers/brand-video.mjs';
const product={style:'375908',name:'여성 경량 패딩 자켓 375908',rawName:'여성 경량 패딩 자켓',gender:'여성',colors:['01핑크','02화이트'],sizes:['S','M'],material:'나일론100%',country:'미얀마',washing:'손세탁',manufactured:'2025-08',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=sample',originalDetailUrl:'https://www.giordano.co.kr/detail.jpg',images:{detail:'https://www.giordano.co.kr/detail.jpg',size:'https://www.giordano.co.kr/size.jpg',info:'https://www.giordano.co.kr/info.jpg'}};

test('새 공통 MP4는 과거 시즌 제외 상품을 포함해 전체에 적용한다',()=>{
 const p={...product,smartstoreDetail:{style:product.style,includeBrandVideo:false}};
 assert.doesNotMatch(buildSmartstoreDetail(p).html,/youtube|<iframe|2026 F\/W FILM/);
 assert.match(buildSmartstoreDetail(p).html,/brand-intro\.jpg|PRODUCT DETAIL/);
 assert.match(buildSmartstoreDetail(p).html,/<video /);
 assert.match(buildSmartstoreDetail(product).html,/smartstore-brand-video\.mp4/);
 assert.doesNotMatch(buildSmartstoreDetail(p,{includeVideo:false}).html,/<video/);
});
test('스마트스토어에만 확정 템플릿·영상·공식 원본·INFORMATION 뒤 혜택 적용',()=>{
 const approved=buildSmartstoreDetail(product).html;assert.ok(approved.indexOf('data-store-banner')<approved.indexOf('data-store-footer'));assert.match(approved,/store-discovery-women(?:-[2-4])?\.jpg/);assert.equal(approved.includes('href="https://shopping.naver.com'),false);const lotte=buildDetailContent(product.images,product.colors,{},product.originalDetailUrl).html;
 assert.match(smartstorePlan(product,50000).html,/data-smartstore-template=/);
 assert.doesNotMatch(lotte,/smartstore-template|youtube|benefits/);
 assert.ok(approved.indexOf('brand-intro.jpg')<approved.indexOf('<video '));
 assert.ok(approved.indexOf('/info.jpg')<approved.indexOf('benefits.jpg'));
 assert.match(approved,/controls autoplay muted loop playsinline/);assert.doesNotMatch(approved,/youtube|클릭하면 해당 색상|href="#smartstore-color-/);assert.doesNotMatch(approved,/26920|모달|기모|CARE GUIDE/);
 assert.deepEqual(productSellingPoints(product),[]);assert.equal(productSellingPoints({...product,officialDescription:'가벼운 원단을 사용한 경량 패딩 상품입니다.'})[0].evidence,'가벼운 원단을 사용한 경량 패딩 상품입니다.');
 assert.equal((approved.match(/\/detail.jpg/g)||[]).length,1);
 assert.throws(()=>buildSmartstoreDetail({...product,images:{main:'https://www.giordano.co.kr/main.jpg'}}),/중단/);
});
test('색상별 사진은 현재 상품 순서·원본 크기 유지, 중복 삽입과 HTML 주입 방지',()=>{
 const p={...product,originalDetailUrl:null,images:{main:'https://www.giordano.co.kr/main.jpg',info:product.images.info},colorImages:{'02화이트':['https://www.giordano.co.kr/w.jpg'],'01핑크':['https://www.giordano.co.kr/p1.jpg','https://www.giordano.co.kr/p2.jpg']},name:'<script>bad()</script>',smartstoreDetail:undefined};
 const html=buildSmartstoreDetail(p).html;
 assert.ok(html.indexOf('01핑크')<html.indexOf('02화이트'));assert.equal((html.match(/p2.jpg/g)||[]).length,1);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.throws(()=>buildSmartstoreDetail({...p,smartstoreDetail:{style:'111111'}}),/다른 품번/);
 assert.equal(p.name,'<script>bad()</script>');
});
test('공통 템플릿 파일만 동기화하고 마네킨 컷과 상품 초안은 GitHub에서 제외',()=>{
 assert.equal(publishable('public/smartstore-template/benefits.jpg'),true);assert.equal(publishable('public/smartstore-template/GowunDodum-Regular.ttf'),true);
 for(const file of ['public/smartstore-template/product.jpg','data/smartstore-details/375908/draft.json','data/375908/smartstore-photo-test.jpg'])assert.equal(publishable(file),false,file);
});
test('다른 품번·색상·외부 경로는 차단하고 사진 매핑과 상품별 소구점으로 저장',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-template-'));const folder=path.join(root,'product'),dataRoot=path.join(root,'data'),draftRoot=path.join(dataRoot,'smartstore-details',product.style);
 try{
  await mkdir(folder,{recursive:true});await mkdir(draftRoot,{recursive:true});await prepareVideo(dataRoot);
  for(const key of ['detail','size','info'])await sharp({create:{width:120,height:key==='detail'?300:100,channels:3,background:key==='detail'?'#ac3c56':'white'}}).jpeg().toFile(path.join(folder,key+'.jpg'));
  await sharp({create:{width:300,height:400,channels:3,background:'pink'}}).jpeg().toFile(path.join(draftRoot,'front.jpg'));
  const draft={style:product.style,sourceUrl:product.sourceUrl,photos:[{color:'01핑크',files:['front.jpg']}],sellingPoints:[{title:'경량 패딩',description:'공식 상품명에 확인된 경량 패딩',evidence:'공식 상품명'}]};
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,style:'000000'}));await assert.rejects(prepareSmartstoreDetail(product,folder,{dataRoot}),/품번/);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,photos:[{color:'다른색상',files:['front.jpg']}]}));await assert.rejects(prepareSmartstoreDetail(product,folder,{dataRoot}),/없는 색상/);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,photos:[{color:'01핑크',files:['../outside.jpg']}]}));await assert.rejects(prepareSmartstoreDetail(product,folder,{dataRoot}),/폴더 안/);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify(draft));
  const p=await prepareSmartstoreDetail(product,folder,{dataRoot});assert.equal(p.smartstoreDetail.photoCount,1);assert.equal(p.smartstoreDetail.sellingPoints[0].title,'경량 패딩');
  assert.match(localSmartstorePreview(p).html,/smartstore-photo\/[a-f0-9]{24}/);assert.doesNotMatch(localSmartstorePreview(p).html,/기모/);
  const out=path.join(root,'detail.png');const result=await saveSmartstoreDetail(product,folder,out,{dataRoot,videoOptions});
  const meta=await sharp(out,{limitInputPixels:false}).metadata();assert.equal(meta.width,860);assert.ok(meta.height>4000);assert.equal(result.photoCount,1);
  assert.ok(Number.isInteger(result.bannerTop));assert.ok(result.bannerTop<result.footerTop);assert.equal((await sharp(result.bannerPath).metadata()).height,result.footerTop-result.bannerTop);assert.ok(Number.isInteger(result.footerTop));assert.equal((await sharp(result.footerPath).metadata()).height,result.height-result.footerTop);
  assert.deepEqual(await sharp(result.footerPath).raw().toBuffer(),await sharp(out,{limitInputPixels:false}).extract({left:0,top:result.footerTop,width:860,height:result.height-result.footerTop}).raw().toBuffer());
  assert.match(await readFile(result.htmlPath,'utf8'),/data:image\/jpeg;base64,/);assert.deepEqual(await readFile(result.videoPath),fixtureVideo);
  assert.match(await readFile(result.htmlPath,'utf8'),/detail_%EB%B8%8C%EB%9E%9C%EB%93%9C%EC%98%81%EC%83%81\.mp4/);
  assert.equal(result.storeVideoPlayback,'unverified');
  assert.ok(result.points.every(p=>!/모달|기모/.test(p.title+p.description)));
  const repeated=await saveSmartstoreDetail(product,folder,path.join(root,'repeated.png'),{dataRoot,videoOptions});
  assert.equal(result.renderCacheHit,false);assert.equal(repeated.renderCacheHit,true);assert.equal(repeated.footerTop,result.footerTop);
  assert.deepEqual(await readFile(out),await readFile(path.join(root,'repeated.png')));
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,headline:'변경한 상품 소개'}));
  const changed=await saveSmartstoreDetail(product,folder,path.join(root,'changed.png'),{dataRoot,videoOptions});assert.equal(changed.renderCacheHit,false);
  assert.notDeepEqual(await readFile(out),await readFile(path.join(root,'changed.png')));
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,includeBrandVideo:false}));
  const withoutVideo=await prepareSmartstoreDetail(product,folder,{dataRoot});
  assert.equal(withoutVideo.smartstoreDetail.includeBrandVideo,true);
  assert.doesNotMatch(localSmartstorePreview(withoutVideo).html,/youtube|<iframe|2026 F\/W FILM/);
  const noVideoResult=await saveSmartstoreDetail(product,folder,path.join(root,'no-season-video.png'),{dataRoot,videoOptions});
  assert.equal(noVideoResult.includeVideo,true);assert.deepEqual(await readFile(noVideoResult.videoPath),fixtureVideo);
  assert.doesNotMatch(await readFile(noVideoResult.htmlPath,'utf8'),/youtube|<iframe|2026 F\/W FILM/);
 }finally{await rm(root,{recursive:true,force:true});}
});
