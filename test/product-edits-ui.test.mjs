import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {createProductEditStore} from '../product-edits.mjs';

test('직접 수정 → 같은 품번 재수집 → 새로고침 → 시작에서 유지하고 다른 품번에 넘기지 않는다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'register-product-edits-ui-')),store=createProductEditStore(root);
 const base=style=>({style,sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+style,rawName:'공식 맨투맨',name:'남성 공식 맨투맨 '+style,gender:'남성',consumerPrice:32800,colors:['01틸그린'],sizes:['M','L'],material:'면 60%',country:'베트남',washing:'공식 손세탁',manufactured:'2026-09',keywords:'지오다노,공식키워드',images:{main:'official-main.jpg',detail:'official-detail.jpg'},category:{},warnings:[]});
 let current=base('026981'),revision=1,collections=0,startRequest,serverError=null;
 const reply=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/state')return reply(res,{busy:false,phase:'done',logs:[],revision,error:serverError,product:current});
  if(url.pathname==='/api/naver-status')return reply(res,{configured:false,researchConfigured:false});
  if(url.pathname==='/api/branding')return reply(res,{visible:false});
  if(req.method==='POST'){
   let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
   if(url.pathname==='/api/smartstore-template-headline'){await store.save({style:body.style,fields:{templateHeadline:body.title}},current.style);current.templateHeadline=body.title;return reply(res,{ok:true});}
   if(url.pathname==='/api/collect'){
    if(body.edits)await store.save(body.edits,current.style);
    current=await store.apply({...base(body.style),keywords:'지오다노,새 공식키워드',images:{main:'new-main-'+(++collections)+'.jpg',detail:'new-detail.jpg'}});revision++;return reply(res,{ok:true},202);
   }
   if(url.pathname==='/api/smartstore-auto'){startRequest=body;if(body.edits)await store.save(body.edits,current.style);return reply(res,{ok:true},202);}
   if(url.pathname==='/api/naver-keywords')return reply(res,{error:'비교 자료 없음'},503);
  }
  const files={'/':'public/index.html','/smartstore-template-headline.js':'public/smartstore-template-headline.js','/detail-preview.js':'public/detail-preview.js','/app.js':'public/app.js','/style.css':'public/style.css','/smartstore-title.mjs':'smartstore-title.mjs'};
  if(files[url.pathname]){res.setHeader('Content-Type',url.pathname==='/'?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(await readFile(new URL('../'+files[url.pathname],import.meta.url)));}
  if(url.pathname==='/smartstore-detail-preview.html'){res.setHeader('Content-Type','text/html');return res.end('<h1 data-template-main-title data-template-default-title="자동 제목">자동 제목</h1><p>현재 공식 상세</p>');}
  if(url.pathname.startsWith('/image/')||url.pathname==='/giordano-official-logo.png'){res.setHeader('Content-Type','image/png');return res.end(await readFile(new URL('../public/giordano-official-logo.png',import.meta.url)));}
  return reply(res,{error:'없는 경로'},404);
 }catch(error){reply(res,{error:error.message},400);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#form [name="name"]').fill('직접 고친 기본 상품명 026981');
  await page.locator('#channelSmartstore').click();
  const title='지오다노  직접 수정한 맨투맨 026981';await page.locator('#smartstoreName').fill(title);
  const headline='내가 쓴 제목\n따뜻한 하루 <strong>';await page.locator('#templateHeadline').fill(headline);await page.waitForFunction(()=>document.querySelector('#detailPreview iframe')?.contentDocument?.querySelector('h1')?.textContent.includes('내가 쓴 제목'));await page.waitForResponse(r=>r.url().endsWith('/api/smartstore-template-headline'));assert.equal(current.templateHeadline,headline);
  const edits={templateHeadline:headline,consumerPrice:'39900',material:'면 60%, 폴리에스터 40%',country:'한국',manufactured:'2026-10',washing:'중성세제 손세탁',colors:'01틸그린,04블랙',sizes:'L,XL'};
  for(const [key,value] of Object.entries(edits))await page.locator('#form [name="'+key+'"]').fill(value);
  const collect=async style=>{await page.locator('#style').fill(style);await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/collect')),page.locator('#collect').click()]);await page.waitForFunction(style=>document.querySelector('#source').textContent.includes(style),style);await page.waitForFunction(()=>!document.querySelector('#collect').disabled);};
  await collect('026981');await page.waitForFunction(()=>document.querySelector('#form [name="keywords"]').value==='지오다노,새 공식키워드');
  for(const [key,value] of Object.entries(edits))assert.equal(await page.locator('#form [name="'+key+'"]').inputValue(),value,key);
  assert.equal(await page.locator('#smartstoreName').inputValue(),title);assert.equal(current.images.main,'new-main-1.jpg');
  assert.equal(current.material,edits.material);assert.equal(current.consumerPrice,39900);
  await page.locator('#channelLotte').click();await page.locator('#form [name="keywords"]').fill('지오다노,직접수정');await page.locator('#channelSmartstore').click();
  await collect('026981'); // 비활성 롯데 키워드 상태는 갱신하지 않고 직접 입력값을 보존한다.
  assert.equal(await page.locator('#form [name="keywords"]').inputValue(),'지오다노,직접수정');
  await page.reload();await page.waitForFunction(title=>document.querySelector('#smartstoreName').value===title,title);
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/smartstore-auto')),page.locator('#smartstoreStart').click()]);
  assert.equal(startRequest.edits.fields.templateHeadline,headline);assert.equal(startRequest.selectedTitle.title,title);assert.equal(startRequest.edits.fields.material,edits.material);
  assert.equal((await store.apply(base('026981'))).consumerPrice,39900);
  await page.waitForFunction(()=>!document.querySelector('#collect').disabled);await collect('026982');
  assert.equal(await page.locator('#templateHeadline').inputValue(),'');assert.equal(await page.locator('#form [name="material"]').inputValue(),'면 60%');assert.equal(await page.locator('#form [name="country"]').inputValue(),'베트남');assert.notEqual(await page.locator('#smartstoreName').inputValue(),title);
  await collect('026981');await page.waitForFunction(title=>document.querySelector('#smartstoreName').value===title,title);
  assert.equal(await page.locator('#form [name="material"]').inputValue(),edits.material);await page.locator('#resetTemplateHeadline').click();await page.waitForFunction(()=>document.querySelector('#detailPreview iframe')?.contentDocument?.querySelector('h1')?.textContent==='자동 제목');assert.equal(await page.locator('#templateHeadline').inputValue(),'');await page.evaluate(()=>{const original=window.fetch;let fail=true;window.fetch=(...args)=>{if(fail&&String(args[0]).includes('/api/state?')){fail=false;return Promise.reject(new DOMException('signal timed out','TimeoutError'));}return original(...args);};});
  await page.waitForFunction(()=>document.querySelector('#error').textContent.includes('다시 확인 중'));await page.waitForFunction(()=>document.querySelector('#error').textContent==='');
  serverError='실제 등록 작업 오류';await page.waitForFunction(()=>document.querySelector('#error').textContent==='실제 등록 작업 오류');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
