import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
const remote='https://github.com/seungchullee84/lotteon-smartstore-v36.git';
export function publishable(file){
 if(['brand-intro.jpg','benefits.jpg','shipping.jpg','returns.jpg','store.jpg','GowunDodum-Regular.ttf'].some(name=>file==='public/smartstore-template/'+name))return true;
 if(file.includes('..')||file.includes('\\'))return false;
 if(['.gitignore','.gitattributes','.app-release.json','package.json','pnpm-lock.yaml'].includes(file))return true;
 if(['data/category-catalog-common.json','data/category-catalog-standard.json','data/category-crosswalk.json','data/category-matches.json','data/category-itemscout-verified.json','data/washing-icon-library.json'].includes(file))return true;
 return /^(?:[^/.]+\.(?:mjs|js|md|ps1|cmd)|(?:public|test)\/(?:[^/]+\/)*[^/]+\.(?:mjs|js|html|css|md|svg))$/.test(file)&&!/(?:secret|credential|session|password|\.env)/i.test(file);
}
async function git(root,args){
 const r=await exec('git',args,{cwd:root,windowsHide:true,timeout:45000,maxBuffer:8000000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
 return r.stdout;
}
async function changed(root){
 const tracked=await git(root,['diff','--name-only','--no-renames','-z','HEAD']);
 const added=await git(root,['ls-files','--others','--exclude-standard','-z']);
 return [...new Set((tracked+added).split('\0').filter(Boolean))].filter(publishable).sort();
}
const sensitive=/(?:sk-(?:proj-)?[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
export async function syncGithub(root,{expectedRemote=remote}={}){
 if((await git(root,['remote','get-url','origin'])).trim()!==expectedRemote)throw Error('설정된 GitHub 저장소가 다릅니다.');
 if((await git(root,['branch','--show-current'])).trim()!=='main')throw Error('main 브랜치에서만 자동 반영합니다.');
 const files=await changed(root);
 for(const file of files){
  let content;try{content=await readFile(path.join(root,file),'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(sensitive.test(content))throw Error('인증 정보로 보이는 내용이 있어 자동 업로드를 중단했습니다.');
 }
 if(files.length){
  await git(root,['add','--all','--',...files]);
  const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
  await git(root,['commit','--only','-m',`Auto-sync project ${version}`,'--',...files]);
 }
 // Refresh the remote before reporting success: a freshly copied checkout can
 // have stale origin/main, especially after its remote URL has been changed.
 await git(root,['fetch','origin','main']);
 try{await git(root,['merge-base','--is-ancestor','origin/main','HEAD']);}catch{throw Error('GitHub에 다른 변경이 있습니다. 충돌 확인 후 다시 연결해 주세요.');}
 // Inspect every pending commit, including a previous failed push, before publishing.
 const commits=(await git(root,['rev-list','origin/main..HEAD'])).trim().split('\n').filter(Boolean);
 if(!commits.length)return {status:'synced',sha:(await git(root,['rev-parse','HEAD'])).trim()};
 for(const commit of commits){
  const paths=(await git(root,['diff-tree','--no-commit-id','--name-only','--no-renames','-r','-z',commit])).split('\0').filter(Boolean);
  if(paths.some(p=>!publishable(p)))throw Error('자동 반영 범위 밖의 파일이 커밋에 있어 업로드를 중단했습니다.');
  for(const file of paths){
   let content;try{content=await git(root,['show',commit+':'+file]);}catch{continue;}
   if(sensitive.test(content))throw Error('커밋에 인증 정보로 보이는 내용이 있어 업로드를 중단했습니다.');
  }
 }
 await git(root,['push','origin','HEAD:refs/heads/main']);
 return {status:'synced',sha:(await git(root,['rev-parse','HEAD'])).trim(),syncedAt:new Date().toISOString()};
}
export function startGithubSync(root,{beforeSync=async()=>{},interval=2000,quietMs=1000}={}){
 let busy=false,lastHash=null,changedAt=0,stopped=false;
 const state={status:'checking',message:'GitHub 연결 확인 중'};
 async function tick(){
  if(busy||stopped)return;busy=true;
  try{
   await beforeSync();
   const files=await changed(root);const hash=createHash('sha256');
   for(const file of files){hash.update(file);try{hash.update(await readFile(path.join(root,file)));}catch(e){if(e.code!=='ENOENT')throw e;hash.update('deleted');}}
   const digest=hash.digest('hex');
   if(digest!==lastHash){lastHash=digest;changedAt=Date.now();}
   if(files.length&&Date.now()-changedAt<quietMs){state.status='pending';state.message='수정 완료 후 GitHub에 자동 반영합니다.';return;}
   state.status='syncing';state.message='GitHub 반영 중';
   Object.assign(state,await syncGithub(root),{message:'GitHub 반영 완료'});
  }catch(e){state.status='error';state.message=e.message.startsWith('Command failed:')?'GitHub 반영 실패 — 네트워크 또는 Git 로그인을 확인해 주세요.':e.message;}
  finally{busy=false;}
 }
 const timer=setInterval(tick,interval);timer.unref();void tick();
 return {state,stop(){stopped=true;clearInterval(timer);}};
}
