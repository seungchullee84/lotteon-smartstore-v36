import {access,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.dirname(fileURLToPath(import.meta.url));
const deployHome=path.join(root,'data','mybox-deploy');
const profileDir=path.join(deployHome,'browser-profile');

export function validateMyboxRequest(request){
  if(!request||typeof request!=='object')throw Error('MYBOX 업로드 요청 정보가 비어 있습니다.');
  const destination=new URL(request.folderUrl);
  if(destination.origin!=='https://mybox.naver.com'||destination.pathname!=='/main/web/my')throw Error('MYBOX 배포 위치를 확인해 주세요.');
  if(path.basename(String(request.zipPath||''))!=='최신업데이트.zip')throw Error('고정 업데이트 파일명을 확인해 주세요.');
  return destination;
}

export function isMyboxLoginUrl(rawUrl){
  try{
    const parsed=new URL(rawUrl);
    if(parsed.hostname==='nid.naver.com')return true;
    if(parsed.hostname==='mybox.naver.com'&&parsed.pathname.startsWith('/about'))return true;
    return false;
  }catch{return true;}
}

async function resolveChromeExecutable(){
  const candidates=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA]
    .filter(Boolean)
    .map(base=>path.join(base,'Google','Chrome','Application','chrome.exe'));
  for(const file of candidates){
    try{await access(file);return file;}catch{}
  }
  return undefined;
}

async function openHeadlessContext(){
  await mkdir(profileDir,{recursive:true});
  const executablePath=await resolveChromeExecutable();
  const options={
    headless:true,
    viewport:{width:1366,height:900},
    locale:'ko-KR',
    args:['--no-first-run','--no-default-browser-check','--disable-blink-features=AutomationControlled']
  };
  if(executablePath)options.executablePath=executablePath;
  try{
    return await chromium.launchPersistentContext(profileDir,options);
  }catch(error){
    if(options.executablePath){
      delete options.executablePath;
      return await chromium.launchPersistentContext(profileDir,options);
    }
    throw error;
  }
}

async function openVisibleChromeSession(initialUrl){
  await mkdir(profileDir,{recursive:true});
  const portFile=path.join(profileDir,'DevToolsActivePort');
  const connect=async()=>{
    const port=Number((await readFile(portFile,'utf8')).split('\n')[0]);
    if(!Number.isInteger(port)||port<1024||port>65535)throw Error('크롬 포트 확인 실패');
    const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:2000});
    const context=browser.contexts()[0];
    return {browser,context,child:null};
  };
  try{
    const existing=await connect();
    const page=existing.context.pages()[0]||await existing.context.newPage();
    await page.goto(initialUrl,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
    await page.bringToFront().catch(()=>{});
    return {...existing,page};
  }catch{}
  await rm(portFile,{force:true}).catch(()=>{});
  const exe=(await resolveChromeExecutable())||chromium.executablePath();
  const args=[
    '--user-data-dir='+profileDir,
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    initialUrl
  ];
  const child=spawn(exe,args,{detached:true,windowsHide:false,stdio:'ignore'});
  let launchError;
  child.on('error',e=>{launchError=e;});
  child.unref();
  for(let n=0;n<40;n++){
    if(launchError)throw Error('MYBOX 로그인용 Chrome을 실행하지 못했습니다: '+launchError.message);
    try{
      const connected=await connect();
      const page=connected.context.pages()[0]||await connected.context.newPage();
      await page.bringToFront().catch(()=>{});
      return {...connected,child,page};
    }catch{await new Promise(r=>setTimeout(r,350));}
  }
  throw Error('MYBOX 로그인용 Chrome 창에 연결하지 못했습니다.');
}

async function closeVisibleChromeSession(session){
  if(!session)return;
  try{
    const pages=session.context?.pages?.()||[];
    for(const p of pages)await p.close().catch(()=>{});
  }catch{}
  try{await session.browser?.close?.();}catch{}
}

async function waitForMyboxReady(page,timeoutMs,{stopOnLogin=false}={}){
  const deadline=Date.now()+timeoutMs;
  let loginSeenAt=0;
  while(Date.now()<deadline){
    if(page.isClosed())throw Error('MYBOX 로그인 창이 닫혔습니다.');
    const currentUrl=page.url();
    if(isMyboxLoginUrl(currentUrl)){
      if(stopOnLogin){
        if(!loginSeenAt)loginSeenAt=Date.now();
        if(Date.now()-loginSeenAt>1500)return false;
      }
    }else{
      const ready=await page.evaluate(()=>document.body?.innerText?.includes('올리기')).catch(()=>false);
      if(ready)return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-9;]*m/g,'').replace(/\s+/g,' ').trim();

async function clickFirstVisible(page,selectors,timeoutMs=15000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    for(const selector of selectors){
      const loc=page.locator(selector);
      const count=await loc.count().catch(()=>0);
      for(let i=0;i<count;i++){
        const item=loc.nth(i);
        if(await item.isVisible().catch(()=>false)){
          await item.click({timeout:Math.max(2000,deadline-Date.now())});
          return true;
        }
      }
    }
    await page.waitForTimeout(250);
  }
  throw Error('MYBOX 화면에서 클릭할 버튼을 찾지 못했습니다: '+selectors[0]);
}

