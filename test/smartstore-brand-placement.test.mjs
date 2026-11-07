import test from 'node:test';import assert from 'node:assert/strict';import * as cheerio from 'cheerio';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
test('두 템플릿 모두 구매 이유와 공식 상세 다음 하단에 영상을 배치한다',()=>{
 for(const gender of ['남성','여성','공용'])for(const detailTemplate of [1,2]){
  const evidence='가벼운 울 원단을 사용했습니다.';
  const p={style:'123456',name:gender+' 테스트 상의',rawName:'울 폴로 자켓',gender,detailTemplate,colors:['01블랙'],images:{detail:'https://www.giordano.co.kr/detail.jpg'},smartstoreDetail:{style:'123456',sellingPoints:[{title:'가벼운 울 원단',description:'가벼운 울 원단을 사용했어요.',evidence}],colorImages:{'01블랙':['/smartstore-photo/0123456789abcdef01234567']}}};
  const {html}=buildSmartstoreDetail(p),$=cheerio.load(html);assert.equal($('[data-brand-intro]').length,0);assert(!html.includes('일상의 기본을, 나답게.'));assert.equal($('video').length,1);assert(html.includes(detailTemplate===2?'지오다노가 담은 일상의 순간':'영상으로 만나는 지오다노'));assert.equal($('[data-brand-video-heading]').attr('style').includes('height:176px'),true);
  for(const selector of ['[data-brand-video-heading]','[data-brand-video]','[data-product-point-heading]'])assert.equal($(selector).length,1);
  const promo=$('[data-shipping-promo]');
  assert.equal(promo.length,1);assert.doesNotMatch(html,/MATERIAL & SIZE|소재와 사이즈/);
  assert.equal(promo.nextAll('section').first().is('[data-official-detail]'),true);
  const asset=detailTemplate===1||gender==='공용'?'shipping-promo.png':gender==='남성'?'shipping-promo-men.png':'shipping-promo-women.png';
  assert.equal(promo.find('img').attr('src').split('/').at(-1),asset);
  if(detailTemplate===2){
   const footer=$('[data-store-footer]');
   assert.deepEqual(footer.find('.ss2-service-grid>div>span').map((_,node)=>$(node).text()).get(),['01','02','03']);
   assert.doesNotMatch(footer.text(),/주 7일/);
  }
  const order=['data-product-intro','data-product-point-heading','id="smartstore-color-0"','<section data-shipping-promo','data-official-detail','data-brand-video-heading','data-brand-video="mp4"','data-store-banner'];
  for(let i=1;i<order.length;i++)assert(html.indexOf(order[i-1])<html.indexOf(order[i]));
 }
});

test('브랜드 소개 파일 없이도 실제 영상 좌표에서 PNG를 분할한다',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path'),sharp=(await import('sharp')).default;const {smartstoreUploadParts}=await import('../smartstore-detail-upload.mjs');const folder=await mkdtemp(path.join(tmpdir(),'video-only-'));try{const png=path.join(folder,'detail.png');await sharp({create:{width:860,height:2200,channels:3,background:'white'}}).png().toFile(png);const result=await smartstoreUploadParts(png,folder,path.join(folder,'removed-brand.jpg'),{includeVideo:false,brandIntroHeight:0,videoAfterTop:600,officialTop:1200,bannerTop:1700,footerTop:1900});assert.equal((await sharp(result.files[0]).metadata()).height,600);let total=0;for(const file of result.files)total+=(await sharp(file).metadata()).height;assert.equal(total,2200);assert.equal(result.videoAfterIndex,0);}finally{await rm(folder,{recursive:true,force:true});}
});
