import fs from 'node:fs';
import {access,copyFile,mkdir,open,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {prepareRegistrarChromeAppearance} from './browser-appearance.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataRoot=path.join(root,'data');
const deployHome=path.join(dataRoot,'mybox-deploy');
const sharedNaverChromeProfile=path.join(dataRoot,'browser-profile-chrome-v2');
const FLOW_CDP_PORT=9229;
const SHARED_DRIVE_LOCK=path.join(os.tmpdir(),'giordano-google-drive-upload.lock');

const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-9;]*m/g,'').replace(/\s+/g,' ').trim();

export function detectUploadProvider(folderUrl=''){
  try{
    const parsed=new URL(String(folderUrl||'').trim());
    if(parsed.origin==='https://drive.google.com')return 'gdrive';
    if(parsed.origin==='https://mybox.naver.com')return 'mybox';
  }catch{}
  return 'unknown';
}

export function validateMyboxRequest(request){
  if(!request||typeof request!=='object')throw Error('자동배포 업로드 요청 정보가 비어 있습니다.');
  const destination=new URL(String(request.folderUrl||''));
  const provider=detectUploadProvider(destination.href);
  if(provider==='gdrive'){
    if(!/^\/drive\/(?:folders\/[a-zA-Z0-9_-]{10,}|my-drive\/?)$/.test(destination.pathname)){
      throw Error('Google 드라이브 배포 폴더 주소를 확인해 주세요.');
    }
  }else if(provider==='mybox'){
    if(destination.pathname!=='/main/web/my')throw Error('MYBOX 배포 위치를 확인해 주세요.');
  }else{
    throw Error('허용된 배포 위치(Google 드라이브 또는 MYBOX)를 확인해 주세요.');
  }
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

export function isGoogleLoginUrl(rawUrl){
  try{
    const parsed=new URL(rawUrl);
    return parsed.hostname==='accounts.google.com';
  }catch{return true;}
}

function findGoogleDriveDesktopRoot(){
  const home=os.homedir();
  const candidates=[
    'G:\\내 드라이브','G:\\My Drive',
    'H:\\내 드라이브','H:\\My Drive',
    'I:\\내 드라이브','I:\\My Drive',
    path.join(home,'Google 드라이브'),
    path.join(home,'Google Drive')
  ];
  for(const dir of candidates){
    try{if(fs.existsSync(dir))return dir;}catch{}
  }
  return null;
}

async function resolveGoogleChromeProfile(){
  const shortsProfile=path.resolve(root,'..','giordano-shorts-studio','data','flow-chrome-profile');
  try{await access(shortsProfile);return shortsProfile;}catch{}
  const fallback=path.join(deployHome,'google-chrome-profile');
  await mkdir(fallback,{recursive:true});
  return fallback;
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

export async function withSharedDriveLock(fn,{lockPath=SHARED_DRIVE_LOCK,timeoutMs=90000,staleMs=210000}={}){
  const deadline=Date.now()+timeoutMs;
  let handle=null;
  while(Date.now()<deadline){
    try{
      handle=await open(lockPath,'wx');
      await handle.writeFile(JSON.stringify({pid:process.pid,at:Date.now(),app:'registrar'}));
      break;
    }catch(error){
      if(error.code!=='EEXIST')throw error;
      try{
        const info=await stat(lockPath);
        if(Date.now()-info.mtimeMs>staleMs){await rm(lockPath,{force:true});continue;}
      }catch{}
      await new Promise(r=>setTimeout(r,600));
    }
  }
  if(!handle)throw Error('다른 Google 드라이브 업로드가 진행 중이어서 대기 시간이 초과되었습니다.');
  try{
    return await fn();
  }finally{
    await handle.close().catch(()=>{});
    await rm(lockPath,{force:true}).catch(()=>{});
  }
}

async function isCdpAlive(port,timeoutMs=1500){
  try{
    const res=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(timeoutMs)});
    return res.ok;
  }catch{return false;}
}

