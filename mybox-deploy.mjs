import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {publishable} from './github-sync.mjs';
import {writeUpdateZip} from './mybox-zip.mjs';

const exec=promisify(execFile);
export const MYBOX_BASE='82e1285378109e4795669aad0946c9e1bc9a9a5c';
const filename='최신업데이트.zip';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(root,args)=>exec('git',args,{cwd:root,windowsHide:true,timeout:45000,maxBuffer:32000000,encoding:'buffer'}).then(r=>r.stdout);
export function updateFileAllowed(file){
  return publishable(file)&&!file.startsWith('test/')&&!/\.(?:md|cmd)$/.test(file)&&!['.gitignore','.gitattributes'].includes(file);
}
export async function buildMyboxUpdate(root,sha,{base=MYBOX_BASE,outputRoot=path.join(root,'data','mybox-deploy')}={}){
  if(!/^[a-f0-9]{40}$/.test(sha)||!/^[a-f0-9]{40}$/.test(base))throw Error('배포 커밋을 확인해 주세요.');
  await git(root,['merge-base','--is-ancestor',base,sha]);
  const oldPackage=JSON.parse(await git(root,['show',base+':package.json']));
  const newPackage=JSON.parse(await git(root,['show',sha+':package.json']));
  for(const key of ['dependencies','optionalDependencies','engines']){
    if(JSON.stringify(oldPackage[key])!==JSON.stringify(newPackage[key]))throw Error('실행 환경이 변경되어 통합 실행판을 새로 배포해야 합니다.');
  }
  await mkdir(outputRoot,{recursive:true});
  const stage=await mkdtemp(path.join(outputRoot,'package-'));
  const names=(await git(root,['diff','--name-only','--no-renames','-z',base,sha])).toString('utf8').split('\0').filter(updateFileAllowed);
  const files=[],deleted=[];
  for(const file of names){
    let bytes;
    try{bytes=await git(root,['show',sha+':'+file]);}
    catch{await git(root,['cat-file','-e',sha+'^{commit}']);const present=(await git(root,['ls-tree','--name-only',sha,'--',file])).toString().trim();if(present)throw Error('배포 파일을 읽지 못했습니다: '+file);deleted.push(file);continue;}
    const output=path.join(stage,'payload',file);
    await mkdir(path.dirname(output),{recursive:true});await writeFile(output,bytes);
    files.push({path:file,sha256:digest(bytes),bytes:bytes.length});
  }
  const manifest={format:1,project:newPackage.name,baseCommit:base,sourceCommit:sha,version:newPackage.version,builtAt:new Date().toISOString(),dependencies:newPackage.dependencies,files,deleted};
  await writeFile(path.join(stage,'update-manifest.json'),JSON.stringify(manifest,null,2));
  await copyFile(path.join(root,'mybox-apply-update.mjs'),path.join(stage,'apply-update.mjs'));
  await writeFile(path.join(stage,'업데이트.cmd'),'@echo off\r\nchcp 65001 >nul\r\nset /p "target=기존 상품등록기 폴더 경로를 입력하세요: "\r\nif not exist "%target%\\runtime\\node.exe" (echo 실행 환경을 찾지 못했습니다.& pause& exit /b 1)\r\n"%target%\\runtime\\node.exe" "%~dp0apply-update.mjs" "%target%"\r\npause\r\n');
  await writeFile(path.join(stage,'사용방법.txt'),'ZIP 전체를 별도 폴더에 압축 해제한 뒤 업데이트.cmd를 실행하세요. 기존 통합 실행판 폴더(상품등록기.exe가 있는 폴더)의 경로를 입력하세요. 등록기를 종료한 상태에서 적용하며 기존 파일은 app/data/update-backups에 백업합니다. 설정·로그인·상품자료는 업데이트 대상이 아닙니다.\r\n','utf8');
  const temporary=path.join(outputRoot,sha+'.zip');
  const entries=[];
  async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await walk(file);else entries.push({name:path.relative(stage,file).replaceAll('\\','/'),bytes:await readFile(file)});}}
  await walk(stage);await writeUpdateZip(temporary,entries);
  return {manifest,stage,zipPath:temporary};
}

