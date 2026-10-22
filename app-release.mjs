import {readdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const ignored=new Set(['data','node_modules','.git','.codex']);
export function formatReleaseDate(value){
 const parts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
 return `${p.year}.${p.month}.${p.day} (${p.weekday}) ${p.hour}:${p.minute}`;
}
async function fingerprint(root){
 const files=[];
 async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
  if(entry.name.startsWith('.')||ignored.has(entry.name))continue;
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())await walk(file);
  else if(entry.isFile()&&/\.(mjs|js|json|html|css|ps1|cmd|md|yaml)$/.test(entry.name))files.push(file);
 }}
 await walk(root);
 const hash=createHash('sha256');let modified=0;
 for(const file of files.sort()){
  let bytes=await readFile(file);
  if(file===path.join(root,'package.json')){const p=JSON.parse(bytes);delete p.version;bytes=JSON.stringify(p);}
  hash.update(path.relative(root,file).replaceAll('\\','/'));hash.update('\0');hash.update(bytes);hash.update('\0');
  modified=Math.max(modified,(await stat(file)).mtimeMs);
 }
 return {hash:hash.digest('hex'),modified};
}
export function createReleaseTracker(root,{interval=2000,initialVersion=39}={}){
 const file=path.join(root,'.app-release.json');let cached=null,nextCheck=0,inflight=null;
 async function check(){
  let previous=cached;
  if(!previous){try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
  const current=await fingerprint(root);
  if(!previous||current.hash!==previous.hash){
   cached={version:previous?previous.version+1:initialVersion,updatedAt:new Date(current.modified||Date.now()).toISOString(),hash:current.hash};
   const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(cached,null,2));await rename(temporary,file);
  }else cached=previous;
  const packagePath=path.join(root,'package.json');const pkg=JSON.parse(await readFile(packagePath,'utf8'));
  if(pkg.version!==`0.${cached.version}.0`){pkg.version=`0.${cached.version}.0`;await writeFile(packagePath,JSON.stringify(pkg,null,2)+'\n');}
  nextCheck=Date.now()+interval;
  return {...cached,displayDate:formatReleaseDate(cached.updatedAt)};
 }
 return {async get(){
  if(inflight)return inflight;
  if(cached&&Date.now()<nextCheck)return {...cached,displayDate:formatReleaseDate(cached.updatedAt)};
  inflight=check();try{return await inflight;}finally{inflight=null;}
 }};
}
