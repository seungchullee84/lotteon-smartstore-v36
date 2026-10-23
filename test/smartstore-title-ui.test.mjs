import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createNaverTitleOptimizer} from '../naver-title.mjs';
import {smartstorePlan} from '../smartstore-form.mjs';

test('전용 상품명·API 조회·실패·키 설정 UI가 롯데ON 값과 저장 정책을 보존',async()=>{
 const product={style:'356956',rawName:'남성 아가일 브이넥 니트',name:'남성 아가일 브이넥 니트 356956',gender:'남성',consumerPrice:59800,colors:['01블랙'],sizes:['M'],material:'면 100%',country:'베트남',washing:'손세탁',manufactured:'2026-08',keywords:'지오다노,남성니트',category:{},images:{detail:'https://www.giordano.co.kr/detail.jpg'},warnings:[]};
 let fail=false,submitted=null,settings=null,configured=false,optimizeCalls=0,revision=1,currentProduct=product,keywordMode='fail';
 const optimize=createNaverTitleOptimizer({clock:()=>new Date('2026-10-22T16:00:00Z'),fetchImpl:async(_,config)=>{
  const request=JSON.parse(config.body);return Response.json({...request,results:request.keywordGroups.map(g=>({title:g.groupName,keywords:g.keywords,data:[{period:request.endDate,ratio:({남성니트:20,남자니트:80,브이넥니트:100,아가일니트:30})[g.groupName]||10}]}))});
 }});
 const respond=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/state')return respond(res,{busy:false,phase:'done',logs:[],revision,product:currentProduct});
   if(url.pathname==='/api/branding')return respond(res,{visible:true,maker:'L.S.C',date:'2026-10-18'});
   if(url.pathname==='/api/naver-status')return respond(res,{configured});
   if(req.method==='POST'){
    let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
    if(url.pathname.startsWith('/api/smartstore-'))assert.equal(body.channel,'smartstore');
    if(url.pathname==='/api/naver-keywords'){
     if(keywordMode==='fail')return respond(res,{error:'테스트: 기존 키워드 유지'},503);
     await new Promise(resolve=>setTimeout(resolve,200));
     return respond(res,{keywords:'지오다노,남자니트,브이넥니트',length:17,source:'테스트 데이터랩',period:{startDate:'2026-09-25',endDate:'2026-10-22'}});
    }
    if(url.pathname==='/api/naver-settings'){settings=body;configured=true;return respond(res,{configured:true});}
    if(url.pathname==='/api/smartstore-optimize-title'){
     optimizeCalls++;
     if(fail)return respond(res,{error:'테스트: API 연결 실패'},503);
     return respond(res,await optimize(body.product,{clientId:'fake-id',clientSecret:'fake-secret'}));
    }
    if(url.pathname==='/api/smartstore-test'){submitted=body;smartstorePlan(body.product,body.salePrice);return respond(res,{ok:true});}
   }
   const files={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/smartstore-title.mjs':'smartstore-title.mjs'};
   if(files[url.pathname]){res.setHeader('Content-Type',url.pathname==='/'?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(await readFile(new URL('../'+files[url.pathname],import.meta.url)));}
   if(url.pathname.startsWith('/image/')||url.pathname==='/giordano-official-logo.png'){res.setHeader('Content-Type','image/png');return res.end(await readFile(new URL('../public/giordano-official-logo.png',import.meta.url)));}
   res.writeHead(404);res.end();
  }catch(e){respond(res,{error:e.message},400);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#channelSmartstore').click();
  await page.waitForFunction(()=>document.getElementById('smartstoreName').value.includes('356956'));
  await page.waitForFunction(()=>document.getElementById('naverTitleResult').textContent.includes('처음 한 번'));
  assert.equal(optimizeCalls,0,'키가 없으면 자동 API 요청을 보내지 않음');
  const lotte=await page.locator('input[name="name"]').inputValue();
  await page.locator('#smartstoreOptimizeTitle').click();
  await page.waitForFunction(()=>document.getElementById('smartstoreName').value==='지오다노 남자 브이넥 아가일 니트 356956');
  assert.equal(await page.locator('input[name="name"]').inputValue(),lotte);
  assert.equal(await page.locator('textarea[name="keywords"]').inputValue(),product.keywords);
  assert.match(await page.locator('#naverTitleResult').innerText(),/2026-09-25 ~ 2026-10-22/);
  assert.equal(await page.locator('#naverTitleCandidates li').count(),4);
  await page.locator('#channelLotte').click();assert.equal(await page.locator('#smartstoreName').isVisible(),false);
  await page.locator('#channelSmartstore').click();
  const allowedTitle='지오다노 남자 브이넥 아가일 니트 남성브이넥니트 356956';
  await page.locator('#smartstoreName').fill(allowedTitle);
  await page.locator('#smartstoreTest').click();
  await page.waitForFunction(()=>document.getElementById('clickFeedback').textContent.includes('입력 테스트 시작'));
  assert.equal(submitted.product.name,lotte);assert.equal(submitted.product.smartstoreName,allowedTitle);
  assert.equal(submitted.save,undefined);assert.equal(submitted.finalize,undefined);
  await page.locator('#smartstoreName').fill('지오다노 남자 브이넥 아가일 니트 356956');
  fail=true;await page.locator('#smartstoreOptimizeTitle').click();
  await page.waitForFunction(()=>document.getElementById('naverTitleResult').textContent.includes('조회 실패'));
  assert.equal(await page.locator('#smartstoreName').inputValue(),'지오다노 남자 브이넥 아가일 니트 356956');
  fail=false;await page.locator('#naverConnectionMenu summary').click();await page.locator('#naverSettings').click();await page.locator('#naverClientId').fill('fake-id');await page.locator('#naverClientSecret').fill('fake-secret');
  await page.locator('#naverSettingsForm button[type="submit"]').click();
  await page.waitForFunction(()=>!document.getElementById('naverSettingsDialog').open);
  assert.equal(settings.clientSecret,'fake-secret');assert.equal(await page.locator('#naverClientSecret').inputValue(),'');
  await page.waitForFunction(()=>document.getElementById('naverTitleResult').textContent.includes('통합검색어 트렌드 API'));
  assert.equal(optimizeCalls,3,'최초 키 연결 직후 현재 상품에 자동 적용');
  await page.locator('#channelLotte').click();
  currentProduct={...product,style:'000000',name:'남성 아가일 브이넥 니트 000000'};revision++;
  await page.waitForFunction(()=>document.getElementById('smartstoreName').value.endsWith('000000'));
  assert.equal(optimizeCalls,3,'롯데ON 채널에서 새 상품을 수집해도 API 미호출');
  await page.locator('#channelSmartstore').click();
  await page.waitForFunction(()=>document.getElementById('smartstoreName').value==='지오다노 남자 브이넥 아가일 니트 000000');
  assert.equal(optimizeCalls,4,'스마트스토어 채널 진입 시 자동 조회');
  await page.locator('#channelLotte').click();await page.locator('#channelSmartstore').click();
  assert.equal(optimizeCalls,4,'같은 상품의 채널 왕복은 반복 조회하지 않음');
  currentProduct={...product};revision++;
  await page.waitForFunction(()=>document.getElementById('smartstoreName').value==='지오다노 남자 브이넥 아가일 니트 356956');
  assert.equal(optimizeCalls,5,'스마트스토어 채널에서 상품 수집 완료 후 자동 조회');
  await page.locator('#channelLotte').click();keywordMode='success';
  await page.locator('#naverKeywordRefresh').click();
  await page.waitForFunction(()=>document.querySelector('textarea[name="keywords"]').value==='지오다노,남자니트,브이넥니트');
  assert.match(await page.locator('#keywordStatus').innerText(),/쉼표 포함/);
  await page.locator('#naverKeywordRefresh').click();
  await page.locator('textarea[name="keywords"]').fill('지오다노,직접수정');
  await page.waitForFunction(()=>document.getElementById('keywordStatus').textContent.includes('자동 적용하지 않았습니다'));
  assert.equal(await page.locator('textarea[name="keywords"]').inputValue(),'지오다노,직접수정');
  currentProduct={...product,style:'376922',name:'여성 후드 숏 푸퍼 자켓 376922',gender:'여성'};revision++;
  await page.waitForFunction(()=>document.getElementById('smartstoreName').value==='지오다노 여성 후드 숏 패딩 자켓 376922');
  await page.locator('#channelSmartstore').click();
  await page.waitForFunction(()=>document.getElementById('naverTitleResult').textContent.includes('통합검색어 트렌드 API'));
  assert.equal(await page.locator('input[name="name"]').inputValue(),currentProduct.name);
  assert.equal(await page.locator('#smartstoreName').inputValue(),'지오다노 여성 후드 숏 패딩 자켓 376922');
  assert.doesNotMatch(await page.locator('body').innerText(),/fake-secret/);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
