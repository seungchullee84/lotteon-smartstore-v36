import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const roles=new Set(['front','side','back','detail']);
const valid=(p,r)=>/^[a-f0-9]{64}$/.test(r?.hash||'')&&p.colors.includes(r.color)&&roles.has(r.role);
function cacheFile(dataRoot,p){
 if(!/^\d{6}$/.test(p.style))throw Error('사진 연결 품번을 확인해 주세요.');
 return path.join(dataRoot,'smartstore-photo-mappings',p.style+'.json');
}
export async function readPhotoMappings(dataRoot,p){
 let cache;try{cache=JSON.parse(await readFile(cacheFile(dataRoot,p),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 if(cache.style!==p.style||cache.sourceUrl!==p.sourceUrl)return [];
 return (cache.files||[]).filter(r=>valid(p,r));
}
export async function savePhotoMappings(dataRoot,p,records){
 const files=new Map((await readPhotoMappings(dataRoot,p)).map(r=>[r.hash,r]));
 for(const r of records||[])if(valid(p,r)&&r.automatic!==true){
  const previous=files.get(r.hash);
  // A later source import's unknown-angle fallback must not erase a visual review.
  const selected=previous?.reviewed===true&&r.reviewed!==true?previous:r;
  files.set(r.hash,{hash:selected.hash,color:selected.color,role:selected.role,...(selected.reviewed===true?{reviewed:true,reviewedAt:selected.reviewedAt||new Date().toISOString(),reviewBasis:String(selected.reviewBasis||'visual-photo-review').slice(0,240),reviewedBy:String(selected.reviewedBy||'').slice(0,80)}:{})});
 }
 const file=cacheFile(dataRoot,p),temporary=file+'.'+randomUUID()+'.tmp';
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(temporary,JSON.stringify({version:1,style:p.style,sourceUrl:p.sourceUrl,files:[...files.values()]},null,2));
 await rename(temporary,file);
}
