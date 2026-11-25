import {access,mkdir,readFile,rename,writeFile} from 'node:fs/promises';
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

async function openContext({headless}){
  await mkdir(profileDir,{recursive:true});
  const executablePath=await resolveChromeExecutable();
  const options={
    headless,
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

async function waitForMyboxReady(page,timeoutMs){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(page.isClosed())throw Error('MYBOX 로그인 창이 닫혔습니다.');
    const currentUrl=page.url();
    if(!isMyboxLoginUrl(currentUrl)){
      const ready=await page.evaluate(()=>document.body?.innerText?.includes('올리기')).catch(()=>false);
      if(ready)return true;
    }
    await page.waitForTimeout(600);
  }
  return false;
}

async function performUpload(page,request,destination){
  const expectedKey=destination.searchParams.get('resourceKey');
  const currentKey=new URL(page.url()).searchParams.get('resourceKey');
  if(expectedKey&&currentKey!==expectedKey)throw Error('MYBOX 배포 폴더에 진입하지 못했습니다.');
  await page.locator('button:has-text("올리기"), a:has-text("올리기"), [role="button"]:has-text("올리기")').first().click({timeout:15000});
  const fileUploadOption=page.locator('text="파일 올리기"').first();
  await fileUploadOption.waitFor({state:'visible',timeout:10000});
  const chooserPromise=page.waitForFileChooser({timeout:10000});
  await fileUploadOption.click();
  const chooser=await chooserPromise;
  await chooser.setFiles(request.zipPath);

  await page.waitForFunction(
    ()=>/같은 이름|덮어쓰기|업로드 성공|업로드 완료/.test(document.body?.innerText||''),
    undefined,
    {timeout:120000}
  );
  const afterSelectText=await page.evaluate(()=>document.body?.innerText||'');
  if(/같은 이름|덮어쓰기/.test(afterSelectText)){
    const overwrite=page.locator('button:has-text("덮어쓰기"), text="덮어쓰기"').first();
    if(await overwrite.isVisible().catch(()=>false))await overwrite.click({timeout:10000});
  }
  await page.waitForFunction(
    ()=>{
      const text=document.body?.innerText||'';
      return (text.includes('업로드 성공')||text.includes('업로드 완료'))&&(/1\s*\/\s*1개\s*완료/.test(text)||text.includes('최신업데이트.zip'));
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

  let context=null;
  try{
    if(!forceVisible){
      context=await openContext({headless:true});
      const page=context.pages()[0]||await context.newPage();
      await page.goto(destination.href,{waitUntil:'domcontentloaded',timeout:30000});
      const ready=await waitForMyboxReady(page,12000);
      if(ready){
        await performUpload(page,request,destination);
        await writeReceipt(request,destination);
        console.log('MYBOX_RESULT '+JSON.stringify({ok:true,mode:'headless',sha:request.sourceCommit}));
        return;
      }
      await context.close().catch(()=>{});
      context=null;
    }

    // Session missing or expired: open visible window for user login (up to 3 minutes).
    context=await openContext({headless:false});
    const page=context.pages()[0]||await context.newPage();
    const loginUrl='https://nid.naver.com/nidlogin.login?url='+encodeURIComponent(destination.href);
    await page.goto(destination.href,{waitUntil:'domcontentloaded',timeout:30000});
    let ready=await waitForMyboxReady(page,5000);
    if(!ready){
      if(isMyboxLoginUrl(page.url())&&!page.url().includes('nid.naver.com')){
        await page.goto(loginUrl,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
      }
      ready=await waitForMyboxReady(page,180000);
    }
    if(!ready)throw Error('MYBOX 로그인이 필요합니다. 열린 브라우저에서 로그인을 완료해 주세요.');
    if(loginOnly){
      console.log('MYBOX_RESULT '+JSON.stringify({ok:true,mode:'login-only'}));
      return;
    }
    await performUpload(page,request,destination);
    await writeReceipt(request,destination);
    console.log('MYBOX_RESULT '+JSON.stringify({ok:true,mode:'visible',sha:request.sourceCommit}));
  }catch(error){
    console.log('MYBOX_RESULT '+JSON.stringify({ok:false,error:error.message}));
    throw error;
  }finally{
    if(context)await context.close().catch(()=>{});
  }
}

const isEntry=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntry){
  runCli().catch(error=>{console.error(error.message);process.exitCode=1;});
}
