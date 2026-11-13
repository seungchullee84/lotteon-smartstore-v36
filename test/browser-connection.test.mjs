import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access,mkdir,mkdtemp,readFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BrowserAutomation} from '../browser-connection.mjs';

test('두 판매채널이 연결된 Chrome에서 같은 알림창을 처리해도 등록기는 계속 응답한다',async()=>{
 const temp=await realpath(tmpdir());
 const root=await mkdtemp(path.join(temp,'registrar-chrome-test-'));
 const profile=path.join(root,'browser-profile-chrome-v2');
 await mkdir(profile);
 const installed=process.platform==='win32'&&process.env.ProgramFiles?
  path.join(process.env.ProgramFiles,'Google','Chrome','Application','chrome.exe'):null;
 const executable=installed&&await access(installed).then(()=>true,()=>false)?installed:chromium.executablePath();
 const child=spawn(executable,[
  '--headless','--no-sandbox','--disable-background-networking','--no-first-run',
  '--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,
  'about:blank',
 ],{windowsHide:true,stdio:'ignore'});
 const exited=once(child,'exit').catch(()=>{});
 const lotte=new BrowserAutomation(root,()=>{}),smartstore=new BrowserAutomation(root,()=>{});
 try{
  const portFile=path.join(profile,'DevToolsActivePort');
  const deadline=Date.now()+6000;
  let port;
  while(!port&&Date.now()<deadline){
   const info=await readFile(portFile,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return '';});
   port=Number(info.split('\n')[0]);
   if(!port)await delay(80);
  }
  assert.ok(port,'테스트 Chrome 연결 준비');
  await Promise.all([lotte.connectChrome('about:blank'),smartstore.connectChrome('about:blank')]);
  const page=lotte.context.pages()[0];
  await page.setContent('<button onclick="alert(123)">popup</button><p>existing draft</p>');
  await page.getByRole('button').click({timeout:4000});
  assert.equal(await page.locator('p').textContent(),'existing draft');
  const smartstoreConnection=smartstore.browser;
  await lotte.stop();
  assert.ok(smartstoreConnection.isConnected());
  assert.equal(await smartstore.context.pages()[0].locator('p').textContent(),'existing draft');
  await lotte.connectChrome('about:blank');
  assert.equal(await lotte.context.pages()[0].locator('p').textContent(),'existing draft');
 }finally{
  const browser=smartstore.browser?.isConnected()?smartstore.browser:lotte.browser;
  try{await (await browser?.newBrowserCDPSession())?.send('Browser.close');}catch{}
  await Promise.all([lotte.stop(),smartstore.stop()]);
  if(child.exitCode===null&&child.signalCode===null)child.kill();
  await Promise.race([exited,delay(1500)]);
  const resolved=await realpath(root);
  assert.equal(path.dirname(resolved),temp);
  await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:120});
 }
});
