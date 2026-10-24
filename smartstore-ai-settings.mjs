import {spawn} from 'node:child_process';
import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const valid=key=>typeof key==='string'&&/^sk-[A-Za-z0-9_-]{16,}$/.test(key.trim());
function protect(value,decrypt=false){
 if(process.platform!=='win32')throw Error('이 PC에서는 환경변수 OPENAI_API_KEY로 연결해 주세요.');
 const prefix="$ErrorActionPreference='Stop';$null=[Reflection.Assembly]::LoadWithPartialName('System.Security');$v=[Console]::In.ReadToEnd();";
 const script=prefix+(decrypt?"$bytes=[Convert]::FromBase64String($v);$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))":"$bytes=[Text.Encoding]::UTF8.GetBytes($v);$cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($cipher))");
 return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.resume();child.on('error',()=>reject(Error('Windows 암호화 저장을 실행하지 못했습니다.')));child.on('exit',code=>code===0?resolve(out.trim()):reject(Error('Windows 암호화 설정을 읽거나 저장하지 못했습니다.')));child.stdin.end(value);});
}
export async function loadSmartstoreAIKey(dataRoot){
 if(valid(process.env.OPENAI_API_KEY))return process.env.OPENAI_API_KEY.trim();
 let saved;try{saved=JSON.parse(await readFile(path.join(dataRoot,'smartstore-ai-settings.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return '';throw e;}
 try{const key=await protect(saved.encryptedKey,true);return valid(key)?key:'';}catch{return '';}
}
export async function saveSmartstoreAIKey(dataRoot,key){
 if(!valid(key))throw Error('올바른 OpenAI API 키를 입력해 주세요.');
 const encryptedKey=await protect(key.trim());const file=path.join(dataRoot,'smartstore-ai-settings.json');
 await writeFile(file+'.tmp',JSON.stringify({version:1,encryptedKey}));await rename(file+'.tmp',file);return key.trim();
}
