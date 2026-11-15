import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

test('상태 갱신은 선택 영역과 한글 조합을 보존하고 빈 품번 오류는 입력칸으로 이동한다',async()=>{
 const base=style=>({
  style,sourceUrl:'https://example.invalid/'+style,rawName:'공식 상품',name:'남성 공식 상품',
  gender:'남성',consumerPrice:29900,colors:['01검정','02흰색'],sizes:['M','L'],
  material:'면',country:'대한민국',manufactured:'2026-01',washing:'손세탁',
  keywords:'지오다노,티셔츠',category:{},images:{},warnings:[],photoSelectionPending:true,
 });
 let current=null,revision=0;
 const state=()=>({
  busy:false,phase:'idle',logs:[],revision,product:current,
  release:{version:'1',displayDate:'2026-11-15',updatedAt:'2026-11-15T00:00:00Z'},
  benefitResearch:{status:'on-demand',message:'모의 응답'},
 });
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(url.pathname==='/api/state')return json(state());
  if(url.pathname==='/api/branding')return json({visible:false});
  if(url.pathname==='/api/naver-status')return json({configured:false});
  if(url.pathname==='/api/smartstore-two-choice')return json({packages:[]});
  if(url.pathname==='/api/naver-keywords')return json({
   keywords:current.keywords,length:current.keywords.length,source:'모의 응답',
   period:{startDate:'2026-11-01',endDate:'2026-11-15'},
  });
  if(url.pathname==='/api/smartstore-point-picker')return json({style:current.style,sourceUrl:current.sourceUrl,selectedIds:[],candidates:[]});
  if(url.pathname.startsWith('/api/'))return json({});
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!/^[a-z0-9-]+\.(html|js|mjs|css|png|svg)$/.test(name)){res.writeHead(404);res.end();return;}
  const path=name==='smartstore-title.mjs'?name:'public/'+name;
  try{
   const bytes=await readFile(new URL('../'+path,import.meta.url));
   const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript';
   res.setHeader('Content-Type',type);res.end(bytes);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  const page=await browser.newPage();
  page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.getElementById('status').textContent==='대기');
  // Explicit refresh uses the production polling function without waiting for its timer.
  const refresh=()=>page.evaluate(()=>refresh());
  for(const channel of ['Lotte','Smartstore']){
   await page.locator('#channel'+channel).click();
   // The SmartStore start button is normally hidden before collection.
   await page.locator(channel==='Lotte'?'#collect':'#smartstoreStart').evaluate(button=>button.click());
   assert.equal(await page.evaluate(()=>document.activeElement.id),'style');
   assert.equal(await page.locator('#style').getAttribute('aria-invalid'),'true');
   await page.locator('#style').fill('123456');
   assert.equal(await page.locator('#style').getAttribute('aria-invalid'),null);
   await page.locator('#style').fill('');
  }
  current=base('123456');revision++;
  await refresh();
  const colors=page.locator('#form [name="colors"]');
  await colors.fill('01검정, 02흰색');
  await colors.evaluate(field=>field.setSelectionRange(3,6,'backward'));
  current={...current,material:'면 100%'};revision++;
  await refresh();
  assert.deepEqual(await colors.evaluate(field=>({value:field.value,start:field.selectionStart,end:field.selectionEnd,direction:field.selectionDirection,focused:document.activeElement===field})),{
   value:'01검정, 02흰색',start:3,end:6,direction:'backward',focused:true,
  });
  assert.equal(await page.locator('#form [name="material"]').inputValue(),'면 100%');
  const cdp=await page.context().newCDPSession(page);
  await colors.evaluate(field=>field.setSelectionRange(field.value.length,field.value.length));
  await cdp.send('Input.imeSetComposition',{text:'가',selectionStart:1,selectionEnd:1});
  current={...current,material:'면 90%'};revision++;
  await refresh();
  await cdp.send('Input.insertText',{text:'가'});
  assert.equal(await colors.inputValue(),'01검정, 02흰색가','갱신으로 한글 조합이 해제되면 가가가 중복 입력된다');
  current=base('654321');revision++;
  await refresh();
  assert.equal(await colors.inputValue(),'01검정,02흰색');
  current=base('123456');revision++;
  await refresh();
  assert.equal(await colors.inputValue(),'01검정, 02흰색가');
  await page.evaluate(()=>{
   window.refreshMutations=0;
   window.refreshObserver=new MutationObserver(records=>window.refreshMutations+=records.length);
   for(const id of ['status','releaseVersion','collect'])window.refreshObserver.observe(document.getElementById(id),{childList:true});
  });
  await refresh();await refresh();
  assert.equal(await page.evaluate(()=>window.refreshMutations),0);
  assert.deepEqual(errors,[]);
 }finally{
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
});
