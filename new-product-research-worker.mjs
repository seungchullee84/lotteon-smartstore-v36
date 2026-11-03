import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {collect,assertAdultProduct} from './product.mjs';
import {officialPointSource,reviewSellingPoints} from './smartstore-selling-point-review.mjs';
import {CATALOG_RULE} from './official-benefit-catalog.mjs';
import {atomicWrite} from './atomic-file.mjs';
import {enrichOfficialProductFacts} from './apparel-product-facts.mjs';
const [storage,raw]=process.argv.slice(2),item=JSON.parse(raw),root=path.dirname(fileURLToPath(import.meta.url));
const controller=new AbortController();process.on('message',m=>{if(m.abort)controller.abort(Error('조사 일시중지'));});process.on('disconnect',()=>controller.abort(Error('등록기 연결 종료')));
try{os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
const started=Date.now(),cpu=process.cpuUsage();let peakRss=process.memoryUsage().rss;
const meter=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);process.send?.({metrics:{elapsedMs:Date.now()-started,workerPeakRssBytes:peakRss}});},2000);
try{
 for(const language of ['kor.traineddata','eng.traineddata']){const target=path.join(storage,language);try{await access(target);}catch{try{await copyFile(path.join(root,language),target);}catch{}}}
 const folder=path.join(storage,'sources',item.id);await mkdir(folder,{recursive:true});
 const product=await collect(item.sourceUrl,folder,()=>{},()=>controller.signal.aborted,controller.signal,{prepareMain:false,saveSmartstoreSource:true,noticeCacheRoot:path.join(storage,'notice-cache')});
 assertAdultProduct(product);if(/^\d{6}$/.test(item.style)&&product.style!==item.style)throw Error('목록 품번과 상세 품번 불일치');
 const enriched=await enrichOfficialProductFacts(product,folder,{dataRoot:storage,signal:controller.signal});
 const source=await officialPointSource(product,folder,product.officialDescription||'',{dataRoot:storage,signal:controller.signal});
 if(!source.imageChecked)throw Error('공식 상세이미지 분석 미완료');
 const reviewed=await reviewSellingPoints(product,source.text,{dataRoot:storage,detailHash:source.detailHash,signal:controller.signal});
 controller.signal.throwIfAborted();
 const record={rule:CATALOG_RULE,style:product.style,rawName:product.rawName,gender:product.gender,sourceCategory:product.sourceCategory,sourceUrl:product.sourceUrl,detailUrl:product.images.detail,detailHash:source.detailHash,pageText:product.officialDescription||'',pageHash:createHash('sha256').update(product.officialDescription||'').digest('hex'),imageText:enriched.researchFacts.text,imageScanComplete:true,visualReview:false,points:reviewed.points,status:reviewed.points.length>=3?'automatic-source-reviewed':'needs-review',analyzedAt:new Date().toISOString(),folder};
 for(const file of [path.join(storage,'by-source',item.id+'.json'),path.join(storage,'products',product.style+'.json')])await atomicWrite(file,JSON.stringify(record,null,2));
 const used=process.cpuUsage(cpu),metrics={elapsedMs:Date.now()-started,workerPeakRssBytes:peakRss,workerCpuMs:(used.user+used.system)/1000,note:'작업 Node 프로세스 기준; 브라우저 하위 프로세스 메모리 제외'};
 await writeFile(path.join(folder,'resource-measurement.json'),JSON.stringify(metrics,null,2));
 process.send?.({result:{style:product.style,pointCount:reviewed.points.length,folder,detailHash:source.detailHash,metrics}});
}catch(e){process.send?.({error:e.message});process.exitCode=1;}finally{clearInterval(meter);process.disconnect?.();}