export async function createMyboxDeployment(root,{publish,build=buildMyboxUpdate,check,delayMs=60000,base=MYBOX_BASE}={}){
  const home=path.join(root,'data','mybox-deploy');await mkdir(home,{recursive:true});
  const settingsFile=path.join(home,'settings.json'),statusFile=path.join(home,'status.json');
  const load=async file=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {};}};
  let settings=await load(settingsFile),saved=await load(statusFile),pending=null,running=false,timer,stopped=false,attemptedSha=null,activeSha=null;
  const state={enabled:!!settings.enabled,status:'idle',message:settings.enabled?'GitHub 반영 후 MYBOX 자동배포 대기':'MYBOX 자동배포 꺼짐',lastSuccess:saved.lastSuccess||null};
  const persist=()=>writeFile(statusFile,JSON.stringify({lastSuccess:state.lastSuccess},null,2));
  async function validate(sha){
    if((await git(root,['rev-parse','HEAD'])).toString().trim()!==sha)throw Error('새 수정이 있어 다음 GitHub 반영을 기다립니다.');
    if((await git(root,['status','--porcelain','--untracked-files=no'])).length)throw Error('수정 중인 파일이 있어 배포를 보류합니다.');
  }
  const runChecks=check||(()=>exec(process.execPath,['--test','test/product.test.mjs','test/color-options.test.mjs','test/mybox-deploy.test.mjs'],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:4000000}));
  const upload=publish||(async request=>{
    const requestFile=path.join(home,'upload-request.json');await writeFile(requestFile,JSON.stringify(request,null,2));
    const entry=pathToFileURL(path.join(root,'mybox-browser-upload.mjs')).href;
    const result=await exec('ego-browser',['nodejs','-e',`await import(${JSON.stringify(entry)})`],{windowsHide:true,timeout:240000,maxBuffer:2000000});
    const line=result.stdout.split(/\r?\n/).find(line=>line.startsWith('MYBOX_RESULT '));
    if(!line||!JSON.parse(line.slice(13)).ok)throw Error('MYBOX 업로드 완료를 확인하지 못했습니다. 브라우저 연결과 로그인을 확인해 주세요.');
  });
  async function drain(){
    if(running||stopped||!state.enabled||!pending)return;
    running=true;const sha=pending;pending=null;activeSha=sha;attemptedSha=sha;
    try{
      state.status='testing';state.message='MYBOX 배포 전 테스트 중';
      await validate(sha);await runChecks();await validate(sha);
      if(pending&&pending!==sha)return;
      state.status='packing';state.message='누적 업데이트 파일 생성 중';
      const built=await build(root,sha,{base,outputRoot:home});
      await validate(sha);if(pending&&pending!==sha)return;
      if(stopped||!state.enabled)return;
      const fixed=path.join(home,filename);await copyFile(built.zipPath,fixed);
      state.status='uploading';state.message='MYBOX 최신 업데이트 교체 중';
      await upload({zipPath:fixed,sourceCommit:sha,folder:'상품등록기',filename,folderUrl:settings.folderUrl});
      state.lastSuccess={sha,version:built.manifest.version,at:new Date().toISOString(),filename};
      await persist();state.status='synced';state.message='MYBOX 최신 업데이트 반영 완료';
    }catch(error){state.status='error';state.message=error.message.startsWith('Command failed:')?'자동배포 실패 · 테스트 또는 MYBOX 연결을 확인해 주세요.':error.message;}
    finally{running=false;activeSha=null;if(pending&&!stopped&&state.enabled){clearTimeout(timer);timer=setTimeout(drain,delayMs);timer.unref();}}
  }
  function schedule(sha,{force=false}={}){
    if(!state.enabled||stopped||!sha||!force&&(sha===state.lastSuccess?.sha||sha===pending||sha===activeSha||sha===attemptedSha))return;
    pending=sha;clearTimeout(timer);timer=setTimeout(drain,delayMs);timer.unref();
    if(!running){state.status='pending';state.message='수정이 안정되면 MYBOX에 자동배포합니다.';}
  }
  return {state,schedule,async runNow(sha){if(running)throw Error('MYBOX 배포가 진행 중입니다.');pending=sha;clearTimeout(timer);await drain();return {...state};},async configure(enabled){
    if(typeof enabled!=='boolean')throw Error('자동배포 설정을 확인해 주세요.');
    settings={...settings,enabled};await writeFile(settingsFile,JSON.stringify(settings));state.enabled=enabled;
    if(!enabled){pending=null;clearTimeout(timer);state.message=running?'현재 배포가 끝나면 자동배포를 중지합니다.':'MYBOX 자동배포 꺼짐';}
    else{state.message='GitHub 반영 후 MYBOX 자동배포 대기';}
    return {...state};
  },stop(){stopped=true;pending=null;clearTimeout(timer);}};
}
