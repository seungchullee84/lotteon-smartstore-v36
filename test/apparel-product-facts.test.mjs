import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {explicitDetailFacts,selectedSeasonsFromTable,enrichOfficialProductFacts} from '../apparel-product-facts.mjs';
import {matchResearchTags} from '../apparel-tag-research.mjs';

test('시즌 명시와 표의 단순 선택지를 구분하고 봄버·기모로 계절을 추정하지 않는다',()=>{
 assert.deepEqual(explicitDetailFacts('착용시기\n봄 여름 가을 겨울'),[]);
 assert.deepEqual(explicitDetailFacts('기모 봄버 자켓').filter(t=>['봄','여름','가을','겨울'].includes(t)),[]);
 assert(explicitDetailFacts('가을 시즌에 착용').includes('가을'));
 assert.deepEqual(explicitDetailFacts('2026 S/S collection').sort(),['봄','여름'].sort());
 assert.deepEqual(explicitDetailFacts('2026 F/W collection').sort(),['가을','겨울'].sort());
 assert(explicitDetailFacts('긴소매 레귤러 핏 크루넥 프렌치 테리').includes('긴팔'));
});

test('착용시기 표는 채워진 점이 있는 봄·가을만 선택하고 텍스트만 있으면 적용하지 않는다',async()=>{
 const svg='<svg width="500" height="160"><rect width="500" height="160" fill="white"/><circle cx="160" cy="70" r="5" fill="black"/><circle cx="240" cy="70" r="5" fill="none" stroke="#ddd"/><circle cx="320" cy="70" r="5" fill="black"/><circle cx="400" cy="70" r="5" fill="none" stroke="#ddd"/></svg>';
 const bytes=await sharp(Buffer.from(svg)).png().toBuffer();
 const words=[{text:'착용시기',left:10,top:64,width:70,height:15},...['봄','여름','가을','겨울'].map((text,i)=>({text,left:150+i*80,top:90,width:20,height:15}))];
 assert.deepEqual(await selectedSeasonsFromTable(bytes,words),['봄','가을']);
 assert.deepEqual(await selectedSeasonsFromTable(await sharp({create:{width:500,height:160,channels:3,background:'white'}}).png().toBuffer(),words),[]);
});

test('공식 상세 이미지 내용이 같을 때만 추출 결과를 재사용한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'apparel-facts-'));try{
  const folder=path.join(root,'product');await mkdir(folder);await writeFile(path.join(folder,'detail.jpg'),await sharp({create:{width:100,height:150,channels:3,background:'#eee'}}).jpeg().toBuffer());
  const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',images:{detail:'official.jpg'}};let calls=0;
  const options={dataRoot:root,recognize:async()=>{calls++;return '봄/가을 긴소매 레귤러핏';}};
  const first=await enrichOfficialProductFacts(p,folder,options),again=await enrichOfficialProductFacts(p,folder,options);assert.equal(calls,1);assert.deepEqual(first.researchFacts,again.researchFacts);
  await writeFile(path.join(folder,'detail.jpg'),await sharp({create:{width:100,height:150,channels:3,background:'#aaa'}}).jpeg().toBuffer());await enrichOfficialProductFacts(p,folder,options);assert.equal(calls,2);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('맨투맨뿐 아니라 셔츠·니트·아우터·하의·블라우스·원피스의 관련 상위 품목을 확장한다',()=>{
 const cases=[['남성 맨투맨','남성티셔츠'],['남성 스웻셔츠','스웨트셔츠'],['남성 청바지','남성팬츠'],['남성 반바지','남성바지'],['남성 코트','남성아우터'],['남성 자켓','남성아우터'],['여성 블라우스','여성셔츠'],['여성 니트','여성스웨터'],['남성 셔츠','남성남방'],['여성 원피스','여성드레스']];
 const index={tags:cases.map(([,name],i)=>({id:String(i+1),name,decision:'include',kind:'garment'}))};
 for(const [name,wanted] of cases){const gender=name.startsWith('여성')?'여성':'남성',p={style:'123456',name,rawName:name,gender};assert(matchResearchTags(p,index).some(t=>t.name===wanted),name+' -> '+wanted);}
 const sweatshirt={style:'026958',sourceUrl:'official',rawName:'프렌치 테리 맨투맨',gender:'남성',noticeVerified:true,material:'면 60%',officialDescription:'크루넥 레귤러핏',researchFacts:{style:'026958',sourceUrl:'official',features:['봄','가을'],visualFeatures:['긴팔']}};
 const candidates=['남성티셔츠','긴팔티셔츠','봄맨투맨','가을맨투맨','여름맨투맨','겨울맨투맨','쭈리맨투맨'].map((name,i)=>({id:String(i+1),name,decision:'include',kind:'garment'}));
 const names=matchResearchTags(sweatshirt,{tags:candidates}).map(t=>t.name);
 for(const name of ['남성티셔츠','긴팔티셔츠','봄맨투맨','가을맨투맨','쭈리맨투맨'])assert(names.includes(name),name);
 for(const name of ['여름맨투맨','겨울맨투맨'])assert(!names.includes(name),name);
 const dress={style:'123456',rawName:'여성 데님 원피스',gender:'여성'},scope={tags:[{id:'3688',name:'데님원피스',decision:'exclude',reason:'explicit_skirt_dress',kind:'excluded_garment'}]};
 assert.equal(matchResearchTags(dress,scope)[0].name,'데님원피스');
 assert.equal(matchResearchTags({...dress,rawName:'여성 데님 자켓'},scope).length,0);
});
