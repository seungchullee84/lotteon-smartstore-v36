import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {buildMyboxUpdate,createMyboxDeployment,updateFileAllowed} from '../mybox-deploy.mjs';
import {applyMyboxUpdate} from '../mybox-apply-update.mjs';
import {validateMyboxRequest,isMyboxLoginUrl} from '../mybox-browser-upload.mjs';
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'mybox-test-'));
  git(root,'init','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
  await writeFile(path.join(root,'.gitignore'),'data/\n');
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'giordano-lotte-register',version:'1.0.0',dependencies:{}}));
  await writeFile(path.join(root,'server.mjs'),'// original');
  git(root,'add','.');git(root,'commit','-m','base');const base=git(root,'rev-parse','HEAD');
  await writeFile(path.join(root,'server.mjs'),'// newest');
  await mkdir(path.join(root,'public'));await writeFile(path.join(root,'public','extra.js'),'// new');
  git(root,'add','.');git(root,'commit','-m','update');const sha=git(root,'rev-parse','HEAD');
  return {root,base,sha};
}
test('MYBOX payload excludes credentials, sessions, tests and traversal paths',()=>{
  for(const file of ['product.mjs','public/app.js','data/category-matches.json'])assert.equal(updateFileAllowed(file),true);
  for(const file of ['data/desktop-session.json','data/naver-api-settings.json','.env','test/private.test.mjs','../server.mjs'])assert.equal(updateFileAllowed(file),false,file);
});
test('cumulative package contains missed updates and only copyable app files plus path text',async()=>{
  const {root,base,sha}=await fixture();
  try{
    await writeFile(path.join(root,'later.mjs'),'// another change');git(root,'add','.');git(root,'commit','-m','later');
    const result=await buildMyboxUpdate(root,git(root,'rev-parse','HEAD'),{base});
    assert.equal(await readFile(path.join(result.stage,'app','server.mjs'),'utf8'),'// newest');
    assert.ok(result.manifest.files.some(file=>file.path==='later.mjs'));
    assert.ok(result.manifest.files.some(file=>file.path==='public/extra.js'));
    assert.deepEqual((await readdir(result.stage)).sort(),['app','복사경로.txt','업데이트 적용.cmd','업데이트 정보.json','mybox-apply-update.mjs'].sort());
    assert.notEqual(result.manifest.sourceCommit,sha);
    assert.equal((await readFile(result.zipPath)).readUInt32LE(0),0x04034b50);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('dependency changes require a full distribution before anything is uploaded',async()=>{
  const {root,base}=await fixture();
  try{
    await writeFile(path.join(root,'package.json'),JSON.stringify({name:'giordano-lotte-register',version:'2.0.0',dependencies:{newDependency:'1.0.0'}}));git(root,'add','.');git(root,'commit','-m','dependency');
    await assert.rejects(buildMyboxUpdate(root,git(root,'rev-parse','HEAD'),{base}),/실행 환경/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('deployment remembers success, suppresses repeated commits and stops on test failure',async()=>{
  const {root,base,sha}=await fixture();let uploads=0;
  try{
    const build=async()=>({manifest:{version:'1.0.1'},zipPath:path.join(root,'sample.zip')});
    await writeFile(path.join(root,'sample.zip'),'archive');
    const service=await createMyboxDeployment(root,{base,build,publish:async()=>{uploads++;service.schedule(sha);},check:async()=>{}});
    await service.configure(true);
    // Generated data is ignored, and the fixture archive is deliberately untracked.
    await service.runNow(sha);assert.equal(uploads,1);assert.equal(service.state.status,'synced');
    service.schedule(sha);assert.equal(service.state.status,'synced');service.stop();
    const failed=await createMyboxDeployment(root,{base,build,publish:async()=>{uploads++;},check:async()=>{throw Error('test failed');}});
    await failed.runNow(sha);assert.equal(failed.state.status,'error');assert.equal(uploads,1);assert.equal(failed.state.lastSuccess.sha,sha);failed.stop();
  }finally{await rm(root,{recursive:true,force:true});}
});
test('copying the app folder updates code while retaining existing PC settings',async()=>{
  const {root,base,sha}=await fixture();
  try{
    const built=await buildMyboxUpdate(root,sha,{base});
    const install=path.join(root,'installed'),app=path.join(install,'app');await mkdir(path.join(app,'data'),{recursive:true});
    await writeFile(path.join(app,'package.json'),JSON.stringify({name:'giordano-lotte-register',dependencies:{}}));
    await writeFile(path.join(app,'server.mjs'),'// original');
    await writeFile(path.join(app,'data','browser-login-settings.json'),'preserve-this-PC');
    await writeFile(path.join(install,'build-manifest.json'),JSON.stringify({sourceCommit:base,version:'1.0.0'}));
    await cp(path.join(built.stage,'app'),app,{recursive:true});
    assert.equal(await readFile(path.join(app,'server.mjs'),'utf8'),'// newest');
    assert.equal(await readFile(path.join(app,'data','browser-login-settings.json'),'utf8'),'preserve-this-PC');
    assert.equal(await readFile(path.join(app,'public','extra.js'),'utf8'),'// new');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('MYBOX 적용은 기존 실행 파일 옆 코드만 바꾸고 손상된 패키지는 막는다',async()=>{
  const {root,base}=await fixture();
  try{
    const pkg={name:'giordano-lotte-register',version:'1.1.0',dependencies:{}};
    await writeFile(path.join(root,'package.json'),JSON.stringify(pkg));
    git(root,'add','.');git(root,'commit','-m','release');
    const {stage}=await buildMyboxUpdate(root,git(root,'rev-parse','HEAD'),{base});
    const install=path.join(root,'기존 등록기'),app=path.join(install,'app'),launcher=path.join(install,'상품등록기.exe');
    await mkdir(path.join(app,'data'),{recursive:true});await mkdir(path.join(install,'runtime'));
    await writeFile(launcher,'launcher');await writeFile(path.join(install,'runtime','node.exe'),'runtime');
    await writeFile(path.join(app,'package.json'),JSON.stringify({...pkg,version:'1.0.0'}));
    await writeFile(path.join(app,'server.mjs'),'// original');
    await writeFile(path.join(app,'data','browser-login-settings.json'),'local-only');
    const pending=path.join(stage,'app','public','extra.js');
    await writeFile(pending,'damaged');
    await assert.rejects(applyMyboxUpdate(stage,launcher),/손상/);
    assert.equal(await readFile(path.join(app,'server.mjs'),'utf8'),'// original');
    await writeFile(pending,'// new');
    const updated=await applyMyboxUpdate(stage,launcher);
    assert.equal(updated.version,'1.1.0');
    assert.equal(await readFile(path.join(app,'server.mjs'),'utf8'),'// newest');
    assert.equal(await readFile(path.join(app,'public','extra.js'),'utf8'),'// new');
    assert.equal(await readFile(path.join(app,'data','browser-login-settings.json'),'utf8'),'local-only');
    await assert.rejects(readFile(path.join(app,'app','server.mjs')), {code:'ENOENT'});
    assert.equal((await applyMyboxUpdate(stage,launcher)).version,'1.1.0');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('product work defers deployment before tests or upload begin',async()=>{
  const {root,base,sha}=await fixture();let checks=0,uploads=0;
  try{
    const service=await createMyboxDeployment(root,{base,isBusy:()=>true,check:async()=>{checks++;},publish:async()=>{uploads++;}});
    await service.configure(true);await service.runNow(sha);
    assert.equal(service.state.status,'pending');assert.equal(checks,0);assert.equal(uploads,0);service.stop();
  }finally{await rm(root,{recursive:true,force:true});}
});

test('Playwright MYBOX uploader validates fixed destination, fixed archive name and login URLs',()=>{
  const dest=validateMyboxRequest({folderUrl:'https://mybox.naver.com/main/web/my',zipPath:'C:/tmp/최신업데이트.zip'});
  assert.equal(dest.href,'https://mybox.naver.com/main/web/my');
  assert.throws(()=>validateMyboxRequest({folderUrl:'https://example.com/main/web/my',zipPath:'C:/tmp/최신업데이트.zip'}),/MYBOX 배포 위치/);
  assert.throws(()=>validateMyboxRequest({folderUrl:'https://mybox.naver.com/main/web/my',zipPath:'C:/tmp/other.zip'}),/고정 업데이트 파일명/);
  assert.equal(isMyboxLoginUrl('https://nid.naver.com/nidlogin.login'),true);
  assert.equal(isMyboxLoginUrl('https://mybox.naver.com/about/introduce'),true);
  assert.equal(isMyboxLoginUrl('https://mybox.naver.com/main/web/my'),false);
});
