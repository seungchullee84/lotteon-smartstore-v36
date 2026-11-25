import {access,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import {prepareRegistrarChromeAppearance} from './browser-appearance.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataRoot=path.join(root,'data');
const deployHome=path.join(dataRoot,'mybox-deploy');
// Reuse the registrar's existing SmartStore/Lotte Chrome profile so no separate MYBOX login is needed.
const sharedChromeProfile=path.join(dataRoot,'browser-profile-chrome-v2');

const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-9;]*m/g,'').replace(/\s+/g,' ').trim();

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
  return chromium.executablePath();
}

async function connectSharedChrome(initialUrl){
  await mkdir(sharedChromeProfile,{recursive:true});
  const portFile=path.join(sharedChromeProfile,'DevToolsActivePort');
  const connect=async()=>{
    const port=Number((await readFile(portFile,'utf8')).split('\n')[0]);
    if(!Number.isInteger(port)||port<1024||port>65535)throw Error('전용 크롬 포트 확인 실패');
    const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:2500});
    const context=browser.contexts()[0];
    if(!context)throw Error('전용 크롬 컨텍스트 확인 실패');
    return {browser,context,launched:false};
  };
  try{
    return await connect();
  }catch{}
  await rm(portFile,{force:true}).catch(()=>{});
  const exe=await resolveChromeExecutable();
  await prepareRegistrarChromeAppearance(sharedChromeProfile).catch(()=>{});
  const args=[
    '--user-data-dir='+sharedChromeProfile,
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    '--no-default-browser-check',
    '--restore-last-session',
    initialUrl
  ];
  const child=spawn(exe,args,{detached:true,windowsHide:false,stdio:'ignore'});
  let launchError;
  child.on('error',e=>{launchError=e;});
  child.unref();
  for(let n=0;n<35;n++){
    if(launchError)throw Error('전용 크롬을 실행하지 못했습니다: '+launchError.message);
    try{
      const connected=await connect();
      return {...connected,launched:true};
    }catch{await new Promise(r=>setTimeout(r,400));}
  }
  throw Error('전용 크롬에 연결하지 못했습니다. 상품등록기의 스마트스토어 로그인 창을 한 번 열어 주세요.');
}

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

async function waitForMyboxReady(page,timeoutMs){
  const deadline=Date.now()+timeoutMs;
  let loginSeenAt=0;
  while(Date.now()<deadline){
    if(page.isClosed())throw Error('MYBOX 탭이 닫혔습니다.');
    const currentUrl=page.url();
    if(isMyboxLoginUrl(currentUrl)){
      if(!loginSeenAt)loginSeenAt=Date.now();
      if(Date.now()-loginSeenAt>2000)return false;
    }else{
      const ready=await page.evaluate(()=>document.body?.innerText?.includes('올리기')).catch(()=>false);
      if(ready)return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
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
  const requestPath=path.join(deployHome,'upload-request.json');
  const request=JSON.parse(await readFile(requestPath,'utf8'));
  const destination=validateMyboxRequest(request);

  let connection=null;
  let tab=null;
  let keepTabOpen=false;
  try{
    connection=await connectSharedChrome(destination.href);
    // Open a dedicated temporary tab so existing Lotte/SmartStore tabs are never touched.
    tab=await connection.context.newPage();
    await tab.goto(destination.href,{waitUntil:'domcontentloaded',timeout:30000});
    const ready=await waitForMyboxReady(tab,15000);
    if(!ready){
      keepTabOpen=true;
      throw Error('전용 크롬의 네이버 로그인이 필요합니다. 스마트스토어 전용 크롬에서 네이버 로그인 후 자동배포를 다시 켜 주세요.');
    }
    await performUpload(tab,request,destination);
    await writeReceipt(request,destination);
    console.log('MYBOX_RESULT '+JSON.stringify({ok:true,mode:'shared-chrome',sha:request.sourceCommit}));
  }catch(error){
    console.log('MYBOX_RESULT '+JSON.stringify({ok:false,error:stripAnsi(error.message)}));
    throw error;
  }finally{
    // Close only our temporary MYBOX tab; never close the user's shared Chrome window.
    if(tab&&!keepTabOpen&&!tab.isClosed())await tab.close().catch(()=>{});
    if(connection?.browser)await connection.browser.close().catch(()=>{});
  }
}

const isEntry=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntry){
  runCli().catch(error=>{console.error(error.message);process.exitCode=1;});
}
