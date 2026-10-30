import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import sharp from 'sharp';import {brandIntroSelection,BRAND_INTRO_ASSET_NAMES} from '../smartstore-brand-intro.mjs';import {buildSmartstoreDetail} from '../smartstore-detail.mjs';import {publishable} from '../github-sync.mjs';
const manifest=JSON.parse(await readFile(new URL('../public/smartstore-template/brand-intro-variants.json',import.meta.url)));
test('남녀 각각 10개의 서로 다른 공식 원본으로 10개 남녀 조합을 만든다',async()=>{
 assert.equal(manifest.photos.filter(p=>p.gender==='men').length,10);assert.equal(manifest.photos.filter(p=>p.gender==='women').length,10);assert.equal(new Set(manifest.photos.map(p=>p.sourceSha256)).size,20);assert.equal(manifest.variants.length,10);
 for(const photo of manifest.photos){assert.equal(photo.faceOrClothesAltered,false);assert.match(new URL(photo.sourceUrl).hostname,/(^|\.)giordano\.co\.kr$/);}
 for(const file of BRAND_INTRO_ASSET_NAMES){assert(publishable('public/smartstore-template/'+file));const meta=await sharp(await readFile(new URL('../public/smartstore-template/'+file,import.meta.url))).metadata();assert.equal(meta.width,860);assert.equal(meta.height,601);}
 assert(publishable('public/smartstore-template/brand-intro-variants.json'));assert(!publishable('data/brand-intro-variants/men-01-original.jpg'));assert(!publishable('public/smartstore-template/arbitrary.jpg'));
});
test('공식 상품 성별·품목을 실제 착장 태그와 비교하고 같은 품번은 항상 같은 조합을 선택한다',()=>{
 const p={style:'116926',rawName:'남성 브러시드 테이퍼드 치노 팬츠',gender:'남성',images:{}};assert.equal(brandIntroSelection(p).id,9);assert.deepEqual(brandIntroSelection(p),brandIntroSelection({...p,name:'사용자가 수정한 이름'}));
 const female=brandIntroSelection({style:'376915',rawName:'여성 CLOUD LIGHT 경량 패딩 자켓',gender:'여성'});assert.equal(female.id,7);
 const cardigan=brandIntroSelection({style:'356000',rawName:'여성 울블렌드 가디건',gender:'여성'});assert.equal(cardigan.id,1);
 const html=buildSmartstoreDetail(p).html;assert(!html.includes('data-brand-intro'));assert(!html.includes(brandIntroSelection(p).file));assert(html.includes('영상으로 만나는 지오다노'));assert(html.indexOf('data-brand-video-heading')<html.indexOf('<video'));
 for(const gender of ['남성','여성','공용',''])assert(BRAND_INTRO_ASSET_NAMES.includes(brandIntroSelection({style:'123456',rawName:'공식 의류',gender}).file));
});
