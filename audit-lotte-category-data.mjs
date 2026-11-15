// Read-only coverage audit. This never connects to a seller browser or modifies a product.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {allLotteStandardPaths,validateLotteCategory} from './lotte-category-validation.mjs';
import {commonFor} from './category-catalog.mjs';
import {productClassification,repairCategoryFields} from './product.mjs';
import {bridgeLotteCategory} from './lotte-category-bridge.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const escape=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function auditLotteCategoryData(){
  const standard=read('./data/category-catalog-standard.json'),common=read('./data/category-catalog-common.json');
  const paths=allLotteStandardPaths(standard).map(p=>{
    const gender=p.major.name==='브랜드남성의류'?'남성':p.major.name==='브랜드여성의류'?'여성':null;
    const mapped=gender?commonFor(p,gender,common):null;
    return {gender,channel:[p.major.name,p.middle.name,p.small.name,p.detail?.name].filter(Boolean),codes:[p.major.code,p.middle.code,p.small.code,p.detail?.code].filter(Boolean),common:mapped,status:mapped?'mapped':'individual-review'};
  });
  const records=new Map();
  for(const shard of read('./research/official-benefits/manifest.json').shards||[]){
    for(const r of read('./research/official-benefits/'+shard).records||[])if(['남성','여성'].includes(r.gender)&&r.style&&!/(?:JUNIOR|주니어)/i.test([r.rawName,...(r.sourceCategory||[])].join(' ')))records.set(r.style,r);
  }
  const products=[];
  for(const r of records.values()){
    const html='<div class="navi"><a>Home</a>'+(r.sourceCategory||[]).map((x,i)=>'<a'+(i===0?' class="prdpath1"':'')+'>'+escape(x)+'</a>').join('')+'<a>'+escape(r.rawName)+'</a></div>';
    const p={style:r.style,rawName:r.rawName,name:r.rawName,sourceUrl:r.sourceUrl,...productClassification(html)};
    repairCategoryFields(p);const v=validateLotteCategory(p);
    const bridge=bridgeLotteCategory(p);
    products.push({style:r.style,name:r.rawName,gender:r.gender,sourceCategory:r.sourceCategory,ready:v.ready,commonPath:v.commonPath,channelPath:v.channelPath,issues:v.issues,bridge});
  }
  const issueCounts={};for(const p of products.filter(p=>!p.ready))for(const i of p.issues)issueCounts[i.code]=(issueCounts[i.code]||0)+1;
  const commonBridges=common.genders.flatMap(g=>g.middles.flatMap(m=>m.children.map(s=>({gender:g.gender,first:[g.major,m.middle,s],...bridgeLotteCategory({gender:g.gender,category:{commonMajor:g.major,commonMiddle:m.middle,commonSmall:s}})}))));
  const withFirst=products.filter(p=>p.commonPath.length>=3);
  return {checkedAt:new Date().toISOString(),mode:'offline-catalogue-and-official-records',sellerActions:false,liveTaxonomyRechecked:false,catalogueDate:standard.completedAt,scope:standard.scope,summary:{commonLeaves:commonBridges.length,commonLeavesBridged:commonBridges.filter(p=>p.complete).length,commonLeavesBroaderDefault:commonBridges.filter(p=>p.broad).length,productsWithFirst:withFirst.length,productsWithFirstBridged:withFirst.filter(p=>p.bridge.complete).length,standardPaths:paths.length,apparelPaths:paths.filter(p=>p.gender).length,mappedApparelPaths:paths.filter(p=>p.gender&&p.common).length,unmappedApparelPaths:paths.filter(p=>p.gender&&!p.common).length,products:products.length,ready:products.filter(p=>p.ready).length,review:products.filter(p=>!p.ready).length,issueCounts},commonBridges,paths,products};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=auditLotteCategoryData();
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2));
 console.log(JSON.stringify(result.summary,null,2));
}
