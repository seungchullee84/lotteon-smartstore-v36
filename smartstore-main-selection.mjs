import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fileFor=(p,dataRoot)=>path.join(dataRoot,'smartstore-details',p.style,'main-selection.json');
export async function readMainSelection(p,dataRoot){try{const saved=JSON.parse(await readFile(fileFor(p,dataRoot),'utf8'));return saved.style===p.style&&saved.sourceUrl===p.sourceUrl?saved:null;}catch(e){if(e.code!=='ENOENT')throw e;return null;}}
export async function selectedMainPhoto(photos,p,dataRoot){
 const saved=await readMainSelection(p,dataRoot);
 if(!saved)throw Object.assign(Error('사진 선택 창에서 대표사진을 한 장 선택한 뒤 사진 반영을 눌러 주세요.'),{code:'MAIN_PHOTO_SELECTION_REQUIRED'});
 const matches=photos.filter(photo=>hash(photo.bytes)===saved.sourceHash);
 const exact=matches.filter(photo=>photo.name===saved.sourceName);
 if(exact.length===1)return exact[0];
 if(matches.length===1)return matches[0];
 throw Object.assign(Error('선택한 대표사진의 원본이 변경·삭제됐거나 같은 사진의 사본이 여러 장입니다. 사진 선택 창에서 대표사진을 다시 지정해 주세요.'),{code:'MAIN_PHOTO_SELECTION_CHANGED'});
}
export async function saveMainSelection(p,photo,dataRoot){const file=fileFor(p,dataRoot),temp=file+'.'+randomUUID()+'.tmp';await mkdir(path.dirname(file),{recursive:true});await writeFile(temp,JSON.stringify({style:p.style,sourceUrl:p.sourceUrl,sourceName:photo.name,sourceHash:hash(photo.bytes),selectedAt:new Date().toISOString()},null,2));await rename(temp,file);}
