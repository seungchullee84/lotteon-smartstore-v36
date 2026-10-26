import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {runSmartstoreAuto} from '../smartstore-auto.mjs';
import {validateAnalysis,requestSmartstoreAnalysis,officialDescription,prepareSmartstoreAuto} from '../smartstore-auto-prepare.mjs';
import {smartstoreUploadParts} from '../smartstore-detail-upload.mjs';
import {requireChannel} from '../channel-routing.mjs';
import {loadSmartstoreAIKey,saveSmartstoreAIKey} from '../smartstore-ai-settings.mjs';
import {prepareVideo} from './helpers/brand-video.mjs';
const product={style:'375908',name:'여성 경량 패딩 375908',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',colors:['02화이트','05블랙'],images:{detail:'https://www.giordano.co.kr/_gio_on/2025/05375908.jpg'}};
const description='가벼운 나일론 원단을 사용한 경량 패딩입니다.';
test('수집·사진대조·합성·상세생성 성공 후에만 업로드 완료를 알린다',async()=>{
 const order=[];const deps={input:'375908',apiKey:'test',includeMain:true,preflight:async()=>order.push('login'),collect:async()=>{order.push('collect');return {product,folder:'current'};},prepare:async p=>{order.push('prepare');return p;},synthesize:async()=>{order.push('compose');return 'main.jpg';},render:async()=>{order.push('detail');return 'detail.png';},upload:async()=>{order.push('upload');return {detailUploaded:true};}};
 const result=await runSmartstoreAuto(deps);assert.deepEqual(order,['collect','prepare','login','compose','detail','upload']);assert.equal(result.published,false);
 order.length=0;await assert.rejects(runSmartstoreAuto({...deps,apiKey:''}),/API/);assert.deepEqual(order,[]);
 order.length=0;await assert.rejects(runSmartstoreAuto({...deps,synthesize:async()=>{throw Error('failed');}}),/failed/);assert.deepEqual(order,['collect','prepare','login']);
 await assert.rejects(runSmartstoreAuto({...deps,upload:async()=>({detailUploaded:false})}),/업로드 확인/);
});

test('복사등록 창이 없어도 사진 준비와 미리보기 반영은 먼저 마치며 판매자 업로드는 하지 않는다',async()=>{
 const order=[];
 await assert.rejects(runSmartstoreAuto({input:'375908',collect:async()=>{order.push('collect');return {product,folder:'current'};},prepare:async p=>{order.push('prepare');return {...p,smartstoreDetail:{photoCount:3}};},onPrepared:async p=>{assert.equal(p.smartstoreDetail.photoCount,3);order.push('preview');},preflight:async()=>{order.push('login');throw Error('복사등록 창 없음');},render:async()=>assert.fail('렌더링은 로그인 확인 이후'),upload:async()=>assert.fail('업로드 금지')}),/복사등록/);
 assert.deepEqual(order,['collect','prepare','preview','login']);
});
test('중단 이후 다음 단계와 업로드를 실행하지 않는다',async()=>{
 const controller=new AbortController();let uploads=0;
 await assert.rejects(runSmartstoreAuto({apiKey:'test',signal:controller.signal,preflight:async()=>{},collect:async()=>({product,folder:'.'}),prepare:async()=>{controller.abort();return product;},synthesize:async()=>assert.fail('must not synthesize'),render:async()=>assert.fail('must not render'),upload:async()=>uploads++}),/abort/i);
 assert.equal(uploads,0);assert.throws(()=>requireChannel('smartstore-auto','lotte'));assert.equal(requireChannel('smartstore-auto','smartstore'),'smartstore');
});
test('불확실한 색상·다른 상품·소구점 근거 누락을 업로드 전에 차단한다',()=>{
 const good={points:[{title:'경량',description:'가벼운 나일론 원단.',evidence:'가벼운 나일론 원단'}],photos:[{id:'one',color:'05블랙',confidence:.95,sameProduct:true,role:'front'}]};
 assert.equal(validateAnalysis(good,product,description,[{id:'one'}]),good);
 for(const patch of [{confidence:.7},{sameProduct:false},{color:'99다른색'},{confidence:NaN}])assert.throws(()=>validateAnalysis({...good,photos:[{...good.photos[0],...patch}]},product,description,[{id:'one'}]));
 assert.throws(()=>validateAnalysis({...good,points:[{...good.points[0],evidence:'확인되지 않은 모달 소재'}]},product,description,[{id:'one'}]));
});
test('API 오류는 원격 본문의 인증정보를 그대로 출력하지 않는다',async()=>{
 await assert.rejects(requestSmartstoreAnalysis({apiKey:'private',content:[],fetchImpl:async()=>new Response('private',{status:401})}),e=>!/private/.test(e.message)&&/키/.test(e.message));
});
test('업로드용 조각은 브랜드 소개·본문을 빠짐없이 보존하며 한 장 원본을 유지한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-parts-'));try{
 const png=path.join(root,'long.png'),brand=path.join(root,'brand.jpg');
 await sharp({create:{width:860,height:18500,channels:3,background:'#eee'}}).png().toFile(png);
 await sharp({create:{width:860,height:1173,channels:3,background:'#ddd'}}).jpeg().toFile(brand);
 const {files}=await smartstoreUploadParts(png,root,brand,await prepareVideo(root));let height=0;
 for(const file of files){const m=await sharp(file).metadata();assert.equal(m.width,860);height+=m.height;assert.ok((await readFile(file)).length<20000000);}
 assert.equal(files.length,2);assert.equal(height,18500);assert.equal((await sharp(png).metadata()).height,18500);
 assert.ok((await sharp(files[1]).metadata()).height>8000,'상품 본문은 8000px을 넘어도 한 장 유지');
 const noVideo=await smartstoreUploadParts(png,root,brand,{includeVideo:false});
 assert.equal(noVideo.includeVideo,false);assert.equal(noVideo.video,null);assert.deepEqual(noVideo.files,files);
 const expanded=await smartstoreUploadParts(png,root,brand,{...await prepareVideo(root),brandIntroHeight:1800});
 assert.equal((await sharp(expanded.files[0]).metadata()).height,1888,'확장된 브랜드 소개와 영상 제목 뒤에서 분할');
 const joinedFooter=await smartstoreUploadParts(png,root,brand,{includeVideo:false,footerTop:10000});
 assert.equal((await sharp(joinedFooter.files.at(-1)).metadata()).height,8500,'구매 혜택부터 맨 아래까지 8000px을 넘어도 한 장 유지');
 assert.deepEqual(await sharp(joinedFooter.files.at(-1)).raw().toBuffer(),await sharp(png).extract({left:0,top:10000,width:860,height:8500}).raw().toBuffer());
 let joinedHeight=0;for(const file of joinedFooter.files)joinedHeight+=(await sharp(file).metadata()).height;assert.equal(joinedHeight,18500);
 const bannerFooter=await smartstoreUploadParts(png,root,brand,{includeVideo:false,bannerTop:9400,footerTop:10000});
 const sectioned=await smartstoreUploadParts(png,root,brand,{includeVideo:false,officialTop:6000,bannerTop:9400,footerTop:10000});assert.equal(sectioned.files.length,5);assert.equal(sectioned.footerIndex,4);assert.equal(sectioned.bannerLink.index,3);assert.equal((await sharp(sectioned.files[2]).metadata()).height,3400);assert.deepEqual(await sharp(sectioned.files[2]).raw().toBuffer(),await sharp(png).extract({left:0,top:6000,width:860,height:3400}).raw().toBuffer());
 assert.equal(bannerFooter.files.length,4);assert.equal(bannerFooter.bannerLink.index,2);
 assert.equal((await sharp(bannerFooter.files.at(-2)).metadata()).height,600);
 assert.equal((await sharp(bannerFooter.files.at(-1)).metadata()).height,8500);
 assert.deepEqual(await sharp(bannerFooter.files.at(-2)).raw().toBuffer(),await sharp(png).extract({left:0,top:9400,width:860,height:600}).raw().toBuffer());
 await assert.rejects(smartstoreUploadParts(png,root,brand,{includeVideo:false,footerTop:19000}),/구간/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('사진 내용이 같으면 재실행 시 확인된 색상을 유지하고 공식 품번은 다시 검증한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-analysis-'));
 try{
  const folder=path.join(root,'product'),pictures=path.join(root,'photos'),dataRoot=path.join(root,'data');await mkdir(folder);await mkdir(pictures);await mkdir(dataRoot);
  const jpg=await sharp({create:{width:180,height:240,channels:3,background:'#454'}}).jpeg({quality:88}).toBuffer();await writeFile(path.join(folder,'detail.jpg'),jpg);await writeFile(path.join(pictures,'1.jpg'),jpg);await writeFile(path.join(pictures,'side.jpg'),await sharp({create:{width:180,height:240,channels:3,background:'#455'}}).jpeg().toBuffer());
  const photoCounts=[];
  const fetchImpl=async(url,request)=>{
   if(url===product.sourceUrl)return new Response('<body>STYLE. 05375908<div class="prd_detail_content_gio">'+description+'</div></body>');
   assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(request.body);assert.equal(body.store,false);
   const supplied=JSON.parse(body.input[0].content[0].text);photoCounts.push(supplied.photoIds.length);
   const analysis={attributes:{sleeve:'긴팔',neckline:'스텐드/차이나칼라',evidence:'공식 상세 사진의 소매·칼라 확인'},points:[{title:'경량',description:'가벼운 나일론 원단.',evidence:'가벼운 나일론 원단'}],photos:supplied.photoIds.map((id,i)=>({id,color:'05블랙',confidence:.99,sameProduct:true,role:i===0?'front':'side'}))};
   return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(analysis)}]}]});
  };
  const draftFile=path.join(dataRoot,'smartstore-details',product.style,'draft.json');
  for(let i=0;i<2;i++){const prepared=await prepareSmartstoreAuto(product,folder,{trustFolder:false,dataRoot,apiKey:'private',photoRoots:[pictures],fetchImpl});assert.equal(prepared.smartstoreDetail.photoCount,2);assert.ok(prepared.smartstoreDetail.colorImages['05블랙']);if(i===0){const draft=JSON.parse(await readFile(draftFile));await writeFile(draftFile,JSON.stringify({...draft,includeBrandVideo:false}));}else assert.equal(prepared.smartstoreDetail.includeBrandVideo,true);}
  assert.deepEqual(photoCounts,[2]);assert.throws(()=>officialDescription('<body>STYLE. 05326920</body>',product),/품번/);
  await writeFile(path.join(folder,'detail.jpg'),await sharp({create:{width:180,height:240,channels:3,background:'#678'}}).jpeg().toBuffer());
  const reanalysed=await prepareSmartstoreAuto(product,folder,{trustFolder:false,dataRoot,apiKey:'private',photoRoots:[pictures],fetchImpl});
  assert.equal(reanalysed.smartstoreDetail.includeBrandVideo,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Windows API 연결은 평문 대신 현재 사용자 암호화로 저장한다',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-api-settings-'));const prior=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{const key='sk-'+'a'.repeat(24);await saveSmartstoreAIKey(root,key);assert.equal(await loadSmartstoreAIKey(root),key);const file=await readFile(path.join(root,'smartstore-ai-settings.json'),'utf8');assert.ok(!file.includes(key));assert.ok(JSON.parse(file).encryptedKey.length>40);}
 finally{if(prior!==undefined)process.env.OPENAI_API_KEY=prior;await rm(root,{recursive:true,force:true});}
});
test('채팅에서 원본 바이트로 확인한 사진은 변환 해시 없이도 옆면 역할을 유지하고 API 없이 재사용한다',async()=>{
 const {createHash}=await import('node:crypto');const digest=b=>createHash('sha256').update(b).digest('hex');const root=await mkdtemp(path.join(os.tmpdir(),'human-photo-'));
 try{
 const folder=path.join(root,'collected'),photos=path.join(root,'originals'),dataRoot=path.join(root,'data'),draftRoot=path.join(dataRoot,'smartstore-details',product.style);
 for(const dir of [folder,photos,draftRoot])await mkdir(dir,{recursive:true});
 const front=await sharp({create:{width:180,height:240,channels:3,background:'#123'}}).jpeg().toBuffer(),side=await sharp({create:{width:180,height:240,channels:3,background:'#456'}}).jpeg().toBuffer();
 await writeFile(path.join(folder,'detail.jpg'),front);await writeFile(path.join(folder,'smartstore-official.html'),'<body>STYLE. 05375908<div class="prd_detail_content_gio">'+description+'</div></body>');
 for(const [name,bytes]of [['1.jpg',front],['side.jpg',side]]){await writeFile(path.join(photos,name),bytes);await writeFile(path.join(draftRoot,name),bytes);}
 const draft={style:product.style,sourceUrl:product.sourceUrl,officialDetailHash:digest(front),photos:[{color:'05블랙',files:['1.jpg','side.jpg']}],sellingPoints:[{title:'경량',description:'가벼운 원단',evidence:description}],photoMapping:{files:[{hash:digest(front),color:'05블랙',role:'front'},{hash:digest(side),color:'05블랙',role:'side'}]}};
 await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify(draft));
 const p=await prepareSmartstoreAuto(product,folder,{trustFolder:false,dataRoot,photoRoots:[photos],fetchImpl:()=>{throw Error('API를 호출하면 안 됨');}});
 const saved=JSON.parse(await readFile(path.join(draftRoot,'draft.json'),'utf8'));assert.equal(saved.listingImages.extras.length,1);assert.equal(saved.listingImages.extras[0].role,'side');assert.equal(p.smartstoreDetail.photoCount,2);assert.equal(saved.sellingPoints[0].evidence,description);assert.equal(saved.sellingPoints[0].title,'가볍게, 부담 없이');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('첫 품번도 사진을 자동 분석해 저장하고 상세 최대 컷을 넘는 사진까지 다음 시작에서 재사용한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'all-style-photos-'));try{
  const folder=path.join(root,'product'),photos=path.join(root,'photos'),dataRoot=path.join(root,'data');await mkdir(folder);await mkdir(photos);await mkdir(dataRoot);
  await writeFile(path.join(folder,'detail.jpg'),await sharp({create:{width:80,height:100,channels:3,background:'#eee'}}).jpeg().toBuffer());
  await writeFile(path.join(folder,'smartstore-official.html'),'<body>STYLE. 05375908<div class="prd_detail_content_gio">'+description+'</div></body>');
  for(let i=0;i<4;i++)await writeFile(path.join(photos,i===0?'1.jpg':'date-'+i+'.jpg'),await sharp({create:{width:80,height:100,channels:3,background:['#123','#234','#345','#456'][i]}}).jpeg().toBuffer());
  let calls=0;const fetchImpl=async(_,request)=>{calls++;const body=JSON.parse(request.body),input=JSON.parse(body.input[0].content[0].text);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({attributes:{sleeve:'긴팔',neckline:'스텐드/차이나칼라',evidence:'공식·실사 사진 대조'},points:[{title:'경량',description:'가벼운 나일론 원단.',evidence:'가벼운 나일론 원단'}],photos:input.photoIds.map((id,i)=>({id,color:'05블랙',role:i===0?'front':'detail',sameProduct:true,confidence:1}))})}]}]});};
  const options={trustFolder:false,dataRoot,photoRoots:[photos],apiKey:'test',fetchImpl};
  const first=await prepareSmartstoreAuto(product,folder,options);assert.equal(first.smartstoreDetail.photoCount,4);
  const draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));assert.equal(draft.photoMapping.files.length,4,'화면에 선택되지 않은 확인 사진도 해시별로 저장');
  const second=await prepareSmartstoreAuto(product,folder,options);assert.equal(second.smartstoreDetail.photoCount,4);assert.equal(calls,1,'같은 사진은 매번 다시 외부 분석하지 않음');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('새 사진이 있고 분석 연결만 없는 상태를 사진 없음과 구분한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'photo-analysis-required-'));try{
  const folder=path.join(root,'product'),photos=path.join(root,'photos'),dataRoot=path.join(root,'data');await mkdir(folder);await mkdir(photos);
  await writeFile(path.join(folder,'smartstore-official.html'),'<body>STYLE. 05375908<div class="prd_detail_content_gio">'+description+'</div></body>');
  const bytes=await sharp({create:{width:80,height:100,channels:3,background:'#123'}}).jpeg().toBuffer();await writeFile(path.join(folder,'detail.jpg'),bytes);await writeFile(path.join(photos,'1.jpg'),bytes);
  await assert.rejects(()=>prepareSmartstoreAuto(product,folder,{trustFolder:false,dataRoot,photoRoots:[photos],apiKey:''}),e=>e.code==='PHOTO_ANALYSIS_REQUIRED'&&e.photoCount===1&&e.unknownCount===1);
 }finally{await rm(root,{recursive:true,force:true});}
});
