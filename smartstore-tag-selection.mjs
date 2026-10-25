import {readFileSync} from 'node:fs';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadTagResearch,matchResearchTags,researchForProduct} from './apparel-tag-research.mjs';
const defaultRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'data');
const normalize=s=>String(s||'').normalize('NFKC').replace(/[#\s]/g,'').toLowerCase();
const file=(root,style)=>{if(!/^\d{6}$/.test(style||''))throw Error('태그 선택 품번을 확인해 주세요.');return path.join(root,'smartstore-tag-selections',style+'.json');};
export function searchProductTags(product,query,{index=loadTagResearch()}={}){
 const term=normalize(query);if(!term||term.length>40)throw Error('태그 검색어를 1~40자로 입력해 주세요.');
 const related=new Map(matchResearchTags(product,index,{limit:10000}).map(t=>[t.id,t]));
 const families=[['후드','후디'],['맨투맨','스웨트셔츠','스웻셔츠'],['바지','팬츠'],['코튼','면'],['카라','칼라'],['가디건','카디건']];
 const terms=[term,...(families.find(f=>f.includes(term))||[])];
 const tags=(index?.tags||[]).filter(t=>t.decision==='include'&&!t.conflict&&/^\d+$/.test(t.id)&&terms.some(q=>normalize(t.name).includes(q))).map(t=>({id:t.id,name:t.name,related:related.has(t.id),dictionaryObserved:true,searchVerified:false,score:related.get(t.id)?.score||0}));
 tags.sort((a,b)=>Number(b.related)-Number(a.related)||b.score-a.score||a.name.length-b.name.length||Number(a.id)-Number(b.id));
 return {style:product.style,query,items:tags.slice(0,60),total:tags.length,source:'제공 조사자료의 사전 ID·명칭 · 실제 입력 시 네이버 검색 적용 재검증'};
}
export async function saveSelectedProductTags(product,tags,{dataRoot=defaultRoot,index=loadTagResearch()}={}){
 if(!Array.isArray(tags)||!tags.length||tags.length>10||new Set(tags.map(t=>t.id)).size!==tags.length)throw Error('태그는 중복 없이 1~10개 선택해 주세요.');
 const allowed=new Map(matchResearchTags(product,index,{limit:10000}).map(t=>[t.id,t.name]));
 if(tags.some(t=>allowed.get(t.id)!==t.name))throw Error('현재 상품 근거에 맞는 조사 태그의 ID·명칭을 다시 확인해 주세요.');
 const record={style:product.style,sourceUrl:product.sourceUrl,tags:tags.map(({id,name})=>({id,name})),updatedAt:new Date().toISOString()};
 const target=file(dataRoot,product.style);await mkdir(path.dirname(target),{recursive:true});await writeFile(target+'.tmp',JSON.stringify(record,null,2));await rename(target+'.tmp',target);return record;
}
export function selectedProductTagResearch(product,{dataRoot=defaultRoot,index=loadTagResearch()}={}){
 const automatic=researchForProduct(product);let record;try{record=JSON.parse(readFileSync(file(dataRoot,product.style),'utf8'));}catch(error){if(error.code==='ENOENT')return automatic;throw error;}
 if(record.style!==product.style||record.sourceUrl!==product.sourceUrl)return automatic;
 const allowed=new Map(matchResearchTags(product,index,{limit:10000}).map(t=>[t.id,t.name]));
 const candidates=(record.tags||[]).filter(t=>allowed.get(t.id)===t.name);
 return {...automatic,candidates,manual:true,manualTags:record.tags,needsReview:candidates.length!==(record.tags||[]).length,titleTerms:automatic.titleTerms};
}
