import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {assertAdultProduct} from './product.mjs';
import {officialSellingPoints,officialImageBenefitText} from './smartstore-selling-points.mjs';

export const SHARED_BENEFIT_DIR='research/official-benefits';
const shards=Array.from('0123456789abcdef',id=>'shard-'+id+'.json');
const rule='adult-official-benefits-1';
const sensitive=/(?:sk-(?:proj-)?[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|[A-Za-z]:\\(?:Users|KC334)\\)/;
export async function readJson(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function writeChanged(file,value){
 const text=JSON.stringify(value,null,2)+'\n';
 try{if(await readFile(file,'utf8')===text)return false;}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.tmp',text);await rename(file+'.tmp',file);return true;
}
function identity(value){
 try{const u=new URL(value);const id=u.searchParams.get('pno');if(u.origin!=='https://www.giordano.co.kr'||u.pathname!=='/shop/detail.php'||u.username||u.password||!/^[a-f0-9]{16,64}$/i.test(id||''))return null;return {id,url:'https://www.giordano.co.kr/shop/detail.php?pno='+id+'&ctype=1'};}catch{return null;}
}
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function shareableBenefit(record){
 if(!record||record.rule!==rule||!/^\d{6}$/.test(record.style||''))return null;
 try{assertAdultProduct(record);}catch{return null;}
 const source=identity(record.sourceUrl);if(!source)return null;
 const category=(record.sourceCategory||[]).filter(v=>typeof v==='string');
 const scope=[...category,record.gender||'',record.rawName||''].join(' ');
 if(/여아|남아/.test(scope)||!/\bMEN\b|\bWOMEN\b|G-MOTION|남성|여성|성인|공용|UNISEX/i.test(scope))return null;
 let detailUrl=null;if(record.detailUrl){try{const u=new URL(record.detailUrl);if(u.origin==='https://www.giordano.co.kr'&&!u.username&&!u.password)detailUrl=u.href;}catch{}}
 const detailHash=/^[a-f0-9]{64}$/i.test(record.detailHash||'')?record.detailHash:null;
 const pageText=String(record.pageText||''),imageText=detailHash?String(record.imageText||''):'';
 if(pageText.length>1000000||imageText.length>1000000)throw Error('공식 조사 원문 크기를 확인해 주세요.');
 const imageScanComplete=record.imageScanComplete===true&&!!detailHash&&!!imageText.trim();
 const points=officialSellingPoints([officialImageBenefitText(imageScanComplete?imageText:''),pageText].filter(Boolean).join('\n•\n'));
 const detailValidators={etag:typeof record.detailValidators?.etag==='string'?record.detailValidators.etag.slice(0,500):null,lastModified:typeof record.detailValidators?.lastModified==='string'?record.detailValidators.lastModified.slice(0,100):null};
 const pageHash=/^[a-f0-9]{64}$/i.test(record.pageHash||'')?record.pageHash:null;
 const result={rule,style:record.style,rawName:String(record.rawName||''),gender:['남성','여성'].includes(record.gender)?record.gender:'',sourceCategory:category,sourceUrl:source.url,detailUrl,detailHash,detailImageVerified:record.detailImageVerified===true&&!!detailHash,detailValidators,pageHash,pageText,imageText:imageScanComplete?imageText:'',imageScanComplete,points,status:imageScanComplete?(points.length>=3?'automatic-source-reviewed':'needs-review'):'image-pending',visualReview:false,observedAt:iso(record.observedAt),analyzedAt:iso(record.analyzedAt)};
 if(sensitive.test(JSON.stringify(result)))throw Error('공식 조사자료에 비공개 정보로 보이는 내용이 있어 공유를 중단했습니다.');
 return result;
}
export function preferBenefit(local,incoming){
 if(!local)return incoming;if(!incoming)return local;
 if(local.style!==incoming.style)return (incoming.observedAt||'')>(local.observedAt||'')?incoming:local;
 if(local.detailHash===incoming.detailHash&&local.imageScanComplete!==incoming.imageScanComplete)return local.imageScanComplete?local:incoming;
 return (incoming.observedAt||'')>(local.observedAt||'')||(incoming.observedAt===local.observedAt&&(incoming.analyzedAt||'')>(local.analyzedAt||''))?incoming:local;
}
function queueEntries(queue){
 return (Array.isArray(queue)?queue:[]).flatMap(item=>{const source=identity(item?.sourceUrl);return source?[{pno:source.id,sourceUrl:source.url,categories:(item.categories||[]).filter(v=>['남성 ALL','여성 ALL','성인 G-MOTION','아울렛'].includes(v))}]:[];});
}
async function localRecords(catalogDir){
 let names;try{names=await readdir(path.join(catalogDir,'by-source'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const records=[];for(const name of names.filter(n=>/^[a-f0-9]{16,64}\.json$/i.test(n))){const raw=await readJson(path.join(catalogDir,'by-source',name));const record=shareableBenefit(raw);if(record)records.push(record);}
 return records;
}
export function sharedWebsiteState(state,records=[]){
 if(state?.version!==1||!iso(state.checkedAt))return null;
 const hash=v=>/^[a-f0-9]{64}$/i.test(v||'')?v:null;
 const products=Object.fromEntries(Object.entries(state.products||{}).filter(([id])=>/^[a-f0-9]{16,64}$/i.test(id)).map(([id,r])=>[id,{pageHash:hash(r.pageHash),detailHash:hash(r.detailHash),detailPresent:typeof r.detailPresent==='boolean'?r.detailPresent:null,detailImageVerified:typeof r.detailImageVerified==='boolean'?r.detailImageVerified:null}]));
 const batches=(state.batches||[]).slice(-168).filter(b=>/^[a-f0-9]{20}$/i.test(b.id||'')&&iso(b.checkedAt)).map(b=>({id:b.id,checkedAt:iso(b.checkedAt),events:(b.events||[]).flatMap(e=>{const source=identity(e.sourceUrl);if(!source||!['new','changed'].includes(e.type)||!/^\d{6}$/.test(e.style||'')||/주니어|키즈|아동|여아|남아|JUNIOR|KIDS/i.test(e.name||''))return [];const changes=(e.changes||[]).filter(v=>['새로 발견한 성인 상품','공식 상세페이지 추가','공식 상세이미지 추가','공식 상세이미지 변경'].includes(v));if(e.type==='changed'&&!changes.length)return [];const record=records.find(r=>r.style===e.style&&r.sourceUrl===source.url);const status=record?((record.pageHash!==e.pageHash||record.detailHash!==e.detailHash)?'superseded':record.imageScanComplete?(record.points.length?'ready':'needs-review'):'analyzing'):'analyzing';return [{type:e.type,style:e.style,name:String(e.name||''),sourceUrl:source.url,pageHash:hash(e.pageHash),detailHash:hash(e.detailHash),changes,status}];})}));
 const result={version:1,checkedAt:iso(state.checkedAt),nextCheckAt:iso(state.nextCheckAt),baselineAt:iso(state.baselineAt),baselineReady:true,errors:Number.isInteger(state.errors)?state.errors:0,products,batches};if(sensitive.test(JSON.stringify(result)))throw Error('변경 알림 자료에 비공개 정보로 보이는 내용이 있습니다.');return result;
}
export async function exportBenefitSnapshot(catalogDir,sharedDir){
 const records=(await localRecords(catalogDir)).sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl));
 const allowed=new Set(records.map(r=>identity(r.sourceUrl).id.toLowerCase()));
 // Keep unresolved official URLs so another computer can retry them, but remove known junior records.
 const rawQueue=queueEntries(await readJson(path.join(catalogDir,'queue.json'),[]));
 const excluded=new Set();for(const item of rawQueue){const raw=await readJson(path.join(catalogDir,'by-source',item.pno+'.json'));if(raw&&!allowed.has(item.pno.toLowerCase()))excluded.add(item.pno.toLowerCase());}
 const queue=new Map(rawQueue.filter(r=>!excluded.has(r.pno.toLowerCase())).map(r=>[r.pno.toLowerCase(),r]));
 for(const record of records){const source=identity(record.sourceUrl);if(!queue.has(source.id.toLowerCase()))queue.set(source.id.toLowerCase(),{pno:source.id,sourceUrl:source.url,categories:[]});}
 const buckets=Object.fromEntries(shards.map(name=>[name,[]]));for(const record of records)buckets['shard-'+identity(record.sourceUrl).id[0].toLowerCase()+'.json'].push(record);
 let changed=0;for(const name of shards)changed+=Number(await writeChanged(path.join(sharedDir,name),{version:1,records:buckets[name]}));
 const progress=await readJson(path.join(catalogDir,'progress.json'),{});
 const manifest={version:1,rule,scope:'성인 남성·여성·G-MOTION, 주니어 제외',shards,queue:[...queue.values()].sort((a,b)=>a.pno.localeCompare(b.pno)),sourceComplete:records.length,imageComplete:records.filter(r=>r.imageScanComplete).length,withThreeOrFour:records.filter(r=>r.imageScanComplete&&r.points.length>=3).length,phase:progress.phase||'ready',startedAt:iso(progress.startedAt),updatedAt:records.reduce((latest,r)=>[r.analyzedAt,r.observedAt,latest].filter(Boolean).sort().at(-1)||null,null)};
 manifest.websiteCheck=sharedWebsiteState(await readJson(path.join(catalogDir,'website-check.json')),records);
 changed+=Number(await writeChanged(path.join(sharedDir,'manifest.json'),manifest));
 return {...manifest,changedFiles:changed};
}
export async function restoreBenefitSnapshot(sharedDir,catalogDir){
 const manifest=await readJson(path.join(sharedDir,'manifest.json'));if(!manifest)return {available:false,restored:0};
 if(manifest.version!==1||manifest.rule!==rule||JSON.stringify(manifest.shards)!==JSON.stringify(shards))throw Error('공유 소구점 자료 형식을 확인해 주세요.');
 const queue=new Map(queueEntries(await readJson(path.join(catalogDir,'queue.json'),[])).map(r=>[r.pno.toLowerCase(),r]));
 for(const item of queueEntries(manifest.queue))queue.set(item.pno.toLowerCase(),item);
 let restored=0,complete=0;
 for(const name of shards){const shard=await readJson(path.join(sharedDir,name));if(shard?.version!==1||!Array.isArray(shard.records))throw Error('공유 소구점 자료가 빠졌습니다: '+name);
  for(const raw of shard.records){const incoming=shareableBenefit(raw);if(!incoming)continue;const source=identity(incoming.sourceUrl);const file=path.join(catalogDir,'by-source',source.id+'.json');const localRaw=await readJson(file);const local=shareableBenefit(localRaw);const selected=preferBenefit(local,incoming);const record={...selected,folder:path.join(catalogDir,'sources',source.id),restoredFromSnapshot:!!selected.imageScanComplete};
   if(await writeChanged(file,record))restored++;if(record.imageScanComplete)complete++;
   if(!queue.has(source.id.toLowerCase()))queue.set(source.id.toLowerCase(),{pno:source.id,sourceUrl:source.url,categories:[]});
  }
 }
 await writeChanged(path.join(catalogDir,'queue.json'),[...queue.values()]);
 const website=sharedWebsiteState(manifest.websiteCheck);const localWebsite=await readJson(path.join(catalogDir,'website-check.json'));if(website&&(!localWebsite||website.checkedAt>localWebsite.checkedAt))await writeChanged(path.join(catalogDir,'website-check.json'),website);
 if(!await readJson(path.join(catalogDir,'progress.json')))await writeChanged(path.join(catalogDir,'progress.json'),{rule,phase:'ready',categories:[],startedAt:manifest.startedAt||new Date().toISOString(),discovered:queue.size,sourceComplete:manifest.sourceComplete,imageComplete:complete,restoredFromGithub:true,errors:[]});
 return {available:true,restored,complete,total:queue.size};
}
