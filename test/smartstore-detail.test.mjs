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
const product={detailTemplate:2,style:'375908',name:'여성 경량 패딩 자켓 375908',rawName:'여성 경량 패딩 자켓',gender:'여성',colors:['01핑크','02화이트'],sizes:['S','M'],material:'나일론100%',country:'미얀마',washing:'손세탁',manufactured:'2025-08',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=sample',originalDetailUrl:'https://www.giordano.co.kr/detail.jpg',images:{detail:'https://www.giordano.co.kr/detail.jpg',size:'https://www.giordano.co.kr/size.jpg',info:'https://www.giordano.co.kr/info.jpg'}};

test('기본 템플릿1과 명시적으로 선택한 템플릿2는 독립적으로 보존한다',()=>{
 const base={...product,detailTemplate:undefined},one=buildSmartstoreDetail(base),two=buildSmartstoreDetail({...base,detailTemplate:2});
 assert.equal(one.templateVariant,1);assert.equal(one.templateLabel,'템플릿 1');assert(one.html.indexOf('data-brand-intro')<one.html.indexOf('data-product-intro'));assert(!one.html.includes('data-aida-action'));
 assert.equal(two.templateVariant,2);assert.equal(two.templateLabel,'템플릿 2');assert(two.html.indexOf('data-product-intro')<two.html.indexOf('data-brand-intro'));assert(two.html.includes('data-aida="attention"'));assert(!two.html.includes('data-aida-action'));
 assert.throws(()=>buildSmartstoreDetail({...base,detailTemplate:3}),/템플릿 1 또는 2/);
});

test('모든 의류의 AIDA 순서는 상품·구매 장점부터 시작하고 중복 선택 안내 없이 스토어 배너로 이어진다',()=>{
 const point={title:'편안한 움직임',description:'여유로운 품으로 편안하게 입어요.',evidence:'여유로운 품으로 편안한 착용감을 제공합니다.'};
 for(const name of ['남성 맨투맨','여성 스커트','공용 경량 자켓']){
  const p={...product,name,colorImages:{'01핑크':['https://example.com/current.jpg']},smartstoreDetail:{style:product.style,sellingPoints:[point],colorImages:{'01핑크':['https://example.com/current.jpg']}}},html=buildSmartstoreDetail(p).html;
  const order=['data-product-intro','data-aida="interest"','data-color-palette','id="smartstore-color-0"','data-official-detail','data-brand-intro','data-brand-video-heading','<video ','data-store-banner','data-store-footer'].map(marker=>html.indexOf(marker));
  assert(order.every((index,i)=>index>=0&&(!i||index>order[i-1])));assert.doesNotMatch(html,/data-product-hero/);assert.match(html,/data-attention-benefit[^>]*>편안한 움직임/);assert.doesNotMatch(html,/나의 한 벌 고르기|마음에 드는 색상과|나에게 맞는 한 벌을 선택/);assert.equal((html.match(/<video /g)||[]).length,1);assert(!html.includes('<button'));
 }
});

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
 assert.ok(approved.indexOf('brand-intro-pair-')<approved.indexOf('<video '));
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
 const reviewedProduct={...product,officialDescription:'가벼운 원단의 경량 패딩입니다.'};
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-template-'));const folder=path.join(root,'product'),dataRoot=path.join(root,'data'),draftRoot=path.join(dataRoot,'smartstore-details',product.style);
 try{
  await mkdir(folder,{recursive:true});await mkdir(draftRoot,{recursive:true});await prepareVideo(dataRoot);
  for(const key of ['detail','size','info'])await sharp({create:{width:120,height:key==='detail'?300:100,channels:3,background:key==='detail'?'#ac3c56':'white'}}).jpeg().toFile(path.join(folder,key+'.jpg'));
  await sharp({create:{width:300,height:400,channels:3,background:'pink'}}).jpeg().toFile(path.join(draftRoot,'front.jpg'));
  const draft={style:product.style,sourceUrl:product.sourceUrl,photos:[{color:'01핑크',files:['front.jpg']}],sellingPoints:[{title:'경량 패딩',description:'가벼운 원단으로 만든 경량 패딩.',evidence:'가벼운 원단의 경량 패딩입니다.'}]};
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,style:'000000'}));await assert.rejects(prepareSmartstoreDetail(reviewedProduct,folder,{dataRoot}),/품번/);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,photos:[{color:'다른색상',files:['front.jpg']}]}));await assert.rejects(prepareSmartstoreDetail(reviewedProduct,folder,{dataRoot}),/없는 색상/);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,photos:[{color:'01핑크',files:['../outside.jpg']}]}));await assert.rejects(prepareSmartstoreDetail(reviewedProduct,folder,{dataRoot}),/폴더 안/);
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify(draft));
  const p=await prepareSmartstoreDetail(reviewedProduct,folder,{dataRoot});assert.equal(p.smartstoreDetail.photoCount,1);assert.equal(p.smartstoreDetail.sellingPoints[0].title,'가볍게, 부담 없이');
  assert.match(localSmartstorePreview(p).html,/smartstore-photo\/[a-f0-9]{24}/);assert.doesNotMatch(localSmartstorePreview(p).html,/기모/);
  const out=path.join(root,'detail.png');const result=await saveSmartstoreDetail(reviewedProduct,folder,out,{dataRoot,videoOptions});
  const meta=await sharp(out,{limitInputPixels:false}).metadata();assert.equal(meta.width,860);assert.ok(meta.height>4000);assert.equal(result.photoCount,1);
  assert(result.officialTop<result.videoAfterTop&&result.videoAfterTop===result.bannerTop,'PNG와 ONE의 MP4 위치는 브랜드 소개 뒤·스토어 배너 앞');
  assert.ok(Number.isInteger(result.bannerTop));assert.ok(result.bannerTop<result.footerTop);assert.equal((await sharp(result.bannerPath).metadata()).height,result.footerTop-result.bannerTop);assert.ok(Number.isInteger(result.footerTop));assert.equal((await sharp(result.footerPath).metadata()).height,result.height-result.footerTop);
  assert.deepEqual(await sharp(result.footerPath).raw().toBuffer(),await sharp(out,{limitInputPixels:false}).extract({left:0,top:result.footerTop,width:860,height:result.height-result.footerTop}).raw().toBuffer());
  assert.match(await readFile(result.htmlPath,'utf8'),/data:image\/jpeg;base64,/);assert.deepEqual(await readFile(result.videoPath),fixtureVideo);
  assert.match(await readFile(result.htmlPath,'utf8'),/detail_%EB%B8%8C%EB%9E%9C%EB%93%9C%EC%98%81%EC%83%81\.mp4/);
  assert.equal(result.storeVideoPlayback,'unverified');
  assert.ok(result.points.every(p=>!/모달|기모/.test(p.title+p.description)));
  const templateOne=await saveSmartstoreDetail({...reviewedProduct,detailTemplate:1},folder,path.join(root,'template-one.png'),{dataRoot,videoOptions});assert.equal(templateOne.templateVariant,1);assert(templateOne.videoAfterTop<templateOne.officialTop);assert.equal(templateOne.renderCacheHit,false);
  const repeated=await saveSmartstoreDetail(reviewedProduct,folder,path.join(root,'repeated.png'),{dataRoot,videoOptions});
  assert.equal(result.renderCacheHit,false);assert.equal(repeated.renderCacheHit,true);assert.equal(repeated.footerTop,result.footerTop);
  assert.deepEqual(await readFile(out),await readFile(path.join(root,'repeated.png')));
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,headline:'변경한 상품 소개'}));
  const changed=await saveSmartstoreDetail(reviewedProduct,folder,path.join(root,'changed.png'),{dataRoot,videoOptions});assert.equal(changed.renderCacheHit,false);
  assert.notDeepEqual(await readFile(out),await readFile(path.join(root,'changed.png')));
  await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...draft,includeBrandVideo:false}));
  const withoutVideo=await prepareSmartstoreDetail(reviewedProduct,folder,{dataRoot});
  assert.equal(withoutVideo.smartstoreDetail.includeBrandVideo,true);
  assert.doesNotMatch(localSmartstorePreview(withoutVideo).html,/youtube|<iframe|2026 F\/W FILM/);
  const noVideoResult=await saveSmartstoreDetail(reviewedProduct,folder,path.join(root,'no-season-video.png'),{dataRoot,videoOptions});
  assert.equal(noVideoResult.includeVideo,true);assert.deepEqual(await readFile(noVideoResult.videoPath),fixtureVideo);
  assert.doesNotMatch(await readFile(noVideoResult.htmlPath,'utf8'),/youtube|<iframe|2026 F\/W FILM/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('색상 팔레트는 한 줄 최대 4개로 표시하며 상세 사진 네 번째도 빠뜨리지 않는다',()=>{
 const colors=['01화이트','02블랙','03베이지','04그린','12브라운'];const colorImages=Object.fromEntries(colors.map(c=>[c,Array.from({length:4},(_,i)=>'https://example.com/'+c.slice(0,2)+'-'+i+'.jpg')]));
 const html=buildSmartstoreDetail({...product,colors,colorImages}).html;
 assert.match(html,/data-color-palette[^>]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);assert.match(html,/12-3.jpg/);assert.equal((html.match(/data-photo-layout="four"/g)||[]).length,5);
});


test('두 템플릿 상품 소개 메인은 공식 모델 대신 현재 마네킹 1번을 사용한다',()=>{
 const hero='/smartstore-photo/'+'a'.repeat(24);
 for(const detailTemplate of [1,2]){
  const p={...product,detailTemplate,images:{...product.images,main:'https://www.giordano.co.kr/official-main.jpg'},smartstoreDetail:{style:product.style,heroImage:hero,colorImages:{},sellingPoints:[]}};
  const html=buildSmartstoreDetail(p).html;
  assert.match(html,/data-product-hero/);
  assert.match(html,new RegExp('src="'+hero+'"'));
  assert.doesNotMatch(html,/src="https:\/\/www.giordano.co.kr\/official-main.jpg"/);
  const changed=buildSmartstoreDetail({...p,smartstoreDetail:{...p.smartstoreDetail,heroImage:hero.replace(/a/g,'b')}}).html;
  assert.notEqual(html,changed,'대표 마네킹 변경 시 렌더 캐시 입력도 달라진다');
 }
});
