import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createOfficialLayoutMatcher} from './smartstore-official-layout.mjs';
const width=96,rule='full-width-pixel-inclusion-5';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function pixels(bytes,height){return sharp(bytes,{limitInputPixels:false}).flatten({background:'#fff'}).resize(width,height,{fit:'fill'}).greyscale().raw().toBuffer();}
function rows(bytes,height){const out=new Float64Array(height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)out[y]+=255-bytes[y*width+x];return out;}
async function matchFullWidthSection(detail,section){
 const dm=await sharp(detail,{limitInputPixels:false}).metadata(),sm=await sharp(section,{limitInputPixels:false}).metadata();
 const height=Math.round(sm.height*dm.width/sm.width);
 if(!height||height>dm.height)return {included:false};
 const [a,b]=await Promise.all([pixels(detail,dm.height),pixels(section,height)]),ar=rows(a,dm.height),br=rows(b,height),ink=br.reduce((s,v)=>s+v,0);
 if(ink/(width*height)<1)return {included:false}; // A blank image cannot establish inclusion.
 const candidates=[];
 for(let top=0;top<=dm.height-height;top++){
  let loss=0;for(let y=0;y<height;y++){loss+=Math.abs(ar[top+y]-br[y]);if(loss>ink*.14)break;}
  if(loss>ink*.14)continue;
  candidates.push({top,loss});candidates.sort((x,y)=>x.loss-y.loss);if(candidates.length>8)candidates.pop();
 }
 let best={included:false};
 for(const candidate of candidates){
  let loss=0;for(let i=0;i<b.length;i++)loss+=Math.abs(a[candidate.top*width+i]-b[i]);
  // The official standalone size chart can blank out unavailable size columns.
  // Keep the complete original chart when the same full-width section matches.
  const error=loss/ink;if(best.error===undefined||error<best.error)best={included:error<=.16,top:candidate.top,height,error};
 }
 if(best.included)return best;
 // Compare at the same sampling scale in both directions. Resized official
 // charts have subpixel text offsets that the full-height comparison rejects.
 const scaled=bytes=>sharp(bytes,{limitInputPixels:false}).flatten({background:'#fff'}).resize({width}).greyscale().raw().toBuffer({resolveWithObject:true});
 const [haystack,sample]=await Promise.all([scaled(detail),scaled(section)]);
 const small=haystack.data,needle=sample.data,dh=haystack.info.height,sh=sample.info.height;
 const needleInk=needle.reduce((sum,v)=>sum+255-v,0);
 if(needleInk/(width*sh)<1)return best;
 let squared=0;for(const v of needle)squared+=(255-v)**2;
 if(squared/needle.length-(needleInk/needle.length)**2<25)return best;
 for(let top=0;top<=dh-sh;top++){
  let loss=0,dot=0,norm=0;
  for(let i=0;i<needle.length;i++){const x=255-small[top*width+i],y=255-needle[i];loss+=Math.abs(x-y);dot+=x*y;norm+=x*x;}
  const error=loss/needleInk,similarity=dot/Math.sqrt(norm*squared);
  if(error<=.32&&similarity>=.95)return {included:true,top:Math.round(top*dm.width/width),height,error,similarity,comparison:'uniform-scale'};
 }
 return best;
}

async function softenedInk(bytes){
 const scaled=await sharp(bytes,{limitInputPixels:false}).flatten({background:'#fff'}).resize({width}).greyscale().png().toBuffer();
 const {data,info}=await sharp(scaled).blur(.7).greyscale().raw().toBuffer({resolveWithObject:true});
 const ink=Uint8Array.from(data,value=>Math.max(0,251-value));
 const rowInk=new Float64Array(info.height);
 for(let y=0;y<rowInk.length;y++)for(let x=1;x<width-1;x++)rowInk[y]+=ink[y*width+x];
 return {ink,rowInk};
}

function sampledInk(pixels,x,y){
 const column=Math.floor(x),row=Math.floor(y),u=x-column,v=y-row;
 const i=row*width+column;
 return (pixels[i]*(1-u)+pixels[i+1]*u)*(1-v)+(pixels[i+width]*(1-u)+pixels[i+width+1]*u)*v;
}

