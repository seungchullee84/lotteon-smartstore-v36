import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createWorker} from 'tesseract.js';
import {photoDigest} from './smartstore-photo-files.mjs';
import {photoReviewChips} from './smartstore-photo-review-chips.mjs';
import {garmentKind,resolveDraftPhotoColor,refineNeutralDraftColors} from './smartstore-local-photo-policy.mjs';
import {careLabelText} from './smartstore-care-label-text.mjs';

// A quick, explicitly unconfirmed color suggestion, never a garment segmentation
// or a human review. Original pixels, mappings and seller uploads are untouched.
export const FAST_PHOTO_VERSION='thumbnail-color-label-v2';
export async function inspectPhotoThumbnail(bytes,kind){
 const {data,info}=await sharp(bytes).rotate().resize({width:320,height:480,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const gray=Uint8Array.from({length:info.width*info.height},(_,i)=>Math.round((data[i*3]+data[i*3+1]+data[i*3+2])/3));
 let ink=0,textRows=0;const inkX=[],inkY=[];
 for(let y=2;y<info.height-2;y++){let row=0;for(let x=2;x<info.width-2;x++){const i=y*info.width+x,v=gray[i];if(Math.max(gray[i-2],gray[i+2])-v>45&&Math.max(gray[i-info.width*2],gray[i+info.width*2])-v>30){row++;inkX.push(x);inkY.push(y);}}ink+=row;if(row>=5)textRows++;}
 const textCandidate=ink/gray.length>=.012&&textRows>=40;
 const values=[[],[],[]],top=kind==='upper'?.22:.35,bottom=kind==='upper'?.5:.72;
 for(let y=Math.floor(info.height*top);y<info.height*bottom;y++)for(let x=Math.floor(info.width*.32);x<info.width*.68;x++)for(let c=0;c<3;c++)values[c].push(data[(y*info.width+x)*3+c]);
 const quantiles=values.map(v=>{v.sort((a,b)=>a-b);return [.2,.5,.8].map(q=>v[Math.floor(q*v.length)]);});
 const span=(v,size)=>{v.sort((a,b)=>a-b);return [Math.max(0,(v[Math.floor(v.length*.02)]-6)/size),Math.min(1,(v[Math.floor(v.length*.98)]+6)/size)];};
 return {textCandidate,quantiles,inkRatio:ink/gray.length,textRows,textBounds:textCandidate?{x:span(inkX,info.width),y:span(inkY,info.height)}:null};
}

export async function classifyFastPhotoDraft(product,photos,{dataRoot,folder,signal,log=()=>{},recognizePhoto}={}){
 signal?.throwIfAborted();
 const started=performance.now(),kind=garmentKind(product),chips=await photoReviewChips(product,folder);
 const references=product.colors.map(color=>({quantiles:chips[color]?.color?.match(/^#([a-f\d]{6})$/i)?.[1]?.match(/../g).map(v=>{const n=parseInt(v,16);return [n,n,n];})}));
 const root=path.join(dataRoot,'smartstore-photo-fast-cache');await mkdir(root,{recursive:true});
 const identity=JSON.stringify([FAST_PHOTO_VERSION,product.style,product.sourceUrl,product.colors,kind,references]);
 const results=[],samples=[];let worker,ocrCount=0,reused=0;
 const recognize=recognizePhoto||(async(bytes,sample)=>{
  worker||=await createWorker('kor+eng');signal?.throwIfAborted();
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  const resized=await sharp(bytes).rotate().resize({width:1000,height:1400,fit:'inside',withoutEnlargement:true}).toBuffer(),meta=await sharp(resized).metadata(),{x,y}=sample.textBounds;
  const left=Math.floor(x[0]*meta.width),top=Math.floor(y[0]*meta.height),width=Math.max(1,Math.ceil(x[1]*meta.width)-left),height=Math.max(1,Math.ceil(y[1]*meta.height)-top);
  const input=await sharp(resized).extract({left,top,width,height}).greyscale().blur(.7).normalize().toBuffer();
  return (await worker.recognize(input)).data.text;
 });
 const abort=()=>{void worker?.terminate().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  for(const photo of photos){
   signal?.throwIfAborted();const digest=photoDigest(photo.bytes),key=createHash('sha256').update(identity).update(digest).digest('hex'),file=path.join(root,key+'.json');
   let record;try{record=JSON.parse(await readFile(file,'utf8'));if(record.version!==FAST_PHOTO_VERSION||record.hash!==digest)record=null;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
   if(record)reused++;
   else{
    const sample=await inspectPhotoThumbnail(photo.bytes,kind);let label=false,text='',ocrFailed=false;
    if(sample.textCandidate){
     try{ocrCount++;text=await recognize(photo.bytes,sample);label=careLabelText(text);}catch(e){signal?.throwIfAborted();ocrFailed=true;log('라벨 자동 구분 확인 필요 · '+photo.name);}
    }
    // Dense text without a confirmed label must not become an apparel color.
    const colorResult=label||sample.textCandidate?null:resolveDraftPhotoColor({quantiles:sample.quantiles},product.colors,references);
    record={version:FAST_PHOTO_VERSION,hash:digest,color:colorResult?.color||'',careLabel:label,needsReview:!label,quantiles:sample.textCandidate?null:sample.quantiles,evidence:label?{basis:'사진의 제조·혼용·취급 문구 확인',text}: {basis:'축소 사진 중앙 표본과 현재 공식 색상칩 비교 · 자동 추정',textCandidate:sample.textCandidate},elapsedMs:Math.round(performance.now()-started)};
    if(!ocrFailed){const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(record));signal?.throwIfAborted();await rename(temp,file);}
   }
   results.push({...photo,color:record.color,role:record.careLabel?'care-label':'detail',automatic:true,needsReview:record.needsReview,evidence:record.evidence});samples.push({index:results.length-1,quantiles:record.quantiles,colorResult:{color:record.color}});
   log('사진 대조 '+results.length+'/'+photos.length+' · '+photo.name+(record.careLabel?' · 케어라벨 자동 구분':''));
  }
 }finally{signal?.removeEventListener('abort',abort);await worker?.terminate();}
 // Compare neutral shades within this batch only. Never transfer a style's
 // lighting correction to another style, and never mark this as reviewed.
 const neutral=product.colors.map((color,i)=>({color,reference:references[i]})).filter(r=>/블랙|검정|그레이|차콜|화이트/.test(r.color));
 const neutralRows=samples.filter(r=>r.quantiles&&neutral.some(n=>n.color===r.colorResult.color));
 refineNeutralDraftColors(neutralRows,neutral.map(r=>r.color),neutral.map(r=>r.reference));
 for(const row of neutralRows)if(row.colorResult.basis){results[row.index].color=row.colorResult.color;results[row.index].evidence={...results[row.index].evidence,brightnessBasis:row.colorResult.basis};}
 signal?.throwIfAborted();log('빠른 사진 초안 · '+photos.length+'장 · '+((performance.now()-started)/1000).toFixed(2)+'초 · 라벨 문구 확인 '+ocrCount+'장 · 재사용 '+reused+'장');
 return results;
}
