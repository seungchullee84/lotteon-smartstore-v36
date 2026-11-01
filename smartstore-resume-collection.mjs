import {access} from 'node:fs/promises';
import path from 'node:path';
// Resume only the current collection, never another product or a saved draft.
export async function reusableSmartstoreCollection(input,product,folder,{dataRoot}){
 if(!product||!folder||product.photoSelectionPending)return null;
 if(input.url?input.url!==product.sourceUrl:input.style!==product.style)return null;
 if(new URL(product.sourceUrl).origin!=='https://www.giordano.co.kr')return null;
 const relative=path.relative(dataRoot,folder);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))return null;
 try{
  await access(path.join(folder,'smartstore-official.html'));
  if(product.images?.detail)await access(path.join(folder,'detail.jpg'));
 }catch(error){if(error.code==='ENOENT')return null;throw error;}
 return {product:structuredClone(product),folder};
}