async function matchResampledSection(detail,section){
 const [original,sample]=await Promise.all([softenedInk(detail),softenedInk(section)]);
 const first=sample.rowInk.findIndex(value=>value>10),last=sample.rowInk.findLastIndex(value=>value>10);
 const height=last-first+1,detailHeight=original.rowInk.length;
 if(first<0||height<10||height>detailHeight)return null;
 const sampleRows=sample.rowInk.subarray(first,last+1);
 let totalInk=0,sampleSquare=0;
 for(let y=first;y<=last;y++)for(let x=2;x<width-2;x++){
  const value=sample.ink[y*width+x];
  totalInk+=value;
  sampleSquare+=value*value;
 }
 const count=height*(width-4),mean=totalInk/count;
 if(mean<1||sampleSquare/count-mean*mean<25)return null;
 const candidates=[];
 for(let top=0;top<=detailHeight-height;top++){
  let loss=0;
  for(let y=0;y<height;y++)loss+=Math.abs(original.rowInk[top+y]-sampleRows[y]);
  if(loss>totalInk*.30)continue;
  candidates.push({top,loss});
  candidates.sort((a,b)=>a.loss-b.loss);
  if(candidates.length>5)candidates.pop();
 }
 // Different export resolutions can shift the same text by half a pixel.
 // Require agreement throughout the chart so changes in individual rows
 // (such as a different list of colors or sizes) aren't treated as padding.
 for(const {top} of candidates)for(const dy of [0,-.25,.25,-.5,.5]){
  if(top+dy<0||top+dy+height>=detailHeight)continue;
  for(const dx of [0,-.5,.5,-1,1]){
   let error=0,dot=0,originalSquare=0;
   const strips=Array.from({length:10},()=>({error:0,originalInk:0,sampleInk:0}));
   for(let y=0;y<height;y++){
    const strip=strips[Math.floor(y*strips.length/height)];
    for(let x=2;x<width-2;x++){
     const a=sampledInk(original.ink,x+dx,top+y+dy),b=sample.ink[(first+y)*width+x];
     const difference=Math.abs(a-b);
     error+=difference;dot+=a*b;originalSquare+=a*a;
     strip.error+=difference;strip.originalInk+=a;strip.sampleInk+=b;
    }
   }
   const similarity=dot/Math.sqrt(originalSquare*sampleSquare);
   if(error/totalInk<=.24&&similarity>=.975&&strips.every(strip=>strip.error<=.34*Math.max(strip.originalInk,strip.sampleInk,totalInk*.01))){
    const scale=(await sharp(detail,{limitInputPixels:false}).metadata()).width/width;
    return {included:true,top:Math.round((top+dy)*scale),height:Math.round(height*scale),error:error/totalInk,similarity,comparison:'resampled-content'};
   }
  }
 }
 return null;
}

export async function officialSectionMatch(detail,section){
 const match=await matchFullWidthSection(detail,section);
 if(match.included)return match;
 const {data,info}=await sharp(section,{limitInputPixels:false}).flatten({background:'#fff'}).greyscale().raw().toBuffer({resolveWithObject:true});
 const blank=y=>data.subarray(y*info.width,(y+1)*info.width).every(value=>value>=245);
 let top=0,bottom=info.height;
 while(top<bottom&&blank(top))top++;
 while(bottom>top&&blank(bottom-1))bottom--;
 if(top===bottom)return match;
 // Standalone sections can have more outer whitespace than fits in the long
 // image. Compare all visible content and require a close pixel match.
 if(bottom-top!==info.height){
  const sample=await sharp(section,{limitInputPixels:false}).extract({left:0,top,width:info.width,height:bottom-top}).png().toBuffer();
  const trimmed=await matchFullWidthSection(detail,sample);
  if(trimmed.included&&trimmed.error<=.06)return {...trimmed,comparison:'without-vertical-padding'};
 }
 return await matchResampledSection(detail,section)||match;
}
async function verifiedSectionInsideDetail(name,product,dataRoot,files){
 if(!files[name]||!/^\d{6}$/.test(product.style)||!product.sourceUrl)return false;
 try{
  const review=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'official-'+name+'-inclusion.json'),'utf8'));
  return review.verified===true&&review.style===product.style&&review.sourceUrl===product.sourceUrl&&review.detailSha256===files.detail&&review[name+'Sha256']===files[name];
 }catch{return false;}
}
export async function embeddedOfficialSections(product,folder,{dataRoot=path.dirname(folder),smartstoreLayout=false}={}){
 if(!product.images?.detail)return [];
 if(!['size','check','info'].some(key=>product.images[key]))return [];
 const detail=await readFile(path.join(folder,'detail.jpg')),files={detail:hash(detail)},sections={};
 for(const key of ['size','check','info'])if(product.images[key]){
  try{sections[key]=await readFile(path.join(folder,key+'.jpg'));files[key]=hash(sections[key]);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const reviewed=await Promise.all(['size','check','info'].map(async name=>await verifiedSectionInsideDetail(name,product,dataRoot,files)?name:null));
 const verified=reviewed.filter(Boolean);
 const comparisonRule=smartstoreLayout?'section-layout-1':rule;
 const key=hash(Buffer.from(JSON.stringify({rule:comparisonRule,files,...(verified.length?{verified}:{})})));
 const cache=path.join(folder,smartstoreLayout?'smartstore-official-section-layout.json':'smartstore-official-section-inclusion.json');
 try{const saved=JSON.parse(await readFile(cache,'utf8'));if(saved.key===key&&Array.isArray(saved.included)&&saved.included.every(n=>['size','check','info'].includes(n)&&files[n]))return saved.included;}catch{}
 const matches={};
 const compare=smartstoreLayout?createOfficialLayoutMatcher(detail):bytes=>officialSectionMatch(detail,bytes);
 for(const [name,bytes] of Object.entries(sections)){
  matches[name]=verified.includes(name)
   ?{included:true,comparison:'verified-source-pair'}
   :await compare(bytes);
 }
 const included=Object.keys(matches).filter(name=>matches[name].included);
 await writeFile(cache,JSON.stringify({key,rule:comparisonRule,style:product.style,files,included,matches},null,2));return included;
}
