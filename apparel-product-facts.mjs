import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {createWorker} from 'tesseract.js';

const VERSION='official-detail-facts-1';
export function explicitDetailFacts(text){
 const clean=String(text||'').normalize('NFKC');const found=[];
 const add=(feature,pattern,negative)=>{if(pattern.test(clean)&&!negative?.test(clean))found.push(feature);};
 for(const [name,pattern] of [['봄',/봄(?!버)|\bspring\b/i],['여름',/여름|\bsummer\b/i],['가을',/가을|\bautumn\b|\bfall\b/i],['겨울',/겨울|\bwinter\b/i]])add(name,pattern);
 if(/\bS\s*[\/.&]\s*S\b/i.test(clean))found.push('봄','여름');
 if(/\bF\s*[\/.&]\s*W\b/i.test(clean))found.push('가을','겨울');
 for(const [name,pattern,negative] of [
  ['긴팔',/긴\s*(?:팔|소매)|\blong\s*sleeve/i,/긴\s*(?:팔|소매).*아닌/],['반팔',/반\s*(?:팔|소매)|\bshort\s*sleeve/i,/반\s*(?:팔|소매).*아닌/],
  ['레귤러핏',/레귤러\s*핏|regular\s*fit/i],['오버핏',/오버\s*(?:핏|사이즈)|oversized?\s*fit/i],['와이드핏',/와이드\s*핏|wide\s*fit/i],['테이퍼드핏',/테이퍼드|tapered/i],
  ['라운드넥',/크루\s*넥|라운드\s*넥|crew\s*neck/i],['쭈리',/쭈리|프렌치\s*테리|french\s*terry/i],['기모',/기모|브러시드|brushed/i,/(?:무|노)기모|기모\s*(?:가\s*)?없/]
 ])add(name,pattern,negative);
 return [...new Set(found)];
}

export async function enrichOfficialProductFacts(product,folder,{dataRoot=path.join(process.cwd(),'data'),log=()=>{},signal,recognize}={}){
 if(!product.images?.detail)return product;
 const bytes=await readFile(path.join(folder,'detail.jpg')),detailHash=createHash('sha256').update(bytes).digest('hex');
 const key=createHash('sha256').update(JSON.stringify([VERSION,product.style,product.sourceUrl,detailHash])).digest('hex');
 const cacheRoot=path.join(dataRoot,'apparel-product-facts'),file=path.join(cacheRoot,key+'.json');let facts;
 try{facts=JSON.parse(await readFile(file,'utf8'));if(facts.style!==product.style||facts.sourceUrl!==product.sourceUrl||facts.detailHash!==detailHash||facts.version!==VERSION)facts=null;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(facts){log('공식 상세 이미지 특성 재사용 · 시즌·핏·소매');return {...product,researchFacts:facts};}
 signal?.throwIfAborted();log('공식 상세 이미지의 시즌·핏·소매 문구 확인');
 let worker;const abort=()=>{void worker?.terminate();};signal?.addEventListener('abort',abort,{once:true});
 try{
  let text;
  if(recognize)text=await recognize(bytes);
  else{
   worker=await createWorker('kor+eng');signal?.throwIfAborted();
   const meta=await sharp(bytes).metadata(),lines=[];
   // Read the entire original in overlapping strips, never truncate to its cover.
   for(let top=0;top<meta.height;top+=3000){
    signal?.throwIfAborted();const strip=await sharp(bytes).extract({left:0,top,width:meta.width,height:Math.min(3400,meta.height-top)}).resize({width:Math.min(meta.width,1100),withoutEnlargement:true}).toBuffer();
    const result=await worker.recognize(strip,{}, {tsv:true});
    const confident=String(result.data.tsv||'').split('\n').slice(1).map(line=>line.split('\t')).filter(cols=>Number(cols[10])>=75&&cols[11]?.trim()).map(cols=>cols.slice(11).join('\t')).join(' ');
    lines.push(confident);
   }
   text=lines.join('\n');
  }
  signal?.throwIfAborted();
  facts={version:VERSION,style:product.style,sourceUrl:product.sourceUrl,detailHash,features:explicitDetailFacts(text),visualFeatures:[],observedAt:new Date().toISOString()};
  await mkdir(cacheRoot,{recursive:true});await writeFile(file,JSON.stringify(facts,null,2));
  return {...product,researchFacts:facts};
 }finally{signal?.removeEventListener('abort',abort);await worker?.terminate().catch(()=>{});}
}
