import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('공식몰 링크·암호화 연결창·태그 검색/삭제/선택과 시작 전달이 한 화면에서 연결된다',async()=>{
 const product={style:'326932',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=current',rawName:'브러시드 테리 후드 풀오버',name:'여성 후드 풀오버 326932',smartstoreName:'지오다노 여성 기모 테리 후드티 326932',smartstoreNameUserEdited:true,gender:'여성',consumerPrice:54800,colors:['02그레이','03블랙'],sizes:['S','M'],material:'면 60%, 폴리에스터 40%',country:'베트남',manufactured:'2026-07',washing:'손세탁',keywords:'지오다노',category:{},warnings:[],images:{detail:'https://example.com/detail.jpg'}};
 let tags=[{id:'1',name:'여성후드티'},{id:'2',name:'기모후드티'}],manual=false,configured=false,selectedRequest,startRequest,autoRequest,validateRequest;const savedSelections=[];
 const reply=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/state')return reply(res,{product,revision:1,busy:false,phase:'done',logs:[],backgroundConfigured:configured,capabilities:{manualTags:true,photoAnalysisSettings:true},tagValidation:{style:product.style,tagCount:10,selectedTags:[{id:'999',name:'여성니트'}]},tagResearch:{configured:true,count:3,candidates:tags,manual,manualTags:manual?tags:undefined}});
  if(url.pathname==='/api/naver-status')return reply(res,{configured:false});if(url.pathname==='/api/branding')return reply(res,{visible:false});
  if(req.method==='POST'){
   let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
   if(url.pathname==='/api/naver-keywords')return reply(res,{error:'제공 키워드 유지'},503);
   if(url.pathname.startsWith('/api/smartstore-'))assert.equal(body.channel,'smartstore');
   if(url.pathname==='/api/smartstore-ai-settings'){assert(body.apiKey.startsWith('sk-'));configured=true;return reply(res,{configured:true});}
   if(url.pathname==='/api/smartstore-tags-search')return reply(res,{style:product.style,items:[{id:'1',name:'여성후드티',related:true},{id:'2',name:'기모후드티',related:true},{id:'3',name:'여성니트',related:false}],total:3,source:'조사자료 · 적용할 때 검색 재검증'});
   if(url.pathname==='/api/smartstore-tags-selection'){await new Promise(resolve=>setTimeout(resolve,80));tags=body.tags;manual=true;savedSelections.push(tags);return reply(res,{tags,saved:true});}
   if(url.pathname==='/api/smartstore-tags'){autoRequest=body;return reply(res,{ok:true},202);}
   if(url.pathname==='/api/smartstore-tags-validate'){validateRequest=body;return reply(res,{ok:true},202);}
   if(url.pathname==='/api/smartstore-tags-selected'){selectedRequest=body;tags=body.tags;manual=true;return reply(res,{ok:true},202);}
   if(url.pathname==='/api/smartstore-auto'){startRequest=body;return reply(res,{ok:true},202);}
  }
  const files={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/smartstore-title.mjs':'smartstore-title.mjs'};
  if(files[url.pathname]){res.setHeader('Content-Type',url.pathname==='/'?'text/html; charset=utf-8':url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(await readFile(new URL('../'+files[url.pathname],import.meta.url)));}
  if(url.pathname==='/smartstore-detail-preview.html'){res.setHeader('Content-Type','text/html');return res.end('<p>preview</p>');}
  if(url.pathname.startsWith('/image/')||url.pathname==='/giordano-official-logo.png'){res.setHeader('Content-Type','image/png');return res.end(await readFile(new URL('../public/giordano-official-logo.png',import.meta.url)));}
  reply(res,{error:'없는 경로'},404);
 }catch(error){reply(res,{error:error.message},400);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#channelSmartstore').click();
  await page.waitForFunction(()=>document.querySelector('#officialProductLink').href.includes('pno=current'));assert.equal(await page.locator('#officialProductLink').getAttribute('target'),'_blank');
  assert(!(await page.locator('#researchTagStatus').innerText()).includes('검증 10/10'));
  await page.locator('#naverConnectionMenu summary').click();await page.locator('#photoAnalysisSettingsButton').click();assert.equal(await page.locator('#photoAnalysisKey').getAttribute('type'),'password');
  const fakeKey='sk-'+'x'.repeat(24);await page.locator('#photoAnalysisKey').fill(fakeKey);await page.getByRole('button',{name:'암호화 저장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#photoAnalysisMessage').textContent.includes('저장 완료'));assert.equal(await page.locator('#photoAnalysisKey').inputValue(),'');assert(!await page.locator('body').innerText().then(t=>t.includes(fakeKey)));await page.locator('#closePhotoAnalysis').click();
  await page.getByRole('button',{name:'여성후드티 추천에서 삭제',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#researchTagCandidates').textContent.includes('여성후드티'));
  await page.locator('#manualTagQuery').fill('후드');await page.locator('#manualTagQuery').press('Enter');await page.getByRole('checkbox',{name:'여성후드티 선택',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'여성니트 선택',exact:true}).isEnabled(),true);await page.getByRole('checkbox',{name:'여성후드티 선택',exact:true}).check();await page.getByRole('checkbox',{name:'여성니트 선택',exact:true}).check();
  await page.waitForFunction(()=>document.querySelector('#manualTagSaveStatus').textContent.includes('3개 태그가'));assert.deepEqual(savedSelections.at(-1).map(t=>t.id).sort(),['1','2','3']);assert((await page.locator('#researchTagCandidates').innerText()).includes('여성니트'));
  await page.reload();await page.getByRole('button',{name:'여성니트 선택 취소',exact:true}).waitFor();assert((await page.locator('#researchTagStatus').innerText()).includes('3/10'));
  await page.locator('#applyManualTags').click();await page.waitForFunction(()=>!document.querySelector('#smartstoreStart').disabled);assert.deepEqual(selectedRequest.tags.map(t=>t.id).sort(),['1','2','3']);
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/smartstore-tags')),page.locator('#smartstoreAutoTags').click()]);assert.deepEqual(autoRequest.selectedTags.map(t=>t.id).sort(),['1','2','3']);await page.waitForFunction(()=>!document.querySelector('#smartstoreStart').disabled);
  assert.equal(await page.locator('#smartstoreValidateTags').count(),0);assert.equal(await page.locator('#detailPreviewStatus').innerText(),'');
  await page.getByRole('button',{name:'여성후드티 선택 취소',exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/smartstore-auto')),page.locator('#smartstoreStart').click()]);
  assert.deepEqual(startRequest.selectedTags,[{id:'2',name:'기모후드티'},{id:'3',name:'여성니트'}]);assert.equal(startRequest.selectedTitle.title,product.smartstoreName);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
