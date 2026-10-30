import test from 'node:test';import assert from 'node:assert/strict';import {load} from 'cheerio';
import {buildSmartstoreDetail,smartstoreDetailDocument} from '../smartstore-detail.mjs';
import {templateTwoTheme,templateTwoHeadline} from '../smartstore-template-two-theme.mjs';
const product={style:'123456',gender:'여성',rawName:'여성 웜 립 터틀넥',colors:['01화이트','02블랙','03그린'],sizes:['S','M'],images:{main:'https://www.giordano.co.kr/main.jpg',detail:'https://www.giordano.co.kr/detail.jpg',size:'https://www.giordano.co.kr/size.jpg'},smartstoreDetail:{style:'123456',heroImage:'/smartstore-photo/hero',acceptAllFolderPhotos:true,paletteImages:{'01화이트':'/smartstore-photo/front'},colorImages:{'01화이트':['/smartstore-photo/front','/smartstore-photo/side'],'02블랙':['/smartstore-photo/black']},sellingPoints:[{title:'다양하게 레이어드',description:'단독 착용과 레이어드에 활용합니다.',evidence:'단독으로 착용하거나 셔츠와 재킷에 레이어드해 활용할 수 있습니다.'},{title:'편안한 터틀넥',description:'부담 적은 착용감.',evidence:'적당한 폭의 터틀넥으로 편안하게 착용합니다.'}]}};
test('공식 성별 필드로 여성 로즈·남성 네이비를 고르고 이름에서 추측하지 않는다',()=>{
 for(const gender of ['여성','여자','WOMEN','female'])assert.equal(templateTwoTheme({gender}).key,'women');
 for(const gender of ['남성','남자','MEN','male'])assert.equal(templateTwoTheme({gender}).key,'men');
 for(const gender of ['','미확인','공용'])assert.equal(templateTwoTheme({gender,name:'여성 남성 의류'}).key,'neutral');
 assert(templateTwoTheme({}).needsGenderReview);assert(!templateTwoTheme({gender:'공용'}).needsGenderReview);
 const female=load(buildSmartstoreDetail({...product,detailTemplate:2}).html),male=load(buildSmartstoreDetail({...product,gender:'남성',detailTemplate:2}).html);
 assert.equal(female('[data-template-theme]').attr('data-template-theme'),'women');assert.equal(male('[data-template-theme]').attr('data-template-theme'),'men');assert.match(female('.ss2').attr('style'),/--button:#673247/);assert.match(male('.ss2').attr('style'),/--button:#223d60/);
 assert.deepEqual(female('img').toArray().map(n=>female(n).attr('src')),male('img').toArray().map(n=>male(n).attr('src')),'성별 배색은 원본 사진을 바꾸지 않는다');
});
test('새 템플릿2는 상품별 근거 제목·공식 로고·원본 전체·정면 팔레트·상단 영상·하단 링크를 보존한다',()=>{
 const {html}=buildSmartstoreDetail({...product,detailTemplate:2}),$=load(html);
 assert.equal($('[data-benefit-headline]').text(),'단독으로도,겹쳐 입어도편안하게.');assert.equal($('[data-brand-intro]').length,0);assert.equal($('video').length,1);assert.equal($('[data-brand-video-heading] h2').text(),'지오다노가 담은 일상의 순간');
 assert.equal($('[data-product-point-heading]').text(),'이 옷을 고르는 이유');assert.equal($('[data-color-palette] img').length,1);assert.equal($('[data-palette-photo-pending]').length,2);
 assert.equal($('section[id^="smartstore-color-"] img').length,3);for(const src of product.smartstoreDetail.colorImages['01화이트'])assert.equal($('section[id^="smartstore-color-"] img').filter((i,n)=>$(n).attr('src')===src).length,1);
 assert.equal($('[data-store-banner]').prev().attr('data-official-detail'),'');assert.equal($('[data-store-banner] a').attr('href'),'https://shopping.naver.com/window/department/store/101731950');assert($('[data-store-banner]').text().includes('누르면 스토어로 이동'));assert($('[data-store-footer]').text().includes('왕복 6,000원'));assert.equal($('[data-store-footer] img').length,1);assert.equal($('img').filter((i,n)=>$(n).attr('src').endsWith('giordano-official.png')).length,1);
 assert(!html.includes('127.0.0.1'));assert(!html.includes('object-fit:cover'));assert.equal(product.colors.length,3);
});
test('소구점 생략·근거 부족은 상품명으로 대체하고 다른 상품 제목을 재사용하지 않는다',()=>{
 assert.deepEqual(templateTwoHeadline({...product,rawName:'남성 울 코트'},[]),['남성 울 코트']);
 const $=load(buildSmartstoreDetail({...product,detailTemplate:2,smartstoreDetail:{...product.smartstoreDetail,omitSellingPoints:true}}).html);assert.equal($('[data-benefit-headline]').text(),'여성 웜 립 터틀넥');assert.equal($('[data-product-points]').length,0);
 assert.throws(()=>buildSmartstoreDetail({...product,detailTemplate:2,smartstoreDetail:{...product.smartstoreDetail,style:'654321'}}),/다른 품번/);
 const a=smartstoreDetailDocument({...product,detailTemplate:2},{includeVideo:false});assert(!a.html.includes('<video '));assert(a.html.includes('data-brand-video-heading'));
});

test('템플릿2 상단은 공식 로고 두 개와 성별만 유지하고 품번은 별도 STYLE NO에 표시한다',()=>{for(const [gender,label] of [['여성','WOMEN'],['남성','MEN']]){const $=load(buildSmartstoreDetail({...product,gender,detailTemplate:2}).html);assert.equal($('.ss2-header [data-giordano-logo] img').length,1);assert.equal($('.ss2-header [data-lotte-logo] img').length,1);assert.equal($('.ss2-meta').text(),label);assert(!$('.ss2-header').text().includes(product.style));assert($('[data-style-number]').text().includes(product.style));}});

test('큰 강조 번호를 유지하고 옆 색상명의 중복 번호만 제외하며 사진 매칭용 원래 색상은 보존한다',()=>{const $=load(buildSmartstoreDetail({...product,detailTemplate:2}).html);const first=$('section[id^="smartstore-color-"]').first();assert.equal(first.find('.ss2-color-number').text(),'01');assert.equal(first.find('h2').text(),'화이트');assert.equal(first.attr('data-color-name'),'01화이트');assert.deepEqual(product.colors,['01화이트','02블랙','03그린']);});
