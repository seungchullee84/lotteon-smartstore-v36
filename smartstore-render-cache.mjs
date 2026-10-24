import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function renderCacheKey(html){return digest(Buffer.concat([Buffer.from(html),await readFile(new URL('./smartstore-detail-files.mjs',import.meta.url))]));}
export async function restoreRenderedDetail(root,style,key,output){
 try{
  const record=JSON.parse(await readFile(path.join(root,style+'.json'),'utf8'));
  if(record.key!==key||record.width!==860||!(record.height>0&&record.height<=150000))return null;
  const bytes=await readFile(path.join(root,style+'.png'));if(digest(bytes)!==record.digest)return null;
  await writeFile(output+'.partial',bytes);await rename(output+'.partial',output);return record;
 }catch{return null;}
}
export async function cacheRenderedDetail(root,style,key,output,height){
 try{
  await mkdir(root,{recursive:true});const bytes=await readFile(output),id=randomUUID(),png=path.join(root,style+'.png'),manifest=path.join(root,style+'.json');
  await writeFile(png+'.'+id+'.tmp',bytes);await rename(png+'.'+id+'.tmp',png);
  await writeFile(manifest+'.'+id+'.tmp',JSON.stringify({key,width:860,height,digest:digest(bytes)}));await rename(manifest+'.'+id+'.tmp',manifest);
 }catch{} // The requested output remains usable even if cache storage fails.
}