async function connectGoogleChrome(initialUrl){
  if(await isCdpAlive(FLOW_CDP_PORT,1500)){
    const browser=await chromium.connectOverCDP(`http://127.0.0.1:${FLOW_CDP_PORT}`,{timeout:4000});
    const context=browser.contexts()[0];
    if(context)return {browser,context};
    await browser.close().catch(()=>{});
  }
  const profile=await resolveGoogleChromeProfile();
  const exe=await resolveChromeExecutable();
  const args=[
    '--user-data-dir='+profile,
    '--remote-debugging-port='+FLOW_CDP_PORT,
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    '--no-default-browser-check',
    initialUrl
  ];
  const child=spawn(exe,args,{detached:true,windowsHide:false,stdio:'ignore'});
  let launchError;
  child.on('error',e=>{launchError=e;});
  child.unref();
  for(let n=0;n<35;n++){
    if(launchError)throw Error('Google 드라이브 전용 Chrome을 실행하지 못했습니다: '+launchError.message);
    if(await isCdpAlive(FLOW_CDP_PORT,1000)){
      const browser=await chromium.connectOverCDP(`http://127.0.0.1:${FLOW_CDP_PORT}`,{timeout:4000});
      const context=browser.contexts()[0];
      if(context)return {browser,context};
      await browser.close().catch(()=>{});
    }
    await new Promise(r=>setTimeout(r,450));
  }
  throw Error('Google 드라이브 전용 Chrome(CDP 9229)에 연결하지 못했습니다.');
}

