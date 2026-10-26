import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('선택 아이콘은 기본1·전환2를 미리보기/저장/상세교체/시작에 동일하게 전달한다',async()=>{
 const product={style:'326932',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',rawName:'후드 풀오버',name:'여성 후드 풀오버 326932',smartstoreName:'지오다노 여성 기모 테리 후드티 326932',smartstoreNameUserEdited:true,gender:'여성',consumerPrice:54800,colors:['01블랙'],sizes:['S'],material:'면 혼방',country:'베트남',manufactured:'2026-07',washing:'손세탁',keywords:'지오다노',category:{},warnings:[],images:{detail:'https://example.com/detail.jpg'}};
 let revision=1;const requests=[];const reply=(res,data)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/state')return reply(res,{product,revision,busy:false,phase:'done',logs:[],capabilities:{manualTags:true},tagResearch:{configured:false}});
 if(url.pathname==='/api/naver-status')return reply(res,{configured:false});if(url.pathname==='/api/branding')return reply(res,{visible:false});
 if(req.method==='POST'){let data='';for await(const chunk of req)data+=chunk;const body=JSON.parse(data||'{}');requests.push({path:url.pathname,body});if(url.pathname==='/api/smartstore-template'){assert.equal(body.style,product.style);assert.equal(body.channel,'smartstore');product.detailTemplate=body.detailTemplate;revision++;}return reply(res,{ok:true});}
 const files={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/smartstore-title.mjs':'smartstore-title.mjs'};
 if(files[url.pathname]){res.setHeader('Content-Type',url.pathname==='/'?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(await readFile(new URL('../'+files[url.pathname],import.meta.url)));}
 if(url.pathname==='/smartstore-detail-preview.html'){res.setHeader('Content-Type','text/html');return res.end('<p>미리보기</p>');}
 if(url.pathname.startsWith('/image/')||url.pathname==='/giordano-official-logo.png'){res.setHeader('Content-Type','image/png');return res.end(await readFile(new URL('../public/giordano-official-logo.png',import.meta.url)));}
 res.writeHead(404);res.end();
 }catch(error){res.writeHead(500);res.end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#channelSmartstore').click();await page.locator('#review').waitFor({state:'visible'});
 assert.equal(await page.locator('#smartstoreTemplate1').getAttribute('aria-pressed'),'true');
 await page.locator('#smartstoreTemplate2').click();try{await page.waitForFunction(()=>document.querySelector('#smartstoreTemplate2').getAttribute('aria-pressed')==='true');}catch(error){assert.fail(JSON.stringify({errors,requests:requests.map(r=>({path:r.path,template:r.body.detailTemplate})),message:await page.locator('#error').innerText(),selected:await page.locator('#smartstoreTemplate2').getAttribute('aria-pressed')}));}
 const fields=JSON.parse(new URL(await page.locator('#detailPreview iframe').getAttribute('src'),'http://localhost').searchParams.get('fields'));assert.equal(fields.detailTemplate,2);
 for(const [button,path] of [['saveDetailImages','/api/save-detail-images'],['smartstoreDetailOnly','/api/smartstore-detail-only'],['smartstoreStart','/api/smartstore-auto']]){
  await page.waitForFunction(id=>!document.getElementById(id).disabled,button);await Promise.all([page.waitForResponse(r=>r.url().endsWith(path)),page.locator('#'+button).click()]);const sent=requests.findLast(r=>r.path===path).body;assert.equal(sent.product?.detailTemplate??sent.detailTemplate,2);
 }
 await page.waitForFunction(()=>!document.querySelector('#smartstoreTemplate1').disabled);await page.locator('#smartstoreTemplate1').click();await page.waitForFunction(()=>document.querySelector('#smartstoreTemplate1').getAttribute('aria-pressed')==='true');assert.equal(product.detailTemplate,1);
 await page.locator('#channelLotte').click();assert.equal(await page.locator('#smartstoreTemplatePicker').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
