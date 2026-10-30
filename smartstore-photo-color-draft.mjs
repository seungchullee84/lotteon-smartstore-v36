import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {findPhotos} from './smartstore-photo-files.mjs';
import {photoReview} from './smartstore-photo-review.mjs';
import {classifyLocalPhotos} from './smartstore-local-photo.mjs';
export async function prefillPhotoColors(product,folder,{dataRoot,signal,log=()=>{},classify=classifyLocalPhotos,...options}){
 const review=await photoReview(product,{dataRoot,...options});
 const photos=(await findPhotos(product,{dataRoot,...options,includeExcluded:true})).filter(p=>{const item=review.items.find(i=>i.id===p.id);return item&&!item.color&&!['care-label','excluded'].includes(item.role)&&!item.colorOverride;});
 const result=photos.length?await classify(product,photos,{dataRoot,folder,signal,log,draftColors:true}):[];signal?.throwIfAborted();
 const files=result.map(p=>({hash:createHash('sha256').update(p.bytes).digest('hex'),color:product.colors.includes(p.color)?p.color:'',careLabel:p.role==='care-label',needsReview:!!p.needsReview}));
 const file=path.join(dataRoot,'smartstore-photo-color-drafts',product.style+'.json');await mkdir(path.dirname(file),{recursive:true});
 let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const all=new Map((previous?.sourceUrl===product.sourceUrl&&JSON.stringify(previous.colors)===JSON.stringify(product.colors)?previous.files:[]).map(p=>[p.hash,p]));for(const p of files)all.set(p.hash,p);
 const record={style:product.style,sourceUrl:product.sourceUrl,colors:product.colors,method:'local-color-draft',updatedAt:new Date().toISOString(),files:[...all.values()]},temporary=file+'.'+randomUUID()+'.tmp';
 await writeFile(temporary,JSON.stringify(record,null,2));await rename(temporary,file);
 const after=await photoReview(product,{dataRoot,...options});return {filled:after.items.filter(p=>p.color).length,remaining:after.items.filter(p=>!p.color&&!['care-label','excluded'].includes(p.role)).length,total:after.items.length,updatedAt:record.updatedAt};
}