async function findFirstVisible(page,selectors,timeoutMs=10000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    for(const selector of selectors){
      const loc=page.locator(selector);
      const count=await loc.count().catch(()=>0);
      for(let i=0;i<count;i++){
        const item=loc.nth(i);
        if(await item.isVisible().catch(()=>false))return item;
      }
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function clickFirstVisible(page,selectors,timeoutMs=15000){
  const item=await findFirstVisible(page,selectors,timeoutMs);
  if(!item)throw Error('화면에서 클릭할 버튼을 찾지 못했습니다: '+selectors[0]);
  await item.click({timeout:5000});
  return true;
}

async function performGoogleDriveUpload(request,destination){
  const folderName=String(request.folderName||'지오다노_상품등록기').trim()||'지오다노_상품등록기';
  // 1순위: 로컬 Google Drive 데스크톱 마운트 폴더가 있으면 0.1초 즉시 복사
  const driveRoot=findGoogleDriveDesktopRoot();
  if(driveRoot){
    const targetDir=path.join(driveRoot,folderName);
    await mkdir(targetDir,{recursive:true});
    const dest=path.join(targetDir,request.filename);
    const tmp=dest+'.'+Date.now()+'.tmp';
    await copyFile(request.zipPath,tmp);
    await rename(tmp,dest);
    return {mode:'gdrive-desktop',dest};
  }

  // 2순위: 숏츠등록기와 공유하는 Google 로그인 전용 Chrome(CDP 9229) 임시 탭으로 덮어쓰기 업로드
  return await withSharedDriveLock(async()=>{
    let lastError;
    for(let attempt=1;attempt<=2;attempt++){
      let connection=null;
      let tab=null;
      let keepTabOpen=false;
      try{
        connection=await connectGoogleChrome(destination.href);
        tab=await connection.context.newPage();
        await tab.goto(destination.href,{waitUntil:'domcontentloaded',timeout:35000});
        await tab.waitForTimeout(2000);
        if(isGoogleLoginUrl(tab.url())){
          keepTabOpen=true;
          throw Object.assign(Error('전용 Chrome의 Google 계정 로그인이 필요합니다. 열린 탭에서 로그인해 주세요.'),{noRetry:true});
        }
        const newBtn=await findFirstVisible(tab,[
          'button[guidedhelpid="new_menu_button"]',
          'button:has-text("신규")',
          'button[aria-label="신규"]',
          'button[aria-label*="신규"]',
          'button:has-text("New")',
          'button[aria-label="New"]'
        ],15000);
        if(!newBtn)throw Error('Google 드라이브 [신규] 버튼을 찾지 못했습니다.');
        await newBtn.click();
        await tab.waitForTimeout(500);
        const fileUploadMenu=await findFirstVisible(tab,[
          '[role="menuitem"]:has-text("파일 업로드")',
          'div[role="menu"] >> text="파일 업로드"',
          '[role="menuitem"]:has-text("File upload")',
          'div[role="menu"] >> text="File upload"'
        ],8000);
        if(!fileUploadMenu)throw Error('Google 드라이브 [파일 업로드] 메뉴를 찾지 못했습니다.');
        const [chooser]=await Promise.all([
          tab.waitForEvent('filechooser',{timeout:15000}),
          fileUploadMenu.click()
        ]);
        await chooser.setFiles(request.zipPath);

        const deadline=Date.now()+120000;
        let confirmed=false;
        while(Date.now()<deadline){
          await tab.waitForTimeout(1200);
          // 동일 파일명(최신업데이트.zip) 중복 팝업 시 반드시 "기존 파일 바꾸기" 선택 후 업로드
          const dialog=tab.locator('[role="dialog"], [role="alertdialog"]').first();
          if(await dialog.isVisible().catch(()=>false)){
            const dialogText=await dialog.innerText().catch(()=>'');
            if(/기존\s*파일\s*바꾸기|Replace\s*existing|Update\s*existing|업로드\s*옵션/i.test(dialogText)){
              const replaceOpt=await findFirstVisible(tab,[
                '[role="dialog"] [role="radio"]:has-text("기존 파일 바꾸기")',
                '[role="dialog"] label:has-text("기존 파일 바꾸기")',
                '[role="dialog"] [role="radio"]:has-text("Replace existing")',
                '[role="dialog"] label:has-text("Replace existing")'
              ],1200);
              if(replaceOpt)await replaceOpt.click().catch(()=>{});
              const uploadBtn=await findFirstVisible(tab,[
                '[role="dialog"] button:has-text("업로드")',
                '[role="dialog"] button:has-text("Upload")',
                '[role="alertdialog"] button:has-text("업로드")',
                '[role="alertdialog"] button:has-text("Upload")'
              ],2000);
              if(uploadBtn){
                await uploadBtn.click().catch(()=>{});
                await tab.waitForTimeout(800);
              }
            }
          }
          const status=await tab.evaluate(targetName=>{
            const text=document.body?.innerText||'';
            const done=/(?:1\s*개\s*업로드\s*완료|업로드\s*완료|1\s*upload\s*complete|uploads?\s*complete)/i.test(text);
            const uploading=/(?:업로드\s*중|항목\s*업로드\s*중|Uploading\s*\d|Starting\s*upload|업로드\s*시작\s*중|남음)/i.test(text);
            const hasCancel=Boolean(document.querySelector('button[aria-label*="업로드 취소"], button[aria-label*="Cancel upload"]'));
            const listed=text.includes(targetName);
            return {done,uploading,hasCancel,listed};
          },request.filename).catch(()=>({done:false,uploading:false,hasCancel:false,listed:false}));
          if(status.done&&!status.hasCancel){confirmed=true;break;}
          if(status.listed&&!status.uploading&&!status.hasCancel&&Date.now()>deadline-112000){
            await tab.waitForTimeout(1500);confirmed=true;break;
          }
        }
        if(!confirmed)throw Error('Google 드라이브 업로드 완료 확인 시간이 초과되었습니다.');
        await tab.waitForTimeout(1000);
        return {mode:'gdrive-chrome',attempt};
      }catch(error){
        lastError=error;
        if(error?.noRetry||attempt>=2)throw error;
        await new Promise(r=>setTimeout(r,2000));
      }finally{
        if(tab&&!keepTabOpen&&!tab.isClosed())await tab.close().catch(()=>{});
        if(connection?.browser)await connection.browser.close().catch(()=>{});
      }
    }
    throw lastError;
  });
}

async function connectSharedNaverChrome(initialUrl){
  await mkdir(sharedNaverChromeProfile,{recursive:true});
  const portFile=path.join(sharedNaverChromeProfile,'DevToolsActivePort');
  const connect=async()=>{
    const port=Number((await readFile(portFile,'utf8')).split('\n')[0]);
    if(!Number.isInteger(port)||port<1024||port>65535)throw Error('전용 크롬 포트 확인 실패');
    const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:2500});
    const context=browser.contexts()[0];
    if(!context)throw Error('전용 크롬 컨텍스트 확인 실패');
    return {browser,context};
  };
  try{return await connect();}catch{}
  await rm(portFile,{force:true}).catch(()=>{});
  const exe=await resolveChromeExecutable();
  await prepareRegistrarChromeAppearance(sharedNaverChromeProfile).catch(()=>{});
  const args=['--user-data-dir='+sharedNaverChromeProfile,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--restore-last-session',initialUrl];
  const child=spawn(exe,args,{detached:true,windowsHide:false,stdio:'ignore'});
  let launchError;child.on('error',e=>{launchError=e;});child.unref();
  for(let n=0;n<35;n++){
    if(launchError)throw Error('전용 크롬을 실행하지 못했습니다: '+launchError.message);
    try{return await connect();}catch{await new Promise(r=>setTimeout(r,400));}
  }
  throw Error('전용 크롬에 연결하지 못했습니다.');
}

async function performMyboxUpload(request,destination){
  let connection=null,tab=null,keepTabOpen=false;
  try{
    connection=await connectSharedNaverChrome(destination.href);
    tab=await connection.context.newPage();
    await tab.goto(destination.href,{waitUntil:'domcontentloaded',timeout:30000});
    const deadline=Date.now()+15000;
    let ready=false,loginSeenAt=0;
    while(Date.now()<deadline){
      if(tab.isClosed())throw Error('MYBOX 탭이 닫혔습니다.');
      if(isMyboxLoginUrl(tab.url())){
        if(!loginSeenAt)loginSeenAt=Date.now();
        if(Date.now()-loginSeenAt>2000)break;
      }else if(await tab.evaluate(()=>document.body?.innerText?.includes('올리기')).catch(()=>false)){
        ready=true;break;
      }
      await tab.waitForTimeout(400);
    }
    if(!ready){
      keepTabOpen=true;
      throw Error('전용 크롬의 네이버 로그인이 필요합니다.');
    }
    const expectedKey=destination.searchParams.get('resourceKey');
    if(expectedKey&&new URL(tab.url()).searchParams.get('resourceKey')!==expectedKey)throw Error('MYBOX 배포 폴더에 진입하지 못했습니다.');
    await clickFirstVisible(tab,['button:has-text("올리기")','text="올리기"','a:has-text("올리기")','[role="button"]:has-text("올리기")'],15000);
    const chooserPromise=tab.waitForFileChooser({timeout:15000});
    await clickFirstVisible(tab,['text="파일 올리기"','button:has-text("파일 올리기")','li:has-text("파일 올리기")','[role="menuitem"]:has-text("파일 올리기")'],10000);
    const chooser=await chooserPromise;
    await chooser.setFiles(request.zipPath);
    await tab.waitForFunction(()=>/같은 이름|덮어쓰기|업로드 성공|업로드 완료/.test(document.body?.innerText||''),undefined,{timeout:120000});
    const afterSelectText=await tab.evaluate(()=>document.body?.innerText||'');
    if(/같은 이름|덮어쓰기/.test(afterSelectText)){
      await clickFirstVisible(tab,['button:has-text("덮어쓰기")','text="덮어쓰기"'],10000).catch(()=>{});
    }
    await tab.waitForFunction(()=>{const text=document.body?.innerText||'';return (text.includes('업로드 성공')||text.includes('업로드 완료'))&&/1\s*\/\s*1개\s*완료/.test(text);},undefined,{timeout:120000});
    const finalText=await tab.evaluate(()=>document.body?.innerText||'');
    if(!finalText.includes(request.filename)||(!finalText.includes('업로드 성공')&&!finalText.includes('업로드 완료')))throw Error('MYBOX 업로드 결과가 일치하지 않습니다.');
    return {mode:'mybox-chrome'};
  }finally{
    if(tab&&!keepTabOpen&&!tab.isClosed())await tab.close().catch(()=>{});
    if(connection?.browser)await connection.browser.close().catch(()=>{});
  }
}

async function writeReceipt(request,destination,meta={}){
  const receiptPath=path.join(deployHome,'upload-receipt.json');
  const tmp=receiptPath+'.tmp';
  const payload={
    attemptId:request.attemptId,
    sha:request.sourceCommit,
    filename:request.filename,
    provider:detectUploadProvider(destination.href),
    folderUrl:destination.href,
    uploadedAt:new Date().toISOString(),
    ...meta
  };
  await writeFile(tmp,JSON.stringify(payload,null,2));
  await rename(tmp,receiptPath);
}

async function runCli(){
  const requestPath=path.join(deployHome,'upload-request.json');
  const request=JSON.parse(await readFile(requestPath,'utf8'));
  const destination=validateMyboxRequest(request);
  const provider=detectUploadProvider(destination.href);
  try{
    const meta=provider==='gdrive'
      ? await performGoogleDriveUpload(request,destination)
      : await performMyboxUpload(request,destination);
    await writeReceipt(request,destination,meta);
    console.log('MYBOX_RESULT '+JSON.stringify({ok:true,provider,sha:request.sourceCommit,...meta}));
  }catch(error){
    console.log('MYBOX_RESULT '+JSON.stringify({ok:false,provider,error:stripAnsi(error.message)}));
    throw error;
  }
}

const isEntry=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntry){
  runCli().catch(error=>{console.error(error.message);process.exitCode=1;});
}
