import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {atomicWrite} from './atomic-file.mjs';

const failure=()=>Error('이 Windows 계정에서 자동 로그인 정보를 읽거나 암호화하지 못했습니다. 설정 화면에서 다시 저장해 주세요.');
export function protectLogin(value,decrypt=false){
 if(process.platform!=='win32')throw Error('자동 로그인 암호화 저장은 Windows에서 지원합니다.');
 const prefix="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.Encoding]::UTF8;$null=[Reflection.Assembly]::LoadWithPartialName('System.Security');$v=[Console]::In.ReadToEnd();";
 const script=prefix+(decrypt?"$p=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))":"$p=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))");
 return new Promise((resolve,reject)=>{
  // Credentials travel only over stdin, never the process command line or logs.
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let out='',finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result);};
  const timer=setTimeout(()=>{child.kill();finish(failure());},15000);
  child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{out+=part;if(out.length>65536){child.kill();finish(failure());}});child.stderr.resume();
  child.on('error',()=>finish(failure()));child.stdin.on('error',()=>finish(failure()));
  child.on('close',code=>finish(code===0?null:failure(),out.trim()));child.stdin.end(value,'utf8');
 });
}
function valid(value){return typeof value?.username==='string'&&value.username.trim().length>0&&value.username.length<=200&&typeof value.password==='string'&&value.password.length>0&&value.password.length<=256;}
export function createBrowserLoginStore(root){
 const file=path.join(root,'browser-login-settings.json');let pending=Promise.resolve();
 async function read(){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return {version:1};throw failure();}}
 function summary(saved){return {supported:process.platform==='win32',configured:!!saved.encryptedLogin,enabled:!!saved.encryptedLogin&&saved.enabled===true,accountHint:saved.accountHint||''};}
 return {
  async status(){return summary(await read());},
  update(input){
   const operation=pending.catch(()=>{}).then(async()=>{
    let saved=await read();
    if(input.action==='delete')saved={version:1};
    else if(input.action==='save'){
     if(typeof input.enabled!=='boolean')throw Error('자동 로그인 사용 여부를 선택해 주세요.');
     if(input.username||input.password){
      if(!valid(input))throw Error('아이디와 비밀번호를 모두 입력해 주세요.');
      const username=input.username.trim(),encryptedLogin=await protectLogin(JSON.stringify({username,password:input.password}));
      saved={version:1,encryptedLogin,accountHint:username.slice(0,Math.min(2,username.length))+'***',updatedAt:new Date().toISOString()};
     }
     if(!saved.encryptedLogin)throw Error('처음 설정할 때는 아이디와 비밀번호를 모두 입력해 주세요.');
     saved.enabled=input.enabled;
    }else throw Error('자동 로그인 설정 요청을 확인해 주세요.');
    await atomicWrite(file,JSON.stringify(saved));return summary(saved);
   });pending=operation;return operation;
  },
  async load(){
   const saved=await read();if(!saved.enabled||!saved.encryptedLogin)return null;
   let value;try{value=JSON.parse(await protectLogin(saved.encryptedLogin,true));}catch{throw failure();}
   if(!valid(value))throw failure();return {...value,revision:saved.updatedAt};
  }
 };
}
