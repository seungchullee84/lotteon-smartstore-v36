import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const roles=new Set(['front','side','back','detail','care-label','excluded']);
const valid=record=>/^[a-f0-9]{20}$/.test(record?.id||'')&&/^[a-f0-9]{64}$/.test(record.hash||'')&&roles.has(record.role);
function selectionFile(dataRoot,product){
 if(!/^\d{6}$/.test(product.style||''))throw Error('사진 선택 품번을 확인해 주세요.');
 return path.join(dataRoot,'smartstore-details',product.style,'photo-file-selection.json');
}
export async function readPhotoFileSelection(dataRoot,product){
 let saved;try{saved=JSON.parse(await readFile(selectionFile(dataRoot,product),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}
 if(saved.style!==product.style||saved.sourceUrl!==product.sourceUrl)return [];
 return (saved.items||[]).filter(valid);
}
export async function savePhotoFileSelection(dataRoot,product,items){
 if(!Array.isArray(items)||items.some(item=>!valid(item))||new Set(items.map(item=>item.id)).size!==items.length)throw Error('사진별 원본 선택을 확인해 주세요.');
 const file=selectionFile(dataRoot,product),temporary=file+'.'+randomUUID()+'.tmp';
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(temporary,JSON.stringify({version:1,style:product.style,sourceUrl:product.sourceUrl,appliedAt:new Date().toISOString(),items:items.map(({id,hash,name,color,role})=>({id,hash,name,color,role}))},null,2));
 await rename(temporary,file);
}
