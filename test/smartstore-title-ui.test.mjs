import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createNaverTitleOptimizer} from '../naver-title.mjs';
import {smartstorePlan} from '../smartstore-form.mjs';

test('전용 상품명·API 조회·실패·키 설정 UI가 롯데ON 값과 저장 정책을 보존',async()=>{
 const product={style:'356956',rawName:'남성 아가일 브이넥 니트',name:'남성 아가일 브이넥 니트 356956',gender:'남성',consumerPrice:59800,colors:['01블랙'],sizes:['M'],material:'면 100%',country:'베트남',washing:'손세탁',manufactured:'2026-08',keywords:'지오다노,남성니트',category:{},images:{detail:'https://www.giordano.co.kr/detail.jpg'},warnings:[]};
 let fail=false,submitted=null,settings=null;
 const optimize=createNaverTitleOptimizer({clock:()=>new Date('2026-10-22T16:00:00Z'),fetchImpl:async(_,config)=>{
  const request=JSON.parse(config.body);return Response.json({...request,results:request.keywordGroups.map(g=>({title:g.groupName,keywords:g.keywords,data:[{period:request.endDate,ratio:({남성니트:20,남자니트:80,브이넥니트:100,아가일니트:30})[g.groupName]||10}]}))});
 }});
 const respond=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/state')return respond(res,{busy:false,phase:'done',logs:[],revision:1,product});
   if(url.pathname==='/api/branding')return respond(res,{visible:true,maker:'L.S.C',date:'2026-10-18'});
   if(url.pathname==='/api/naver-status')return respond(res,{configured:false});
   if(req.method==='POST'){
    let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
    assert.equal(body.channel,'smartstore');
    if(url.pathname==='/api/naver-settings'){settings=body;return respond(res,{configured:true});}
    if(url.pathname==='/api/smartstore-optimize-title'){
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
  const lotte=await page.locator('input[name="name"]').inputValue();
  await page.locator('#smartstoreOptimizeTitle').click();
  await page.waitForFunction(()=>document.getElementById('smartstoreName').value==='지오다노 남자 브이넥 아가일 니트 356956');
  assert.equal(await page.locator('input[name="name"]').inputValue(),lotte);
  assert.equal(await page.locator('textarea[name="keywords"]').inputValue(),product.keywords);
  assert.match(await page.locator('#naverTitleResult').innerText(),/2026-09-25 ~ 2026-10-22/);
  assert.equal(await page.locator('#naverTitleCandidates li').count(),4);
  await page.locator('#channelLotte').click();assert.equal(await page.locator('#smartstoreName').isVisible(),false);
  await page.locator('#channelSmartstore').click();
  await page.locator('#smartstoreTest').click();
  await page.waitForFunction(()=>document.getElementById('clickFeedback').textContent.includes('입력 테스트 시작'));
  assert.equal(submitted.product.name,lotte);assert.equal(submitted.product.smartstoreName,'지오다노 남자 브이넥 아가일 니트 356956');
  assert.equal(submitted.save,undefined);assert.equal(submitted.finalize,undefined);
  fail=true;await page.locator('#smartstoreOptimizeTitle').click();
  await page.waitForFunction(()=>document.getElementById('naverTitleResult').textContent.includes('조회 실패'));
  assert.equal(await page.locator('#smartstoreName').inputValue(),'지오다노 남자 브이넥 아가일 니트 356956');
  await page.locator('#naverSettings').click();await page.locator('#naverClientId').fill('fake-id');await page.locator('#naverClientSecret').fill('fake-secret');
  await page.locator('#naverSettingsForm button[type="submit"]').click();
  await page.waitForFunction(()=>!document.getElementById('naverSettingsDialog').open);
  assert.equal(settings.clientSecret,'fake-secret');assert.equal(await page.locator('#naverClientSecret').inputValue(),'');
  assert.doesNotMatch(await page.locator('body').innerText(),/fake-secret/);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
