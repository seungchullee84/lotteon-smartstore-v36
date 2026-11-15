import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createBackgroundRunner} from '../background-runner.mjs';

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
