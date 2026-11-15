import test from 'node:test';import assert from 'node:assert/strict';import {load} from 'cheerio';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
const color='01그레이',storeColor='02블랙';
function fixture(detailTemplate,count){
 const photos=Array.from({length:count},(_,index)=>'/smartstore-photo/official'+index);
 return {style:'356946',gender:'여성',rawName:'하프집 니트',detailTemplate,colors:[color],images:{detail:'https://www.giordano.co.kr/detail.jpg'},smartstoreDetail:{style:'356946',photoCount:0,acceptAllFolderPhotos:true,heroImage:'/smartstore-photo/store-main',colorImages:{[color]:photos},colorSources:{[color]:'official'},paletteImages:count?{[color]:photos[0]}:{},paletteSources:{[color]:'official'}}};
}
for(const detailTemplate of [1,2])test('템플릿 '+detailTemplate+' 공식 사진 0·1·2장은 실제 수대로 표시하고 매장 촬영·각도로 단정하지 않는다',()=>{
 for(const count of [0,1,2]){
  const product=fixture(detailTemplate,count),original=structuredClone(product),$=load(buildSmartstoreDetail(product).html),section=$('section[id^="smartstore-color-"]');
  assert.equal(section.length,count?1:0);assert.equal(section.find('img').length,count);
  assert.equal($('[data-mannequin-intro]').length,0);assert.equal($('[data-mannequin-size]').length,0);
  assert.deepEqual(section.find('img').map((_,image)=>$(image).attr('src')).get(),product.smartstoreDetail.colorImages[color]);
  assert.ok(section.find('img').toArray().every(image=>$(image).attr('alt')===color+' 공식 상품 사진'));
  if(count)assert.match(section.text(),/지오다노 공식 상품 사진/);
  assert.deepEqual(section.find('[data-photo-note]').map((_,note)=>$(note).text()).get(),count>1?['DETAIL']:[]);
  assert.deepEqual(product,original);
 }
});
for(const detailTemplate of [1,2])test('템플릿 '+detailTemplate+' 매장 사진과 공식 사진이 함께 있으면 실제 매장 구간 안내를 유지한다',()=>{
 const product=fixture(detailTemplate,1);product.colors.push(storeColor);product.smartstoreDetail.colorImages[storeColor]=['/smartstore-photo/store-front','/smartstore-photo/store-side','/smartstore-photo/store-detail'];product.smartstoreDetail.photoCount=3;
 const $=load(buildSmartstoreDetail(product).html),groups=$('section[id^="smartstore-color-"]');
 assert.equal($('[data-mannequin-intro]').length,1);assert.equal($('[data-mannequin-size]').length,1);assert.equal(groups.eq(0).find('img').length,1);assert.equal(groups.eq(1).find('img').length,3);
 assert.equal(groups.eq(0).find('img').attr('alt'),color+' 공식 상품 사진');assert.match(groups.eq(1).find('img').first().attr('alt'),/착용 모습/);
 assert.deepEqual(groups.eq(1).find('[data-photo-note]').map((_,note)=>$(note).text()).get(),['DETAIL']);
});