async function performUpload(page,request,destination){
  const expectedKey=destination.searchParams.get('resourceKey');
  const currentKey=new URL(page.url()).searchParams.get('resourceKey');
  if(expectedKey&&currentKey!==expectedKey)throw Error('MYBOX 배포 폴더에 진입하지 못했습니다.');
  await clickFirstVisible(page,['button:has-text("올리기")','text="올리기"','a:has-text("올리기")','[role="button"]:has-text("올리기")'],15000);
  const chooserPromise=page.waitForFileChooser({timeout:15000});
  await clickFirstVisible(page,['text="파일 올리기"','button:has-text("파일 올리기")','li:has-text("파일 올리기")','[role="menuitem"]:has-text("파일 올리기")'],10000);
  const chooser=await chooserPromise;
  await chooser.setFiles(request.zipPath);

  await page.waitForFunction(
    ()=>/같은 이름|덮어쓰기|업로드 성공|업로드 완료/.test(document.body?.innerText||''),
    undefined,
    {timeout:120000}
  );
  const afterSelectText=await page.evaluate(()=>document.body?.innerText||'');
  if(/같은 이름|덮어쓰기/.test(afterSelectText)){
    await clickFirstVisible(page,['button:has-text("덮어쓰기")','text="덮어쓰기"'],10000).catch(()=>{});
  }
  await page.waitForFunction(
    ()=>{
      const text=document.body?.innerText||'';
      return (text.includes('업로드 성공')||text.includes('업로드 완료'))&&/1\s*\/\s*1개\s*완료/.test(text);
    },
    undefined,
    {timeout:120000}
  );
  const finalText=await page.evaluate(()=>document.body?.innerText||'');
  if(!finalText.includes(request.filename)||(!finalText.includes('업로드 성공')&&!finalText.includes('업로드 완료'))){
    throw Error('MYBOX 업로드 결과가 일치하지 않습니다.');
  }
}

async function writeReceipt(request,destination){
  const receiptPath=path.join(deployHome,'upload-receipt.json');
  const tmp=receiptPath+'.tmp';
  const payload={
    attemptId:request.attemptId,
    sha:request.sourceCommit,
    filename:request.filename,
    folderUrl:destination.href,
    uploadedAt:new Date().toISOString()
  };
  await writeFile(tmp,JSON.stringify(payload,null,2));
  await rename(tmp,receiptPath);
}

async function runCli(){
  const args=new Set(process.argv.slice(2));
  const forceVisible=args.has('--visible')||args.has('--login');
  const loginOnly=args.has('--login');
  const settingsPath=path.join(deployHome,'settings.json');
  const requestPath=path.join(deployHome,'upload-request.json');

  let request;
  let destination;
  if(loginOnly){
    const settings=JSON.parse(await readFile(settingsPath,'utf8').catch(()=>'{"folderUrl":"https://mybox.naver.com/main/web/my"}'));
    destination=new URL(settings.folderUrl||'https://mybox.naver.com/main/web/my');
  }else{
    request=JSON.parse(await readFile(requestPath,'utf8'));
    destination=validateMyboxRequest(request);
  }

  let headlessContext=null;
  let visibleSession=null;
  try{
    if(!forceVisible){
      headlessContext=await openHeadlessContext();
      const page=headlessContext.pages()[0]||await headlessContext.newPage();
      await page.goto(destination.href,{waitUntil:'domcontentloaded',timeout:30000});
      const ready=await waitForMyboxReady(page,12000,{stopOnLogin:true});
      if(ready){
        await performUpload(page,request,destination);
        await writeReceipt(request,destination);
        console.log('MYBOX_RESULT '+JSON.stringify({ok:true,mode:'headless',sha:request.sourceCommit}));
        return;
      }
      await headlessContext.close().catch(()=>{});
      headlessContext=null;
    }

    const loginUrl='https://nid.naver.com/nidlogin.login?url='+encodeURIComponent(destination.href);
    visibleSession=await openVisibleChromeSession(destination.href);
    const page=visibleSession.page;
    let ready=await waitForMyboxReady(page,4000,{stopOnLogin:true});
    if(!ready){
      if(isMyboxLoginUrl(page.url())&&!page.url().includes('nid.naver.com')){
        await page.goto(loginUrl,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
      }
      ready=await waitForMyboxReady(page,180000);
    }
    if(!ready)throw Error('MYBOX 로그인이 필요합니다. 열린 Chrome 창에서 로그인을 완료해 주세요.');
    if(loginOnly){
      console.log('MYBOX_RESULT '+JSON.stringify({ok:true,mode:'login-only'}));
      return;
    }
    await performUpload(page,request,destination);
    await writeReceipt(request,destination);
    console.log('MYBOX_RESULT '+JSON.stringify({ok:true,mode:'visible',sha:request.sourceCommit}));
  }catch(error){
    console.log('MYBOX_RESULT '+JSON.stringify({ok:false,error:stripAnsi(error.message)}));
    throw error;
  }finally{
    if(headlessContext)await headlessContext.close().catch(()=>{});
    if(visibleSession)await closeVisibleChromeSession(visibleSession);
  }
}

const isEntry=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntry){
  runCli().catch(error=>{console.error(error.message);process.exitCode=1;});
}
