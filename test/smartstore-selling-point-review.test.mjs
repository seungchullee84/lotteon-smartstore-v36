import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';import os from 'node:os';import {reviewSellingPoints,saveOfficialImagePointReview,officialPointSource} from '../smartstore-selling-point-review.mjs';
const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',name:'공식 의류'};
test('시각 확인한 소구점이 부족하면 현재 공식 원문의 다른 장점으로 보완한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'benefit-supplement-'));try{
 await writeFile(path.join(root,'detail.jpg'),'official-image');
 const first='부드러운 원단으로 편안한 착용감을 제공합니다.';
 const points=[{title:'부드러운 착용감',description:'부드러운 원단으로 편안한 착용감.',evidence:first}];
 const saved=await saveOfficialImagePointReview(product,root,{text:first,points,dataRoot:root});
 const source=first+' 허리 스트링으로 둘레를 조절할 수 있습니다. 옆면 포켓으로 수납성을 높였습니다.';
 const result=await reviewSellingPoints(product,source,{dataRoot:root,detailHash:saved.detailHash});
 assert.equal(result.status,'ready');assert.equal(result.points.length,3);assert.deepEqual(result.points[0],points[0]);assert(result.points.every(p=>source.includes(p.evidence)));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('구매 장점 기준 이전의 준비 완료 캐시도 모든 품번에서 다시 검증한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'benefit-cache-'));try{
 const source='슬림핏 레글러핏 루즈핏. 부드러운 원단으로 편안한 착용감을 제공합니다.';
 for(const style of ['123456','654321','456789']){
  const p={...product,style},dir=path.join(root,'smartstore-details',style);await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'selling-point-review.json'),JSON.stringify({version:5,method:'local-official-text',style,sourceUrl:p.sourceUrl,textHash:createHash('sha256').update(source).digest('hex'),detailHash:null,status:'ready',points:[{title:'핏과 실루엣',description:'슬림핏 레글러핏 루즈핏.',evidence:'슬림핏 레글러핏 루즈핏.'}]}));
  const result=await reviewSellingPoints(p,source,{dataRoot:root});assert.equal(result.version,10);assert.equal(result.points.length,1);assert.equal(result.points[0].title,'부드러운 착용감');
 }
 }finally{await rm(root,{recursive:true,force:true});}
});
test('본문에 특징이 있어도 모든 품번의 공식 이미지 문장을 먼저 확인하고 네 특징을 보존한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'all-image-points-'));try{
 await writeFile(path.join(root,'detail.jpg'),'official-image-first');
 const imageText='특유의 부드러운 결감이 느껴지는 페이크 스웨이드 외피 원단 사용\n마이크로 볼타입 패딩 충전재를 풍성하게 채워 넣어 포근한 보온성 구현\n여유 있게 떨어지는 릴렉스 핏으로 감각적인 실루엣 완성\n소매 이밴드와 밑단 스트링 디테일로 자유로운 핏 조절 가능';
 let calls=0;const recognize=async()=>{calls++;return imageText;};
 for(const style of ['123456','654321','456789']){
  const p={...product,style,images:{detail:'https://www.giordano.co.kr/official.jpg'}};
  const options={dataRoot:root,recognize};const pageText='가벼운 원단의 경량 디자인으로 쾌적하게 착용합니다.';
  const [a,b]=await Promise.all([officialPointSource(p,root,pageText,options),officialPointSource(p,root,pageText,options)]);assert(a.imageChecked);assert.equal(a.text,b.text);assert(a.text.startsWith(imageText));
  const review=await reviewSellingPoints(p,a.text,{dataRoot:root,detailHash:a.detailHash});assert.equal(review.status,'ready');assert.equal(review.points.length,4);assert(review.points.every(point=>imageText.replace(/\s/g,'').includes(point.evidence.replace(/\s/g,''))));
  await officialPointSource(p,root,pageText,options);
 }
 assert.equal(calls,3,'동시 미리보기와 재확인은 같은 이미지의 OCR을 재사용');
 await writeFile(path.join(root,'detail.jpg'),'official-image-updated');await officialPointSource({...product,images:{detail:'official'}},root,'본문',{dataRoot:root,recognize});assert.equal(calls,4);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('공식 이미지 시각 확인은 품번·공식 주소·이미지 해시가 일치할 때만 짧은 본문보다 우선한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'image-points-'));try{
 await writeFile(path.join(root,'detail.jpg'),'official-image-v1');
 const text='특유의 부드러운 결감이 느껴지는 페이크 스웨이드 외피 원단 사용';
 const points=[{title:'부드러운 스웨이드 결감',description:'부드러운 결감의 페이크 스웨이드 외피.',evidence:text}];
 const record=await saveOfficialImagePointReview(product,root,{text,points,dataRoot:root});
 for(const source of ['','공식 상품명과 소재만 있는 짧은 설명']){const reviewed=await reviewSellingPoints(product,source,{dataRoot:root,detailHash:record.detailHash});assert.equal(reviewed.status,'needs-review');assert.equal(reviewed.method,'visual-official-detail');assert.deepEqual(reviewed.points,points);}
 for(const [p,detailHash] of [[product,'changed-image'],[{...product,sourceUrl:product.sourceUrl+'-changed'},record.detailHash],[{...product,style:'654321'},record.detailHash]]){const reviewed=await reviewSellingPoints(p,'상품명만 확인됨',{dataRoot:root,detailHash});assert.equal(reviewed.status,'needs-review');assert.equal(reviewed.points.length,0);}
 await assert.rejects(saveOfficialImagePointReview(product,root,{text:'면 100%',points,dataRoot:root}),/원문/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('별도 API 없이 상의·하의·아우터·원피스·스커트 원문을 공통 처리하고 네트워크를 호출하지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'local-points-'));try{for(const source of [
 '부드러운 원단으로 편안한 착용감을 제공합니다. 여유로운 핏으로 자연스럽게 떨어집니다. 소매 자수 디테일을 더했습니다.',
 '허리 스트링으로 둘레를 조절할 수 있습니다. 넉넉한 핏으로 편안하게 착용합니다. 옆면 포켓으로 수납성을 높였습니다.',
 '가벼운 소재로 쾌적하게 착용합니다. 넉넉한 실루엣으로 편안하게 착용합니다. 뒷면 단추로 여밈을 조절할 수 있습니다.',
 '부드러운 원단을 사용했습니다. 여유로운 A라인 실루엣으로 연출합니다. 소매 셔링 디테일을 더했습니다.',
 '탄탄한 소재를 사용했습니다. 자연스럽게 넓어지는 플레어 실루엣입니다. 옆면 지퍼로 여밈을 조절합니다.'
 ]){const result=await reviewSellingPoints(product,source,{dataRoot:root,fetchImpl:()=>assert.fail('소구점에 API 호출 금지')});assert.equal(result.status,result.points.length>=3?'ready':'needs-review');assert(result.points.length>=2&&result.points.length<=3);assert.equal(result.method,'local-official-text');assert(result.points.every(p=>source.includes(p.evidence)&&p.title.length<=18&&p.description.length<=42));assert(result.points.every(p=>!/^(원단|핏과 실루엣|디자인 포인트|스타일링)$/.test(p.title)));
 const cached=await reviewSellingPoints(product,source,{dataRoot:root});assert.deepEqual(cached.points,result.points);}
 }finally{await rm(root,{recursive:true,force:true});}});
test('근거 없는 품목·혼용률·색상수나 빈 원문에는 장점을 추정하지 않고 과거 결과도 넘기지 않는다',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'local-invalid-'));try{
 await reviewSellingPoints(product,'뒷면 단추로 여밈을 조절할 수 있습니다.',{dataRoot:root});
 for(const source of ['', '원피스. 면 100%. 4 COLORS. SIZE S M L.', '현재 상품에는 단추 여밈이 없습니다.']){const result=await reviewSellingPoints(product,source,{dataRoot:root});assert.equal(result.status,'needs-review');assert.equal(result.points.length,0);assert(!/연결|API/.test(result.message));}
 }finally{await rm(root,{recursive:true,force:true});}});
