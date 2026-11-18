import {readFile,writeFile,copyFile,mkdir,lstat,rename,unlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const exec=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const publicData=new Set(['category-catalog-common.json','category-catalog-standard.json','category-crosswalk.json','category-matches.json','category-itemscout-verified.json','washing-icon-library.json']);
async function exists(file){try{await lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function checkedPath(parent,relative){
  if(!relative||relative.includes('..')||relative.includes('\\')||path.isAbsolute(relative)||relative.includes(':'))throw Error('잘못된 업데이트 파일 경로');
  if(relative.startsWith('data/')&&!publicData.has(relative.slice(5)))throw Error('개인 데이터는 업데이트할 수 없습니다.');
  if(!/^(?:[^/]+\.(?:mjs|js|json|ps1)|\.app-release\.json|public\/.+|research\/(?:apparel-tags|official-benefits)\/.+|data\/[^/]+)$/.test(relative))throw Error('업데이트 범위 밖의 파일');
  const result=path.resolve(parent,relative);
  if(!result.startsWith(parent+path.sep))throw Error('업데이트 경로 이탈');
  let cursor=result;
  while(cursor.startsWith(parent)){
    if(await exists(cursor)&&(await lstat(cursor)).isSymbolicLink())throw Error('연결된 경로에는 업데이트할 수 없습니다.');
    if(cursor===parent)break;cursor=path.dirname(cursor);
  }
  return result;
}
export async function applyMyboxUpdate(packageRoot,installRoot,{verifyOnly=false}={}){
  packageRoot=path.resolve(packageRoot);installRoot=path.resolve(installRoot);
  const app=path.join(installRoot,'app'),buildFile=path.join(installRoot,'build-manifest.json');
  const manifest=JSON.parse(await readFile(path.join(packageRoot,'update-manifest.json'),'utf8'));
  const installed=JSON.parse(await readFile(path.join(app,'package.json'),'utf8'));
  const previousBuild=await readFile(buildFile),build=JSON.parse(previousBuild);
  if(manifest.format!==1||manifest.project!==installed.name)throw Error('업데이트 대상 프로그램이 다릅니다.');
  if(build.sourceCommit!==manifest.baseCommit&&build.baseCommit!==manifest.baseCommit&&build.sourceCommit!=='e66a04e1015ff1a9aa05381019bef0261a795f1f')throw Error('11월 17일 통합 실행판 이후 버전이 필요합니다.');
  if(JSON.stringify(installed.dependencies)!==JSON.stringify(manifest.dependencies))throw Error('실행 환경이 달라 통합 실행판 업데이트가 필요합니다.');
  if(process.platform==='win32'){
    const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json`],{windowsHide:true,timeout:10000});
    const processes=result.stdout.trim()?JSON.parse(result.stdout):[];
    const prefix=(installRoot+path.sep).toLowerCase();
    if([processes].flat().some(p=>p.ProcessId!==process.pid&&p.ExecutablePath?.toLowerCase().startsWith(prefix)))throw Error('등록기와 가격변경기를 종료한 뒤 다시 적용하세요.');
  }
  const seen=new Set(),actions=[];
  for(const file of manifest.files){
    const target=await checkedPath(app,file.path),source=await checkedPath(path.join(packageRoot,'payload'),file.path);
    if(seen.has(target))throw Error('중복 업데이트 파일');seen.add(target);
    const bytes=await readFile(source);if(hash(bytes)!==file.sha256)throw Error('업데이트 파일 손상: '+file.path);
    actions.push({target,relative:file.path,bytes});
  }
  for(const relative of manifest.deleted){const target=await checkedPath(app,relative);if(seen.has(target))throw Error('중복 삭제 경로');seen.add(target);actions.push({target,relative});}
  if(verifyOnly)return {verified:true,files:actions.length};
  const backup=path.join(app,'data','update-backups',Date.now()+'-'+randomUUID());await mkdir(backup,{recursive:true});
  const changed=[];
  try{
    await writeFile(path.join(backup,'build-manifest.json'),previousBuild);
    for(const action of actions){
      const saved=path.join(backup,action.relative),existed=await exists(action.target);
      if(existed){await mkdir(path.dirname(saved),{recursive:true});await copyFile(action.target,saved);}
      changed.push({...action,saved,existed});
      if(action.bytes){await mkdir(path.dirname(action.target),{recursive:true});const temporary=action.target+'.update-'+randomUUID();await writeFile(temporary,action.bytes);await rename(temporary,action.target);}
      else if(existed)await unlink(action.target);
    }
    await writeFile(buildFile,JSON.stringify({...build,baseCommit:manifest.baseCommit,sourceCommit:manifest.sourceCommit,version:manifest.version},null,2));
  }catch(error){
    for(const action of changed.reverse()){if(action.existed)await copyFile(action.saved,action.target);else if(await exists(action.target))await unlink(action.target);}
    await writeFile(buildFile,previousBuild);throw error;
  }
  return {version:manifest.version,sha:manifest.sourceCommit,backup};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    if(!process.argv[2])throw Error('기존 통합 실행판 폴더를 지정해 주세요.');
    console.log('업데이트 완료',await applyMyboxUpdate(path.dirname(fileURLToPath(import.meta.url)),process.argv[2],{verifyOnly:process.argv.includes('--verify-only')}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
