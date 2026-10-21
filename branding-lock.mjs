import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export function brandingLock(root){
 const file=path.join(root,'branding-lock.json');let failures=0,blockedUntil=0;
 async function load(){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('보호 설정을 읽지 못했습니다. 원본 파일을 확인해 주세요.');}}
 const defaults={maker:'L.S.C',date:'2026-10-18',visible:true,logo:null};
 async function save(data){const temp=file+'.tmp';await writeFile(temp,JSON.stringify(data),{mode:0o600});await rename(temp,file);}
 return {async get(){const d=await load();return {configured:!!d,...(d?.branding||defaults)};},async update(b){
 if(Date.now()<blockedUntil)throw Error('비밀번호 오류가 반복되었습니다. 1분 뒤 다시 시도해 주세요.');
 const d=await load();const password=String(b.password||'');if(password.length>128)throw Error('비밀번호 길이를 확인해 주세요.');
 if(d){const hash=scryptSync(password,d.salt,64);if(!timingSafeEqual(hash,Buffer.from(d.hash,'hex'))){if(++failures>=5){blockedUntil=Date.now()+60000;failures=0;}throw Error('비밀번호가 맞지 않습니다.');}}
 else {if(password.length<8||password.length>128)throw Error('비밀번호는 8~128자로 설정해 주세요.');if(password!==b.confirmPassword)throw Error('비밀번호 확인이 일치하지 않습니다.');}
 if(!d){const salt=randomBytes(16).toString('hex');await writeFile(file,JSON.stringify({salt,hash:scryptSync(password,salt,64).toString('hex'),branding:defaults}),{flag:'wx',mode:0o600});failures=0;return this.get();}
 const maker=String(b.maker||'').trim(),date=String(b.date||'');if(!maker||maker.length>40)throw Error('만든이는 1~40자로 입력해 주세요.');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))throw Error('날짜를 확인해 주세요.');
 const branding={maker,date,visible:b.visible===true,logo:b.logo===undefined?d.branding.logo:b.logo};await save({...d,branding});failures=0;return this.get();
 }};
}
