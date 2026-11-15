import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createBackgroundRunner,createExecutableResolver} from '../background-runner.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,options={}){
 const root=await mkdtemp(path.join(tmpdir(),'background-runner-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const children=[],calls=[],failures=[],progress=[],exits=[],kills=[];
 const spawnImpl=(executable,args,config)=>{
  const child=new EventEmitter(),input=[];child.pid=4200+children.length;child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.stdin=new Writable({write(chunk,encoding,done){input.push(Buffer.from(chunk));done();}});child.input=()=>Buffer.concat(input).toString();
  children.push(child);calls.push({executable,args,config});process.nextTick(()=>child.emit('spawn'));return child;
 };
 const killTreeImpl=async child=>{kills.push(child.pid);child.emit('close',null,'SIGTERM');};
 const runner=createBackgroundRunner({root,executable:'C:/Program Files/Codex/codex.exe',spawnImpl,killTreeImpl,onFailure:v=>failures.push(v),onProgress:v=>progress.push(v),onExit:v=>exits.push(v),...options});
 return {root,runner,children,calls,failures,progress,exits,kills};
}

test('prompt is sent through stdin, executable/arguments never use a shell, and thread identity is not inherited',async t=>{
 const f=await fixture(t),before={...process.env},prompt='품번 작업\n" & whoami; $(echo injected) `literal`';
 assert.deepEqual(await f.runner.start({jobId:'job_123456',prompt}),{started:true});
 const call=f.calls[0],directory=path.join(f.root,'data','background-jobs','job_123456');
 assert.equal(call.executable,'C:/Program Files/Codex/codex.exe');assert.equal(call.config.shell,false);assert.equal(call.config.windowsHide,true);assert.equal(call.config.cwd,directory);
 assert.deepEqual(call.args,['exec','--ephemeral','--skip-git-repo-check','--sandbox','workspace-write','-c','sandbox_workspace_write.network_access=true','--json','--output-last-message',path.join(directory,'result.txt'),'-']);
 assert(!call.args.includes(prompt));assert.equal(f.children[0].input(),prompt);
 const expected={...before};delete expected.CODEX_THREAD_ID;assert.deepEqual(call.config.env,expected);assert.deepEqual({...process.env},before);
 assert.equal(f.runner.status().running,true);assert.equal(f.runner.status().jobId,'job_123456');
 f.children[0].emit('close',0,null);assert.equal(f.runner.status().phase,'exited');assert.equal(f.runner.status().running,false);
 assert.deepEqual(f.exits,[{jobId:'job_123456',code:0,signal:null}]);assert.deepEqual(f.failures,[]);
 assert(!JSON.stringify(f.runner.status()).includes('완료'),'process exit does not claim image application success');
});

test('explicit danger-full-access is passed as one sandbox argument without workspace-only configuration',async t=>{
 const f=await fixture(t,{sandboxMode:'danger-full-access'}),prompt='원본과 현재 상품 검증 후 합성';
 await f.runner.start({jobId:'job_access',prompt});
 const call=f.calls[0],directory=path.join(f.root,'data','background-jobs','job_access');
 assert.deepEqual(call.args,['exec','--ephemeral','--skip-git-repo-check','--sandbox','danger-full-access','--json','--output-last-message',path.join(directory,'result.txt'),'-']);
 assert(!call.args.includes('sandbox_workspace_write.network_access=true'));assert(!call.args.includes('--dangerously-bypass-approvals-and-sandbox'));
 assert.equal(call.config.shell,false);assert.equal(call.config.windowsHide,true);assert.equal(f.children[0].input(),prompt);
 f.children[0].emit('close',0,null);assert.equal(f.runner.status().phase,'exited');assert.deepEqual(f.failures,[]);
});

test('unknown or malformed sandbox modes are rejected before resolving or spawning Codex',()=>{
 for(const sandboxMode of ['',null,false,0,{},'invalid','danger-full-access --extra','workspace-write; whoami'])assert.throws(()=>createBackgroundRunner({root:process.cwd(),sandboxMode,resolveExecutableImpl:()=>assert.fail('invalid mode must not resolve executable'),spawnImpl:()=>assert.fail('invalid mode must not spawn')}),/허용된 Codex 실행 환경/);
});

test('only one process can run, including while startup is pending',async t=>{
 const f=await fixture(t),first=f.runner.start({jobId:'job_first1',prompt:'first'});
 await assert.rejects(f.runner.start({jobId:'job_second',prompt:'second'}),/이미.*진행/);await first;
 await assert.rejects(f.runner.start({jobId:'job_second',prompt:'second'}),/이미.*진행/);assert.equal(f.calls.length,1);
 f.children[0].emit('close',0,null);await f.runner.start({jobId:'job_second',prompt:'second'});assert.equal(f.calls.length,2);f.children[1].emit('close',0,null);
});

test('failed spawn is sanitized, releases the active slot and reports failure once',async t=>{
 const f=await fixture(t,{spawnImpl:()=>{throw Error('private executable diagnostic');}});
 await assert.rejects(f.runner.start({jobId:'job_failed',prompt:'private prompt'}),/프로세스를 시작하지 못했습니다/);
 assert.equal(f.runner.status().running,false);assert.equal(f.failures.length,1);assert.equal(f.exits.length,1);
 assert(!JSON.stringify([f.runner.status(),f.failures,f.exits]).includes('private'));
});

test('asynchronous spawn error fails the start and a following close does not duplicate callbacks',async t=>{
 let child;
 const f=await fixture(t,{spawnImpl:()=>{child=new EventEmitter();process.nextTick(()=>child.emit('error',Error('private ENOENT')));return child;}});
 await assert.rejects(f.runner.start({jobId:'job_error1',prompt:'request'}),/시작하지 못했습니다/);
 child.emit('close',-2,null);assert.equal(f.failures.length,1);assert.equal(f.exits.length,1);assert.equal(f.runner.status().running,false);
});

test('cancel kills the scoped process tree and waits for exit before allowing another job',async t=>{
 const f=await fixture(t);await f.runner.start({jobId:'job_cancel',prompt:'request'});
 assert.deepEqual(await f.runner.cancel(),{cancelled:true});assert.deepEqual(f.kills,[4200]);assert.equal(f.runner.status().phase,'cancelled');assert.equal(f.runner.status().running,false);assert.equal(f.failures.length,0);assert.equal(f.exits.length,1);
 assert.deepEqual(await f.runner.cancel(),{cancelled:false});
});

test('timeout terminates the process and never reports successful completion',async t=>{
 const f=await fixture(t,{timeoutMs:20});await f.runner.start({jobId:'job_timed1',prompt:'request'});
 await new Promise(resolve=>setTimeout(resolve,60));assert.equal(f.runner.status().phase,'timed-out');assert.deepEqual(f.kills,[4200]);assert.equal(f.failures.length,1);assert.equal(f.exits.length,1);
});

test('failed cancellation keeps the process slot occupied until actual exit',async t=>{
 const f=await fixture(t,{killTreeImpl:async()=>{throw Error('private kill failure');}});await f.runner.start({jobId:'job_kill12',prompt:'request'});
 await assert.rejects(f.runner.cancel(),/중단을 확인하지 못했습니다/);assert.equal(f.runner.status().running,true);
 await assert.rejects(f.runner.start({jobId:'job_next12',prompt:'request'}),/이미.*진행/);assert.equal(f.calls.length,1);assert.equal(f.failures.length,1);
 f.children[0].emit('close',null,'SIGTERM');assert.equal(f.runner.status().running,false);
});

test('cancel during preparation never starts a child process',async t=>{
 const f=await fixture(t),starting=f.runner.start({jobId:'job_early1',prompt:'request'});
 assert.deepEqual(await f.runner.cancel(),{cancelled:true});await assert.rejects(starting,/취소/);assert.equal(f.calls.length,0);assert.equal(f.runner.status().phase,'cancelled');
});

test('stdout/stderr logs are bounded and progress never exposes arbitrary tool output',async t=>{
 const f=await fixture(t,{logLimitBytes:160});await f.runner.start({jobId:'job_logs12',prompt:'request'});
 const child=f.children[0],event=JSON.stringify({type:'item.started',item:{type:'image_generation',output:'SECRET IMAGE CONTENT'}})+'\n';
 child.stdout.write(event.slice(0,25));child.stdout.write(event.slice(25));child.stdout.write('SECRET '.repeat(20000)+'\n');child.stderr.write('PRIVATE STDERR '.repeat(1000));
 child.emit('close',7,null);await tick();
 const directory=path.join(f.root,'data','background-jobs','job_logs12');assert.equal((await stat(path.join(directory,'stdout.jsonl'))).size,160);assert.equal((await stat(path.join(directory,'stderr.log'))).size,160);
 assert((await readFile(path.join(directory,'stdout.jsonl'),'utf8')).startsWith('{'));assert(f.progress.some(p=>p.message==='배경 이미지를 생성하고 있습니다.'));
 assert.equal(f.failures.length,1);assert.equal(f.exits[0].code,7);assert(!JSON.stringify([f.progress,f.failures,f.exits,f.runner.status()]).includes('SECRET'));assert(!JSON.stringify([f.progress,f.failures]).includes('PRIVATE'));
});

test('invalid job ids cannot escape the job directory',async t=>{
 const f=await fixture(t);
 for(const jobId of ['../outside','short','name/123456','a'.repeat(101)])await assert.rejects(f.runner.start({jobId,prompt:'request'}),/요청 번호/);
 assert.equal(f.calls.length,0);
});

test('Windows resolver finds an existing PATH file, caches it, and discovers the new path after an app update',async()=>{
 const first='C:\\Program Files\\Codex old\\codex.exe',second='C:\\Program Files\\Codex new\\codex.exe',files=new Set([first]),calls=[];
 const resolve=createExecutableResolver({platform:'win32',isFileImpl:file=>files.has(file),execFileImpl:(file,args,options,done)=>{calls.push({file,args,options});done(null,'C:\\missing\\codex.exe\r\n'+(files.has(first)?first:second)+'\r\n');}});
 assert.equal(await resolve(),first);assert.equal(await resolve(),first);assert.equal(calls.length,1);
 files.delete(first);files.add(second);assert.equal(await resolve(),second);assert.equal(calls.length,2);
 assert(calls.every(c=>c.file==='where.exe'&&c.options.shell===false&&c.options.windowsHide===true));assert.deepEqual(calls[0].args,['codex.exe']);
});

test('Windows resolver uses only the official Appx install query when PATH discovery fails',async()=>{
 const location='C:\\Program Files\\WindowsApps\\OpenAI.Codex_test',expected=path.win32.join(location,'app','resources','codex.exe'),calls=[];
 const resolve=createExecutableResolver({platform:'win32',isFileImpl:file=>file===expected,execFileImpl:(file,args,options,done)=>{calls.push({file,args,options});if(file==='where.exe')done(Error('not found'));else done(null,location+'\r\n');}});
 assert.equal(await resolve(),expected);assert.equal(calls.length,2);assert.equal(calls[1].file,'powershell.exe');
 assert.deepEqual(calls[1].args,['-NoProfile','-NonInteractive','-Command','(Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1 -ExpandProperty InstallLocation)']);assert.equal(calls[1].options.shell,false);
});

test('missing executable gives an actionable sanitized error, while macOS/Linux use codex without OS queries',async()=>{
 const resolve=createExecutableResolver({platform:'win32',isFileImpl:()=>false,execFileImpl:(_,args,options,done)=>done(Error('private discovery details'))});
 await assert.rejects(resolve(),e=>e.code==='CODEX_EXECUTABLE_NOT_FOUND'&&/Codex 앱 설치와 실행 경로/.test(e.message)&&!e.message.includes('private'));
 for(const platform of ['darwin','linux'])assert.equal(await createExecutableResolver({platform,execFileImpl:()=>assert.fail('no Windows discovery')})(),'codex');
});

test('runner resolves only when executable is omitted and surfaces missing Codex before spawning',async t=>{
 let searches=0;
 const f=await fixture(t,{executable:undefined,resolveExecutableImpl:async()=>{searches++;return 'C:/resolved/codex.exe';}});await f.runner.start({jobId:'job_resolv',prompt:'request'});
 assert.equal(searches,1);assert.equal(f.calls[0].executable,'C:/resolved/codex.exe');f.children[0].emit('close',0,null);
 const explicit=await fixture(t,{resolveExecutableImpl:()=>assert.fail('explicit executable is authoritative')});await explicit.runner.start({jobId:'job_explic',prompt:'request'});explicit.children[0].emit('close',0,null);
 const missing=await fixture(t,{executable:undefined,resolveExecutableImpl:async()=>{throw Object.assign(Error('Codex missing'),{code:'CODEX_EXECUTABLE_NOT_FOUND'});}});
 await assert.rejects(missing.runner.start({jobId:'job_miss12',prompt:'request'}),/Codex 앱 설치와 실행 경로/);assert.equal(missing.calls.length,0);assert.match(missing.failures[0].message,/Codex 앱 설치와 실행 경로/);assert.equal(missing.runner.status().running,false);
});
