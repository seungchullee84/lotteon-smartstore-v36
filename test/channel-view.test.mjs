import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

test('선택한 채널의 사진·미리보기만 요청하고 전환해도 입력값과 단일 갱신 루프를 유지한다',async()=>{
 const product={style:'326933',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=current',rawName:'후드 집업',name:'여성 후드 집업 326933',smartstoreName:'지오다노 여성 후드 집업 26933',smartstoreNameUserEdited:true,gender:'여성',consumerPrice:59800,colors:['01블랙'],sizes:['S'],material:'면 100%',country:'베트남',washing:'손세탁',manufactured:'2026-07',keywords:'지오다노',category:{},warnings:[],images:{main:'https://www.giordano.co.kr/main.jpg',detail:'https://www.giordano.co.kr/detail.jpg',extra1:'https://www.giordano.co.kr/extra.jpg'}};
 const requests=[],errors=[];let slowSmartstore=false;
 const reply=(res,data)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');requests.push(url.pathname+url.search);
  if(url.pathname==='/api/state'){
   const smart=url.searchParams.get('channel')==='smartstore';if(smart&&slowSmartstore)await new Promise(resolve=>setTimeout(resolve,250));
   return reply(res,{product,revision:1,busy:false,phase:'done',logs:[],capabilities:{manualTags:true},smartstoreListing:smart?{sourceNames:['1.jpg','side.jpg'],mainColor:'01블랙',extraColors:['01블랙'],extraRoles:['side'],detailRevision:'one'}:null,tagResearch:smart?{configured:true,count:1,candidates:[{id:'1',name:'여성후드집업'}]}:null});
  }
  if(url.pathname==='/api/naver-status')return reply(res,{configured:false});
  if(url.pathname==='/api/branding')return reply(res,{visible:false});
  if(req.method==='POST'){res.statusCode=503;return reply(res,{error:'테스트: 외부 조회 생략'});}
  const files={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/website-daily.js':'public/website-daily.js','/detail-preview.js':'public/detail-preview.js','/two-choice.js':'public/two-choice.js'};
  if(files[url.pathname]){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html');return res.end(await readFile(new URL('../'+files[url.pathname],import.meta.url)));}
  if(url.pathname==='/smartstore-detail-preview.html'){res.setHeader('Content-Type','text/html');return res.end('<p>스마트스토어 미리보기</p>');}
  if(url.pathname.startsWith('/image/')||url.pathname.startsWith('/smartstore-listing/')||url.pathname.endsWith('.png')){res.setHeader('Content-Type','image/png');return res.end(await readFile(new URL('../public/giordano-official-logo.png',import.meta.url)));}
  res.statusCode=404;res.end();
 }catch(error){res.statusCode=500;res.end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#review').waitFor({state:'visible'});assert.equal(requests.some(r=>r.startsWith('/smartstore-detail-preview.html')),false);
  await page.locator('[name="material"]').fill('직접 수정 소재');await page.locator('#channelSmartstore').click();
  await page.waitForFunction(()=>document.querySelector('#main').getAttribute('src')?.startsWith('/smartstore-listing/main'));
  assert.equal(await page.locator('#detailPreview iframe').count(),1);assert.equal(await page.locator('#originalExtraPreviews').isVisible(),false);
  const lotteImages=requests.filter(r=>r.startsWith('/image/main')||r.startsWith('/image/extra')).length;
  await page.waitForResponse(r=>r.url().includes('/api/state?channel=smartstore'));
  assert.equal(requests.filter(r=>r.startsWith('/image/main')||r.startsWith('/image/extra')).length,lotteImages,'스마트스토어를 표시하는 동안 롯데 대표·추가 이미지를 요청하지 않음');
  assert.equal(requests.filter(r=>r.startsWith('/smartstore-detail-preview.html')).length,1,'같은 미리보기를 반복 생성하지 않음');
  await page.locator('#channelLotte').click();await page.waitForFunction(()=>document.body.dataset.channel==='lotte'&&!document.querySelector('#detailPreview iframe'));
  assert.equal(await page.locator('#smartstoreListingExtras img').count(),0);assert.equal(await page.locator('[name="material"]').inputValue(),'직접 수정 소재');
  slowSmartstore=true;const inFlight=page.waitForRequest(r=>r.url().includes('/api/state?channel=smartstore'));await page.locator('#channelSmartstore').click();await inFlight;await page.locator('#channelLotte').click();
  await page.waitForResponse(r=>r.url().includes('/api/state?channel=lotte'));
  assert.equal(await page.locator('#detailPreview iframe').count(),0,'늦게 도착한 비활성 채널 응답을 무시');assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
