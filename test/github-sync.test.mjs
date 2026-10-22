import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {publishable,syncGithub} from '../github-sync.mjs';
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
test('자동 반영 범위는 소스만 포함하고 개인 데이터와 인증 파일 제외',()=>{
 for(const file of ['public/app.js','test/check.test.mjs','server.mjs','.app-release.json','package.json'])assert.equal(publishable(file),true,file);
 for(const file of ['data/desktop-session.json','data/product.json','.env','node_modules/a.js','credentials.mjs','private/password.js','../outside.mjs'])assert.equal(publishable(file),false,file);
});
test('자동 커밋과 push, 인증 문자열 차단, 원격 변경을 덮어쓰지 않음',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'github-sync-'));
 try{
  const origin=path.join(root,'remote.git'),local=path.join(root,'local'),other=path.join(root,'other');
  git(root,['init','--bare','--initial-branch=main',origin]);await mkdir(local);
  git(local,['init','-b','main']);git(local,['config','user.name','Sync Test']);git(local,['config','user.email','sync@example.invalid']);
  git(local,['remote','add','origin',origin]);
  await writeFile(path.join(local,'package.json'),JSON.stringify({version:'0.40.0'}));
  git(local,['add','package.json']);git(local,['commit','-m','initial']);git(local,['push','-u','origin','main']);
  await writeFile(path.join(local,'server.mjs'),'// modified source');
  await mkdir(path.join(local,'data'));await writeFile(path.join(local,'data','desktop-session.json'),'private');
  const result=await syncGithub(local,{expectedRemote:origin});assert.equal(result.status,'synced');
  assert.equal(git(root,['--git-dir='+origin,'show','main:server.mjs']),'// modified source');
  assert.doesNotMatch(git(root,['--git-dir='+origin,'ls-tree','-r','--name-only','main']),/data\//);
  assert.equal((await syncGithub(local,{expectedRemote:origin})).sha,result.sha);
  await writeFile(path.join(local,'sample.mjs'),'const key="sk-'+ 'a'.repeat(40)+'";');
  await assert.rejects(syncGithub(local,{expectedRemote:origin}),/인증 정보/);await rm(path.join(local,'sample.mjs'));
  git(root,['clone',origin,other]);git(other,['config','user.name','Other Test']);git(other,['config','user.email','other@example.invalid']);
  await writeFile(path.join(other,'README.md'),'remote change');git(other,['add','README.md']);git(other,['commit','-m','remote edit']);git(other,['push','origin','main']);
  const remoteHead=git(other,['rev-parse','HEAD']).trim();
  await writeFile(path.join(local,'server.mjs'),'// next local change');
  await assert.rejects(syncGithub(local,{expectedRemote:origin}),/다른 변경/);
  assert.equal(git(root,['--git-dir='+origin,'rev-parse','main']).trim(),remoteHead);
  assert.equal(await readFile(path.join(local,'server.mjs'),'utf8'),'// next local change');
 }finally{await rm(root,{recursive:true,force:true});}
});
