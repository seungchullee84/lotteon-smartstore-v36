import {createHash,randomUUID} from 'node:crypto';
import {copyFile,lstat,mkdir,mkdtemp,open,readFile,realpath,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const stat=async file=>lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const versionParts=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value)?value.split('.').map(Number):null;
function earlier(a,b){
 for(const [index,value] of a.entries()){if(value!==b[index])return value<b[index];}
 return false;
}
const publicData=new Set(['category-catalog-common','category-catalog-standard','category-crosswalk','category-matches','category-itemscout-verified','washing-icon-library'].map(name=>'data/'+name+'.json'));

function updatePath(file){
 return typeof file==='string'&&(/^(?:[a-z\d_-]+\.(?:mjs|js|ps1)|\.app-release\.json|package\.json|pnpm-lock\.yaml)$/i.test(file)||
  /^(?:public|research)\/(?:[a-z\d_.-]+\/)*[a-z\d_.-]+$/i.test(file)||publicData.has(file))&&
  !file.split('/').some(part=>part.startsWith('.')&&part!=='.app-release.json');
}

async function inspectTarget(root,relative){
 let target=root;const parts=relative.split('/');
 for(const [index,part] of parts.entries()){
  target=path.join(target,part);
  const info=await stat(target);
  if(info&&(index===parts.length-1?!info.isFile():!info.isDirectory()))throw Error('적용 경로를 확인해 주세요: '+relative);
 }
 return {target,exists:!!await stat(target)};
}

async function replaceFile(source,target){
 const temporary=target+'.update-'+randomUUID();
 try{await copyFile(source,temporary);await rename(temporary,target);}
 finally{await rm(temporary,{force:true});}
}

export async function applyMyboxUpdate(sourceRoot,launcher){
 const manifest=await readJson(path.join(sourceRoot,'업데이트 정보.json'));
 const available=versionParts(manifest.version),minimum=versionParts(manifest.minimumVersion);
 if(manifest.format!==1||manifest.project!=='giordano-lotte-register'||!available||!minimum||!Array.isArray(manifest.files)||manifest.deleted?.length)throw Error('업데이트 파일을 다시 다운로드해 주세요.');
 const executable=await realpath(launcher);
 if(path.basename(executable)!=='상품등록기.exe'||!(await stat(executable))?.isFile())throw Error('기존 상품등록기.exe를 선택해 주세요.');
 const folder=path.dirname(executable),app=path.join(folder,'app');
 if(!(await stat(app))?.isDirectory()||!(await stat(path.join(folder,'runtime','node.exe')))?.isFile()||!(await stat(path.join(app,'server.mjs')))?.isFile())throw Error('기존 Windows 실행판의 상품등록기.exe를 선택해 주세요.');
 const installed=await readJson(path.join(app,'package.json')),current=versionParts(installed.version);
 if(installed.name!==manifest.project||!current||earlier(current,minimum)||!isDeepStrictEqual(installed.dependencies,manifest.dependencies))throw Error('이 설치판에는 MYBOX의 Windows 통합 실행판이 필요합니다.');
 if(earlier(available,current))throw Error('이 PC에 더 최신 버전이 설치되어 있습니다.');
 const session=await readJson(path.join(app,'data','active-register-session.json')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(Number.isInteger(session?.port)&&session.port>0&&session.port<=65535&&typeof session.token==='string'){
  const url=new URL('http://127.0.0.1:'+session.port+'/');url.searchParams.set('key',session.token);
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(800)}).catch(()=>null);
  if(response?.headers.has('set-cookie'))throw Error('상품등록기 실행 창에서 종료를 누른 뒤 다시 적용해 주세요.');
 }
 const lockPath=path.join(folder,'.mybox-update.lock');
 const lock=await open(lockPath,'wx').catch(error=>{if(error.code==='EEXIST')throw Error('다른 업데이트가 진행 중입니다.');throw error;});
 let backup;const changed=[];
 try{
  const files=[],seen=new Set();
  for(const entry of manifest.files){
   if(!updatePath(entry.path)||seen.has(entry.path.toLowerCase()))throw Error('업데이트 파일 목록을 확인해 주세요.');
   seen.add(entry.path.toLowerCase());
   const source=path.join(sourceRoot,'app',entry.path),bytes=await readFile(source);
   if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('업데이트 파일이 손상되었습니다: '+entry.path);
   const target=await inspectTarget(app,entry.path);
   if(!target.exists||!entry.path.startsWith('data/'))files.push({...target,source,relative:entry.path});
  }
  const supplied=await readJson(path.join(sourceRoot,'app','package.json'));
  if(!seen.has('package.json')||supplied.version!==manifest.version||supplied.name!==installed.name||!isDeepStrictEqual(supplied.dependencies,manifest.dependencies))throw Error('업데이트 버전 정보를 확인해 주세요.');
  backup=await mkdtemp(path.join(tmpdir(),'registrar-update-backup-'));
  for(const file of files){
   await mkdir(path.dirname(file.target),{recursive:true});
   if(file.exists){file.backup=path.join(backup,file.relative);await mkdir(path.dirname(file.backup),{recursive:true});await copyFile(file.target,file.backup);}
   await replaceFile(file.source,file.target);
   changed.push(file);
  }
  if((await readJson(path.join(app,'package.json'))).version!==manifest.version)throw Error('적용한 버전을 확인하지 못했습니다.');
  return {version:manifest.version,folder};
 }catch(error){
  try{for(const file of changed.reverse()){if(file.backup)await replaceFile(file.backup,file.target);else await rm(file.target);}}
  catch{const retained=backup;backup=null;throw Error('업데이트 백업을 보관했습니다: '+retained);}
  throw error;
 }finally{
  await lock.close();
  await rm(lockPath,{force:true});
  if(backup)await rm(backup,{recursive:true,force:true});
 }
}

const script=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===script){
 try{
  const result=await applyMyboxUpdate(path.dirname(script),process.argv[2]);
  console.log('업데이트 완료: '+result.version+'\n적용 위치: '+result.folder+'\n선택한 상품등록기.exe를 다시 실행하세요.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
