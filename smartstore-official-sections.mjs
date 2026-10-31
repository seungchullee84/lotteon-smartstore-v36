import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const width=96,rule='full-width-pixel-inclusion-3';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function pixels(bytes,height){return sharp(bytes,{limitInputPixels:false}).flatten({background:'#fff'}).resize(width,height,{fit:'fill'}).greyscale().raw().toBuffer();}
function rows(bytes,height){const out=new Float64Array(height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)out[y]+=255-bytes[y*width+x];return out;}
export async function officialSectionMatch(detail,section){
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
 const dh=Math.round(dm.height*width/dm.width),sh=Math.round(sm.height*width/sm.width);
 const [small,needle]=await Promise.all([pixels(detail,dh),pixels(section,sh)]);
 const needleInk=needle.reduce((sum,v)=>sum+255-v,0);
 if(needleInk/(width*sh)<1)return best;
 let squared=0;for(const v of needle)squared+=(255-v)**2;
 for(let top=0;top<=dh-sh;top++){
  let loss=0,dot=0,norm=0;
  for(let i=0;i<needle.length;i++){const x=255-small[top*width+i],y=255-needle[i];loss+=Math.abs(x-y);dot+=x*y;norm+=x*x;}
  const error=loss/needleInk,similarity=dot/Math.sqrt(norm*squared);
  if(error<=.32&&similarity>=.95)return {included:true,top:Math.round(top*dm.width/width),height,error,similarity,comparison:'uniform-scale'};
 }
 return best;
}
export async function embeddedOfficialSections(product,folder){
 if(!product.images?.detail)return [];
 const detail=await readFile(path.join(folder,'detail.jpg')),files={detail:hash(detail)},sections={};
 for(const key of ['size','check','info','main','extra1','extra2'])if(product.images[key]){
  try{sections[key]=await readFile(path.join(folder,key+'.jpg'));files[key]=hash(sections[key]);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const key=hash(Buffer.from(JSON.stringify({rule,files}))),cache=path.join(folder,'smartstore-official-section-inclusion.json');
 try{const saved=JSON.parse(await readFile(cache,'utf8'));if(saved.key===key&&Array.isArray(saved.included)&&saved.included.every(n=>['size','check','info','main','extra1','extra2'].includes(n)&&files[n]))return saved.included;}catch{}
 const matches={};for(const [name,bytes]of Object.entries(sections))matches[name]=await officialSectionMatch(detail,bytes);
 const included=Object.keys(matches).filter(name=>matches[name].included);
 await writeFile(cache,JSON.stringify({key,rule,style:product.style,files,included,matches},null,2));return included;
}
