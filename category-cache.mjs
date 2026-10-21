import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
export function categoryKey(p){return JSON.stringify([p.gender,p.category.commonMiddle,p.category.commonSmall,p.category.channelMiddle,p.category.channelSmall]);}
export async function loadCategoryCache(root){
 try{const value=JSON.parse(await readFile(path.join(root,'category-matches.json'),'utf8'));return value.version===1&&Array.isArray(value.matches)?value:{version:1,matches:[]};}
 catch(e){if(e.code==='ENOENT')return {version:1,matches:[]};throw e;}
}
export async function saveCategoryMatch(root,key,actual,style){
 const cache=await loadCategoryCache(root);
 cache.matches=cache.matches.filter(m=>m.key!==key);
 cache.matches.push({key,actual,verifiedAt:new Date().toISOString(),verifiedStyle:style,verification:'표준카테고리 추가 반영 확인'});
 const target=path.join(root,'category-matches.json');
 await writeFile(target+'.tmp',JSON.stringify(cache,null,2));await rename(target+'.tmp',target);
}
