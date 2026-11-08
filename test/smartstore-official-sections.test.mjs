import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';import os from 'node:os';
import {officialSectionMatch,embeddedOfficialSections} from '../smartstore-official-sections.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {createOfficialLayoutMatcher} from '../smartstore-official-layout.mjs';
async function chart(label){return sharp(Buffer.from(`<svg width="500" height="300"><rect width="500" height="300" fill="white"/><text x="20" y="48" font-size="35">${label}</text><path d="M20 75H480M20 130H480M20 185H480M20 240H480M180 75V260M350 75V260" stroke="black" stroke-width="3"/><text x="200" y="120" font-size="28">67 70 73</text><text x="25" y="175" font-size="25">COTTON</text><circle cx="280" cy="220" r="15" fill="black"/></svg>`)).jpeg({quality:92}).toBuffer();}
test('긴 원본 속 전체 섹션을 확인하며 다른 사진과 빈 이미지는 중복으로 처리하지 않는다',async()=>{
 const section=await chart('INFORMATION');const detail=await sharp({create:{width:500,height:1000,channels:3,background:'#7393b5'}}).composite([{input:section,left:0,top:650}]).jpeg({quality:90}).toBuffer();
 const matched=await officialSectionMatch(detail,section);assert.equal(matched.included,true);assert.ok(Math.abs(matched.top-650)<=1);
 const different=await sharp({create:{width:500,height:300,channels:3,background:'#1a3b24'}}).jpeg().toBuffer();
 assert.equal((await officialSectionMatch(detail,different)).included,false);
 const blank=await sharp({create:{width:500,height:300,channels:3,background:'#fff'}}).jpeg().toBuffer();assert.equal((await officialSectionMatch(detail,blank)).included,false);
});
test('다른 해상도로 축소된 정보고시도 포함 여부를 확인한다',async()=>{
 const info=await chart('INFORMATION'),scaled=await sharp(info).resize({width:373}).jpeg({quality:90}).toBuffer();
 const detail=await sharp({create:{width:373,height:1763,channels:3,background:'#7393b5'}}).composite([{input:scaled,left:0,top:1500}]).jpeg({quality:90}).toBuffer();
 assert.equal((await officialSectionMatch(detail,info)).included,true);
});
test('별도 표의 위아래 여백이 달라도 같은 내용만 중복으로 판정한다',async()=>{
 const info=await chart('INFORMATION');
 const padded=await sharp(info).extend({top:12,bottom:112,left:0,right:0,background:'#fff'}).png().toBuffer();
 const detail=await sharp({create:{width:500,height:1200,channels:3,background:'#7393b5'}}).composite([{input:info,left:0,top:900}]).jpeg({quality:92}).toBuffer();
 const match=await officialSectionMatch(detail,padded);
 assert.equal(match.included,true);
 assert.equal(match.comparison,'without-vertical-padding');
 const different=await sharp(await chart('DIFFERENT SIZE CHART')).extend({top:12,bottom:112,left:0,right:0,background:'#fff'}).png().toBuffer();
 assert.equal((await officialSectionMatch(detail,different)).included,false);
});
test('원본 바이트를 유지하고 이미지가 바뀌면 포함 여부 캐시를 재검증한다',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'official-inclusion-'));try{
 const info=await chart('INFORMATION'),detail=await sharp({create:{width:500,height:900,channels:3,background:'#345678'}}).composite([{input:info,left:0,top:600}]).jpeg({quality:92}).toBuffer();
 await writeFile(path.join(folder,'detail.jpg'),detail);await writeFile(path.join(folder,'info.jpg'),info);
 const p={style:'123456',images:{detail:'d',info:'i'}};
 assert.deepEqual(await embeddedOfficialSections(p,folder),['info']);assert.deepEqual(await readFile(path.join(folder,'detail.jpg')),detail);
 assert.deepEqual(await embeddedOfficialSections(p,folder),['info']);
 await writeFile(path.join(folder,'info.jpg'),await sharp({create:{width:500,height:300,channels:3,background:'#213721'}}).jpeg().toBuffer());
 assert.deepEqual(await embeddedOfficialSections(p,folder),[]);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('직접 검증한 고시 제외는 같은 품번·공식 출처·두 원본 해시에만 적용된다',async()=>{
 const dataRoot=await mkdtemp(path.join(os.tmpdir(),'verified-official-info-'));
 const folder=path.join(dataRoot,'collected'),draft=path.join(dataRoot,'smartstore-details','123456');
 try{
  await Promise.all([mkdir(folder),mkdir(draft,{recursive:true})]);
  const info=await chart('INFORMATION');
  const detail=await sharp({create:{width:500,height:900,channels:3,background:'#345678'}}).jpeg().toBuffer();
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  await Promise.all([writeFile(path.join(folder,'info.jpg'),info),writeFile(path.join(folder,'detail.jpg'),detail)]);
  const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/product/example',images:{detail:'d',info:'i'}};
  assert.deepEqual(await embeddedOfficialSections(p,folder,{dataRoot}),[]);
  await writeFile(path.join(draft,'official-info-inclusion.json'),JSON.stringify({style:p.style,sourceUrl:p.sourceUrl,detailSha256:hash(detail),infoSha256:hash(info),verified:true}));
  assert.deepEqual(await embeddedOfficialSections(p,folder,{dataRoot}),['info']);
  assert.deepEqual(await embeddedOfficialSections({...p,sourceUrl:p.sourceUrl+'-other'},folder,{dataRoot}),[]);
  await writeFile(path.join(folder,'info.jpg'),await chart('REVISED INFORMATION'));
  assert.deepEqual(await embeddedOfficialSections(p,folder,{dataRoot}),[]);
 }finally{await rm(dataRoot,{recursive:true,force:true});}
});
test('포함된 정보만 추가 삽입에서 빼고 전체 원본과 원본에 없는 정보는 남긴다',()=>{
 const p={style:'123456',images:{detail:'https://x.test/detail.jpg',size:'https://x.test/size.jpg',check:'https://x.test/check.jpg',info:'https://x.test/info.jpg'},smartstoreDetail:{style:'123456',embeddedOfficialSections:['size','info']}};
 const html=buildSmartstoreDetail(p).html;assert.equal((html.match(/https:\/\/x.test\/detail.jpg/g)||[]).length,1);assert.ok(html.includes(p.images.check));assert.ok(!html.includes(p.images.size));assert.ok(!html.includes(p.images.info));
 const unverified=buildSmartstoreDetail({...p,smartstoreDetail:{style:p.style}}).html;for(const src of Object.values(p.images))assert.ok(unverified.includes(src));
 const noDetail=buildSmartstoreDetail({...p,images:{main:'https://x.test/main.jpg',size:p.images.size,check:p.images.check,info:p.images.info}}).html;
 for(const key of ['size','check','info'])assert.ok(noDetail.includes(p.images[key]));
});

test('재배치된 SIZE·CHECK UP·INFORMATION은 인식하고 바뀐 치수·표시·원산지는 보존한다',async()=>{

 const layers=(parts,ys,change)=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650"><rect width="1000" height="650" fill="white"/>'+parts.map((p,i)=>'<g transform="translate(0,'+ys[i]+')">'+p(change)+'</g>').join('')+'</svg>');
 const sizeParts=[
 () => '<text x="375" y="30" font-size="36">DETAIL SIZE</text>',
 changed => Array.from({length:5},(_,row)=>Array.from({length:6},(_,col)=>'<text x="'+(170+115*col)+'" y="'+(28+42*row)+'" font-size="26">'+(changed&&row===2&&col===2?'67.8':'67.3')+'</text>').join('')).join(''),
 () => '<text x="200" y="20" font-size="23">Measure each garment before choosing a size.</text>'
];
 const checkParts=[
 () => '<text x="375" y="30" font-size="36">CHECK UP</text>',
 changed => Array.from({length:6},(_,row)=>'<text x="75" y="'+(28+42*row)+'" font-size="24">FEATURE '+row+'</text>'+[0,1,2].map(col=>'<circle cx="'+(270+180*col)+'" cy="'+(20+42*row)+'" r="10" stroke="black" stroke-width="2" fill="'+((changed&&row===2?1:0)===col?'black':'white')+'"/>').join('')).join(''),
 () => '<text x="200" y="20" font-size="23">Select the option matching the garment.</text>'
];
 const infoParts=[
 () => '<text x="375" y="30" font-size="36">INFORMATION</text>',
 changed => ['COTTON 100%',changed?'MADE IN JAPAN':'MADE IN KOREA','HAND WASH ONLY'].map((line,i)=>'<text x="150" y="'+(30+i*48)+'" font-size="24">'+line+'</text>').join(''),
 () => '<text x="200" y="20" font-size="23">Read the label before washing the garment.</text>'
];
 for(const parts of [sizeParts,checkParts,infoParts]){
 const a=await sharp(layers(parts,[35,140,520],false)).jpeg({quality:93}).toBuffer();
 const b=await sharp(layers(parts,[55,220,560],false)).jpeg({quality:88}).toBuffer();
 const changed=await sharp(layers(parts,[55,220,560],true)).jpeg({quality:88}).toBuffer();
 const detail=await sharp({create:{width:1000,height:1850,channels:3,background:'#fff'}}).composite([{input:a,top:1000,left:0}]).jpeg({quality:91}).toBuffer();
 const compare=createOfficialLayoutMatcher(detail);
 assert.equal((await compare(b)).included,true);
 assert.equal((await compare(changed)).included,false);
}

});
