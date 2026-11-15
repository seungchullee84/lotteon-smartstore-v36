import fs from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';

const jobIdPattern=/^[a-zA-Z0-9_-]{8,100}$/;
const failureMessage='배경 합성 작업을 마치지 못했습니다. 현재 상품을 확인한 뒤 다시 시도해 주세요.';
const executableMessage='Codex 실행 파일을 찾지 못했습니다. Codex 앱 설치와 실행 경로를 확인해 주세요.';
const missingExecutable=()=>Object.assign(Error(executableMessage),{code:'CODEX_EXECUTABLE_NOT_FOUND'});
const isFile=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
export function backgroundRunnerEnvironment(parent=process.env){
 const env={...parent};
 delete env.CODEX_THREAD_ID;
 // A standalone CLI process has no packaged-app identity. Inheriting this
 // desktop-only switch breaks both shell and node_repl startup before any
 // command runs. Keep the configured sandbox and its package-family setting.
 delete env.CODEX_WINDOWS_REGISTERED_CORE;
 return env;
}
export function createExecutableResolver({platform=process.platform,execFileImpl=execFile,isFileImpl=isFile}={}){
 let cached=null,pending=null;
 const read=(file,args)=>new Promise((resolve,reject)=>execFileImpl(file,args,{windowsHide:true,shell:false,encoding:'utf8',timeout:10000,maxBuffer:65536},(error,stdout)=>error?reject(error):resolve(String(stdout||''))));
 async function discover(){
  try{
   const output=await read('where.exe',['codex.exe']);
   for(const line of output.split(/\r?\n/)){const file=line.trim().replace(/^"|"$/g,'');if(path.win32.isAbsolute(file)&&isFileImpl(file))return cached=file;}
  }catch{}
  try{
   const output=await read('powershell.exe',['-NoProfile','-NonInteractive','-Command','(Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1 -ExpandProperty InstallLocation)']);
   const location=output.trim();
   if(path.win32.isAbsolute(location)){const file=path.win32.join(location,'app','resources','codex.exe');if(isFileImpl(file))return cached=file;}
  }catch{}
  throw missingExecutable();
 }
 return async()=>{
  if(platform!=='win32')return 'codex';
  if(cached&&isFileImpl(cached))return cached;
  if(pending)return pending;
  pending=discover();try{return await pending;}finally{pending=null;}
 };
}
export const resolveExecutable=createExecutableResolver();
async function killTree(child){
 if(process.platform==='win32'&&Number.isInteger(child.pid)&&child.pid>0){
  await new Promise((resolve,reject)=>execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},error=>error?reject(error):resolve()));
 }else if(!child.kill('SIGTERM'))throw Error('작업 프로세스를 중단하지 못했습니다.');
}

