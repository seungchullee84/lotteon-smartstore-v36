import test from 'node:test';import assert from 'node:assert/strict';import * as cheerio from 'cheerio';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
test('두 템플릿 모두 브랜드 소개 없이 동영상을 고를 때 확인할 포인트 바로 앞으로 이동한다',()=>{
 for(const gender of ['남성','여성','공용'])for(const detailTemplate of [1,2]){
  const p={style:'123456',name:gender+' 테스트 상의',rawName:'울 폴로 자켓',gender,detailTemplate,colors:['01블랙'],images:{detail:'https://www.giordano.co.kr/detail.jpg'},smartstoreDetail:{style:'123456',sellingPoints:[{title:'가볍고 따뜻하게',description:'가벼운 보온감.',evidence:'가벼운 보온감.'}],colorImages:{'01블랙':['/smartstore-photo/0123456789abcdef01234567']}}};
  const {html}=buildSmartstoreDetail(p),$=cheerio.load(html);assert.equal($('[data-brand-intro]').length,0);assert(!html.includes('일상의 기본을, 나답게.'));assert.equal($('video').length,1);assert(html.includes('영상으로 만나는 지오다노'));assert.equal($('[data-brand-video-heading]').attr('style').includes('height:176px'),true);
  for(const selector of ['[data-brand-video-heading]','[data-brand-video]','[data-product-point-heading]'])assert.equal($(selector).length,1);
  assert.equal($('[data-brand-video]').next().next().find('[data-product-point-heading]').length,1,'영상 뒤 구분선 다음에 포인트 구간');
  const order=['data-product-intro','data-brand-video-heading','data-brand-video="mp4"','data-product-point-heading','data-official-detail','data-store-banner'];
  for(let i=1;i<order.length;i++)assert(html.indexOf(order[i-1])<html.indexOf(order[i]));
 }
});

test('브랜드 소개 파일 없이도 실제 영상 좌표에서 PNG를 분할한다',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path'),sharp=(await import('sharp')).default;const {smartstoreUploadParts}=await import('../smartstore-detail-upload.mjs');const folder=await mkdtemp(path.join(tmpdir(),'video-only-'));try{const png=path.join(folder,'detail.png');await sharp({create:{width:860,height:2200,channels:3,background:'white'}}).png().toFile(png);const result=await smartstoreUploadParts(png,folder,path.join(folder,'removed-brand.jpg'),{includeVideo:false,brandIntroHeight:0,videoAfterTop:600,officialTop:1200,bannerTop:1700,footerTop:1900});assert.equal((await sharp(result.files[0]).metadata()).height,600);let total=0;for(const file of result.files)total+=(await sharp(file).metadata()).height;assert.equal(total,2200);assert.equal(result.videoAfterIndex,0);}finally{await rm(folder,{recursive:true,force:true});}
});
