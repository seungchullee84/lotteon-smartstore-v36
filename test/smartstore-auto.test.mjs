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
const product={style:'375908',name:'여성 경량 패딩 375908',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',colors:['02화이트','05블랙'],images:{detail:'https://www.giordano.co.kr/_gio_on/2025/05375908.jpg'}};
const description='가벼운 나일론 원단을 사용한 경량 패딩입니다.';
test('수집·사진대조·합성·상세생성 성공 후에만 업로드 완료를 알린다',async()=>{
 const order=[];const deps={input:'375908',apiKey:'test',includeMain:true,preflight:async()=>order.push('login'),collect:async()=>{order.push('collect');return {product,folder:'current'};},prepare:async p=>{order.push('prepare');return p;},synthesize:async()=>{order.push('compose');return 'main.jpg';},render:async()=>{order.push('detail');return 'detail.png';},upload:async()=>{order.push('upload');return {detailUploaded:true};}};
 const result=await runSmartstoreAuto(deps);assert.deepEqual(order,['login','collect','prepare','compose','detail','upload']);assert.equal(result.published,false);
 order.length=0;await assert.rejects(runSmartstoreAuto({...deps,apiKey:''}),/API/);assert.deepEqual(order,[]);
 order.length=0;await assert.rejects(runSmartstoreAuto({...deps,synthesize:async()=>{throw Error('failed');}}),/failed/);assert.deepEqual(order,['login','collect','prepare']);
 await assert.rejects(runSmartstoreAuto({...deps,upload:async()=>({detailUploaded:false})}),/업로드 확인/);
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
 const {files}=await smartstoreUploadParts(png,root,brand);let height=0;
 for(const file of files){const m=await sharp(file).metadata();assert.equal(m.width,860);height+=m.height;assert.ok((await readFile(file)).length<20000000);}
 assert.equal(files.length,4);assert.equal(height,18500);assert.equal((await sharp(png).metadata()).height,18500);
 const noVideo=await smartstoreUploadParts(png,root,brand,{includeVideo:false});
 assert.equal(noVideo.includeVideo,false);assert.equal(noVideo.video,null);assert.deepEqual(noVideo.files,files);
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
   const analysis={points:[{title:'경량',description:'가벼운 나일론 원단.',evidence:'가벼운 나일론 원단'}],photos:supplied.photoIds.map((id,i)=>({id,color:'05블랙',confidence:.99,sameProduct:true,role:i===0?'front':'side'}))};
   return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(analysis)}]}]});
  };
  const draftFile=path.join(dataRoot,'smartstore-details',product.style,'draft.json');
  for(let i=0;i<2;i++){const prepared=await prepareSmartstoreAuto(product,folder,{dataRoot,apiKey:'private',photoRoots:[pictures],fetchImpl});assert.equal(prepared.smartstoreDetail.photoCount,2);assert.ok(prepared.smartstoreDetail.colorImages['05블랙']);if(i===0){const draft=JSON.parse(await readFile(draftFile));await writeFile(draftFile,JSON.stringify({...draft,includeBrandVideo:false}));}else assert.equal(prepared.smartstoreDetail.includeBrandVideo,false);}
  assert.deepEqual(photoCounts,[2]);assert.throws(()=>officialDescription('<body>STYLE. 05326920</body>',product),/품번/);
  await writeFile(path.join(folder,'detail.jpg'),await sharp({create:{width:180,height:240,channels:3,background:'#678'}}).jpeg().toBuffer());
  const reanalysed=await prepareSmartstoreAuto(product,folder,{dataRoot,apiKey:'private',photoRoots:[pictures],fetchImpl});
  assert.equal(reanalysed.smartstoreDetail.includeBrandVideo,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Windows API 연결은 평문 대신 현재 사용자 암호화로 저장한다',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-api-settings-'));const prior=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{const key='sk-'+'a'.repeat(24);await saveSmartstoreAIKey(root,key);assert.equal(await loadSmartstoreAIKey(root),key);const file=await readFile(path.join(root,'smartstore-ai-settings.json'),'utf8');assert.ok(!file.includes(key));assert.ok(JSON.parse(file).encryptedKey.length>40);}
 finally{if(prior!==undefined)process.env.OPENAI_API_KEY=prior;await rm(root,{recursive:true,force:true});}
});