// Process exit is deliberately not an image-application success signal.
export function createBackgroundRunner({root,nodePath,executable,resolveExecutableImpl=resolveExecutable,sandboxMode='workspace-write',spawnImpl=spawn,killTreeImpl=killTree,onFailure=()=>{},onProgress=()=>{},onExit=()=>{},timeoutMs=600000,logLimitBytes=1048576}={}){
 if(typeof root!=='string'||!root)throw Error('합성 작업 경로를 확인해 주세요.');
 if(!['workspace-write','read-only','danger-full-access'].includes(sandboxMode))throw Error('허용된 Codex 실행 환경을 확인해 주세요.');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isSafeInteger(logLimitBytes)||logLimitBytes<1)throw Error('합성 작업 제한값을 확인해 주세요.');
 const jobsRoot=path.resolve(root,'data','background-jobs');
 let active=null,view={running:false,jobId:null,phase:'idle',message:''};
 const notify=(callback,value)=>{try{const result=callback(value);result?.catch?.(()=>{});}catch{}};
 function update(job,phase,message){
  if(active!==job||job.finished)return;
  view={running:true,jobId:job.jobId,phase,message};
  if(message!==job.lastProgress){job.lastProgress=message;notify(onProgress,{jobId:job.jobId,message});}
 }
 function finish(job,{code=null,signal=null,error=false}={}){
  if(job.finished)return;
  job.finished=true;clearTimeout(job.timer);
  for(const fd of job.logs)try{fs.closeSync(fd);}catch{}
  let phase=job.stopReason||((error||code!==0||job.failureMessage)?'failed':'exited');
  const message=phase==='cancelled'?'배경 합성 작업을 중단했습니다.':phase==='timed-out'?'배경 합성 작업 시간이 초과되어 중단했습니다.':phase==='failed'?(job.failureMessage||failureMessage):'생성 작업이 종료되었습니다. 적용 결과를 확인합니다.';
  if(active===job){active=null;view={running:false,jobId:job.jobId,phase,code,message};}
  if(phase==='failed'||phase==='timed-out')notify(onFailure,{jobId:job.jobId,code,message});
  notify(onExit,{jobId:job.jobId,code,signal,phase,message});job.resolveDone();
 }
 function executionFailure(job,diagnostic){
  if(job.finished||job.stopReason||typeof diagnostic!=='string')return;
  // Match only a known launch failure and expose fixed copy, never raw tool
  // output, prompts, local paths or credentials from stdout/stderr.
  if(!diagnostic.includes('registered Core launch requires an installed app'))return;
  job.failureMessage='합성 작업의 Windows 실행환경을 시작하지 못했습니다(Codex 앱 실행 연결 오류). 현재 대표이미지는 유지했습니다.';
  void stop(job,'failed').catch(()=>{});
 }
 function progressLine(job,line){
  if(job.finished||job.stopReason)return;
  let event;try{event=JSON.parse(line);}catch{return;}
  const item=event.item||{},kind=String(item.type||event.type||''),tool=String(item.name||item.tool||item.tool_name||'');
  if(event.type==='item.completed'&&kind==='command_execution'&&(item.status==='failed'||item.exit_code<0))executionFailure(job,item.aggregated_output);
  if(event.type==='item.completed'&&kind==='mcp_tool_call'&&item.status==='failed'){
   executionFailure(job,item.error?.message);
   for(const block of item.result?.content||[])if(block.type==='text')executionFailure(job,block.text);
  }
  if(event.type==='turn.failed'||event.type==='error')executionFailure(job,event.error?.message||event.message);
  if(job.finished||job.stopReason)return;
  if(/image_generation|image_gen\.imagegen|imagegen/.test(kind+' '+tool))update(job,'running','배경 이미지를 생성하고 있습니다.');
  else if(event.type==='turn.started')update(job,'running','배경 합성 작업을 시작했습니다.');
  else if(event.type==='item.started'&&kind==='command_execution')update(job,'running','원본 보존과 적용을 위한 로컬 처리를 진행하고 있습니다.');
 }
 function consume(job,fd,kind,chunk){
  if(job.finished)return;
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
  const count=Math.min(bytes.length,Math.max(0,logLimitBytes-job.written[kind]));
  if(count){try{fs.writeSync(fd,bytes,0,count);job.written[kind]+=count;}catch{void stop(job,'failed').catch(()=>{});}}
  if(kind==='stderr'){
   job.stderrTail=(job.stderrTail+bytes.toString('utf8')).slice(-4096);
   executionFailure(job,job.stderrTail);return;
  }
  const parts=bytes.toString('utf8').split('\n');
  for(let i=0;i<parts.length;i++){
   if(!job.skipLine){if(job.line.length+parts[i].length>65536){job.line='';job.skipLine=true;}else job.line+=parts[i];}
   if(i<parts.length-1){if(!job.skipLine)progressLine(job,job.line);job.line='';job.skipLine=false;}
  }
 }
 async function stop(job,reason){
  if(job.finished)return {cancelled:false};
  if(job.stopping)return job.stopping;
  job.stopReason=reason;update(job,'cancelling',reason==='timed-out'?'시간이 초과되어 합성 작업을 중단합니다.':'배경 합성 작업을 중단하고 있습니다.');
  if(!job.child){finish(job);return {cancelled:true};}
  job.stopping=(async()=>{
   try{await killTreeImpl(job.child);}catch{
    if(!job.finished){notify(onFailure,{jobId:job.jobId,code:null,message:'합성 작업의 중단을 확인하지 못했습니다. 새 작업을 시작하지 않았습니다.'});throw Error('합성 작업의 중단을 확인하지 못했습니다.');}
   }
   let timer;
   try{await Promise.race([job.done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('합성 작업의 종료를 기다리고 있습니다.')),5000);timer.unref?.();})]);}
   finally{clearTimeout(timer);}
   return {cancelled:true};
  })();
  return job.stopping;
 }
 async function start({jobId,prompt}={}){
  if(active)throw Error('이미 배경 합성 작업이 진행 중입니다.');
  if(typeof jobId!=='string'||!jobIdPattern.test(jobId)||typeof prompt!=='string'||!prompt.trim())throw Error('합성 요청 번호와 내용을 확인해 주세요.');
  const job={jobId,logs:[],written:{stdout:0,stderr:0},line:'',stderrTail:'',skipLine:false,finished:false};
  job.done=new Promise(resolve=>{job.resolveDone=resolve;});active=job;update(job,'starting','배경 합성 작업을 준비하고 있습니다.');
  const directory=path.join(jobsRoot,jobId);
  try{
   const command=executable===undefined?await resolveExecutableImpl():executable;if(job.finished)throw Error('합성 작업이 취소되었습니다.');
   await mkdir(directory,{recursive:true});if(job.finished)throw Error('합성 작업이 취소되었습니다.');
   for(const name of ['stdout.jsonl','stderr.log'])job.logs.push(fs.openSync(path.join(directory,name),'w'));
   const args=['exec','--ephemeral','--skip-git-repo-check','--sandbox',sandboxMode,...(sandboxMode==='workspace-write'?['-c','sandbox_workspace_write.network_access=true']:[]),'--json','--output-last-message',path.join(directory,'result.txt'),'-'];
   const env=backgroundRunnerEnvironment();
   const child=spawnImpl(command,args,{cwd:directory,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});job.child=child;
   await new Promise((resolve,reject)=>{
    child.stdout?.on('data',chunk=>consume(job,job.logs[0],'stdout',chunk));
    child.stderr?.on('data',chunk=>consume(job,job.logs[1],'stderr',chunk));
    child.once('error',error=>{if(error.code==='ENOENT')job.failureMessage=executableMessage;finish(job,{error:true});reject(error.code==='ENOENT'?missingExecutable():Error('합성 작업 프로세스를 시작하지 못했습니다.'));});
    child.once('close',(code,signal)=>{if(job.line&&!job.skipLine)progressLine(job,job.line);finish(job,{code,signal});});
    child.stdin?.on('error',()=>{if(!job.finished)void stop(job,'failed').catch(()=>{});});
    child.once('spawn',()=>{
     if(job.stopReason){reject(Error('합성 작업이 취소되었습니다.'));return;}
     update(job,'running','배경 합성 작업을 시작했습니다.');
     try{child.stdin.end(prompt);resolve();}catch{void stop(job,'failed').catch(()=>{});reject(Error('합성 요청을 전달하지 못했습니다.'));}
    });
    job.timer=setTimeout(()=>{void stop(job,'timed-out').catch(()=>{});},timeoutMs);job.timer.unref?.();
   });
   return {started:true};
  }catch(error){if(error.code==='CODEX_EXECUTABLE_NOT_FOUND'||error.code==='ENOENT')job.failureMessage=executableMessage;if(!job.child||job.finished)finish(job,{error:true});if(job.stopReason==='cancelled')throw Error('합성 작업이 취소되었습니다.');if(job.failureMessage===executableMessage)throw missingExecutable();throw Error('합성 작업 프로세스를 시작하지 못했습니다.');}
 }
 return {start,cancel:()=>active?stop(active,'cancelled'):Promise.resolve({cancelled:false}),status:()=>({...view})};
}
