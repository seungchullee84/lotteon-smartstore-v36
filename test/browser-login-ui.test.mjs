import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {createBrowserLoginStore} from '../browser-login-store.mjs';

test('설정 화면에서 암호화 저장·끄기·삭제하고 비밀번호 입력값을 즉시 지운다',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'registrar-login-ui-')),store=createBrowserLoginStore(root),responses=[];
 const reply=(res,data)=>{responses.push(JSON.stringify(data));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/browser-login-status')return reply(res,await store.status());
  if(url.pathname==='/api/browser-login-settings'){let body='';for await(const part of req)body+=part;return reply(res,await store.update(JSON.parse(body)));}
  if(url.pathname==='/api/state')return reply(res,{product:null,revision:1,busy:false,phase:'idle',logs:[]});
  if(url.pathname==='/api/branding')return reply(res,{visible:false});
  if(url.pathname==='/api/naver-status')return reply(res,{configured:false});
  const files={'/':'index.html','/app.js':'app.js','/website-daily.js':'website-daily.js','/detail-preview.js':'detail-preview.js','/two-choice.js':'two-choice.js','/style.css':'style.css'};
  if(files[url.pathname]){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html');return res.end(await readFile(new URL('../public/'+files[url.pathname],import.meta.url)));}
  res.statusCode=404;res.end();
 }catch{res.statusCode=400;reply(res,{error:'설정 실패'});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#browserLoginSettings').click();await page.getByText('처음 한 번 아이디와 비밀번호를 입력해 저장하세요.',{exact:true}).waitFor();
  await page.locator('#browserLoginUsername').fill('fixture-ui-user');await page.locator('#browserLoginPassword').fill('fixture-ui-pass');await page.locator('#saveBrowserLogin').click();
  await page.getByText('이 PC에 암호화 저장했습니다. 크롬 연결·상품 입력 시작 시 로그인이 필요하면 자동으로 시도합니다.',{exact:true}).waitFor();
  assert.equal(await page.locator('#browserLoginPassword').inputValue(),'');assert.equal(await page.locator('#browserLoginUsername').inputValue(),'');
  assert.equal((await store.load()).username,'fixture-ui-user');assert.ok(responses.every(text=>!text.includes('fixture-ui-user')&&!text.includes('fixture-ui-pass')));
  await page.locator('#closeBrowserLogin').click();await page.locator('#browserLoginSettings').click();await page.getByText(/자동 로그인 사용 중 · 저장 계정/).waitFor();
  await page.locator('#browserLoginEnabled').uncheck();await page.locator('#saveBrowserLogin').click();await page.getByText('자동 로그인을 껐습니다. 저장 정보는 이 PC에 유지합니다.',{exact:true}).waitFor();assert.equal(await store.load(),null);
  await page.locator('#deleteBrowserLogin').click();await page.getByText('이 PC에 저장한 자동 로그인 정보를 삭제했습니다.',{exact:true}).waitFor();assert.equal((await store.status()).configured,false);
  await page.locator('#browserLoginUsername').fill('unsaved');await page.locator('#browserLoginPassword').fill('unsaved');await page.locator('#closeBrowserLogin').click();
  assert.equal(await page.locator('#browserLoginPassword').inputValue(),'');assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
