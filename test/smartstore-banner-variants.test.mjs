import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {storeBannerAsset,STORE_BANNER_ASSETS,STORE_BANNER_ASSET_NAMES} from '../smartstore-store-banner.mjs';
import {TEMPLATE_ASSET_NAMES,buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {publishable} from '../github-sync.mjs';
test('남녀 각 4종 모두 기존과 동일한 860×420 JPG이며 공통 템플릿과 배포에 포함된다',async()=>{
 for(const gender of ['men','women']){
  assert.equal(STORE_BANNER_ASSETS[gender].length,4);
  assert.equal(new Set(STORE_BANNER_ASSETS[gender]).size,4);
  for(const file of STORE_BANNER_ASSETS[gender]){
   const meta=await sharp(fileURLToPath(new URL('../public/smartstore-template/'+file,import.meta.url))).metadata();
   assert.equal(meta.width,860);assert.equal(meta.height,420);assert.equal(meta.format,'jpeg');
   assert.ok(TEMPLATE_ASSET_NAMES.includes(file));assert.equal(publishable('public/smartstore-template/'+file),true);
  }
 }
 assert.equal(STORE_BANNER_ASSET_NAMES.length,9);
});
test('품번별 선택은 재실행·수정 후에도 고정되고 같은 성별 4종만 고른다',()=>{
 for(const gender of ['남성','여성']){
  const used=new Set();for(let i=1;i<=128;i++){
   const p={style:String(i).padStart(6,'0'),gender};const first=storeBannerAsset(p);used.add(first);
   assert.equal(storeBannerAsset({...p,name:'수정한 상품명',material:'소재 수정'}),first);
   assert.ok(STORE_BANNER_ASSETS[gender==='남성'?'men':'women'].includes(first));
   const html=buildSmartstoreDetail({...p,images:{detail:'https://www.giordano.co.kr/detail.jpg'}}).html;
   assert.ok(html.includes(first));
  }
  assert.equal(used.size,4);
 }
 assert.equal(storeBannerAsset({gender:'남녀공용',style:'026982'}),'store-discovery-unisex.jpg');
 assert.equal(storeBannerAsset({gender:'여성'}),'store-discovery-women.jpg');
});
test('추가 6종은 공식 화보 출처와 원본 해시를 기록하고 모델 합성이 없다',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/smartstore-template/store-discovery-sources.json',import.meta.url),'utf8'));
 assert.equal(manifest.additionalVariants.length,6);
 for(const item of manifest.additionalVariants){assert.equal(new URL(item.url).hostname,'m.giordano.co.kr');assert.match(item.sha256,/^[a-f0-9]{64}$/);assert.equal(item.modelAltered,false);}
});

test('분위기 대신 성별·공식 품목과 화보 착장의 연관성을 우선한다',()=>{
 for(const [gender,rawName,file]of [
  ['남성','기모 테리 패치 후드티','store-discovery-men.jpg'],
  ['남성','코튼 맨투맨 스웨트셔츠','store-discovery-men-3.jpg'],
  ['남성','메리노울 니트 스웨터','store-discovery-men-2.jpg'],
  ['남성','울 코트','store-discovery-men-4.jpg'],
  ['여성','니트 가디건','store-discovery-women.jpg'],
  ['여성','퀼팅 패딩 자켓','store-discovery-women-2.jpg'],
  ['여성','메리노울 터틀넥 니트','store-discovery-women-3.jpg'],
  ['여성','코튼 긴팔 티셔츠','store-discovery-women-4.jpg']
 ])for(const style of ['026982','356954','999999']){
  assert.equal(storeBannerAsset({style,gender,rawName}),file);
  assert.equal(storeBannerAsset({style,gender,rawName,name:'수정한 상품명 겨울 코트'}),file);
 }
 assert.equal(storeBannerAsset({style:'123456',gender:'남성',rawName:'공식 상품',sourceCategory:['MEN','맨투맨']}),'store-discovery-men-3.jpg');
});
