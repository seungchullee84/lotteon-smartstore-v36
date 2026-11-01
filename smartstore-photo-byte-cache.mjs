import {readFile,stat} from 'node:fs/promises';
const entries=new Map();let total=0;
const limit=32*1024*1024;
// Keep only unchanged source bytes; file selections and mappings are read fresh.
export async function readPhotoBytes(file){
 const info=await stat(file,{bigint:true});
 const signature=[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
 const previous=entries.get(file);
 if(previous?.signature===signature){entries.delete(file);entries.set(file,previous);return previous.bytes;}
 if(previous){entries.delete(file);total-=previous.bytes.length;}
 const bytes=await readFile(file);
 const after=await stat(file,{bigint:true});
 if(signature!==[after.dev,after.ino,after.size,after.mtimeNs,after.ctimeNs].join(':'))return readPhotoBytes(file);
 if(bytes.length<=limit){
  while(total+bytes.length>limit||entries.size>=256){const key=entries.keys().next().value;total-=entries.get(key).bytes.length;entries.delete(key);}
  entries.set(file,{signature,bytes});total+=bytes.length;
 }
 return bytes;
}
