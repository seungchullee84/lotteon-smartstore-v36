import {readFile,writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {englishColor,subjectColors,resolvePhotoColor,resolveDraftPhotoColor,refineNeutralDraftColors,decidePhotoRoles,LOCAL_PHOTO_POLICY} from './smartstore-local-photo-policy.mjs';
const job=JSON.parse(await readFile(process.argv[2],'utf8'));
const {pipeline,env,RawImage,Florence2ForConditionalGeneration,AutoProcessor}=await import(pathToFileURL(job.settings.transformersModule));
env.cacheDir=job.settings.cacheDir;env.allowRemoteModels=false;
const opts={session_options:{intraOpNumThreads:2,interOpNumThreads:1}},id='onnx-community/Florence-2-base-ft';
const clip=await pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{...opts,dtype:'q8'}),sig=job.colorOnly?null:await pipeline('zero-shot-image-classification','Xenova/siglip-base-patch16-224',{...opts,dtype:'fp32'}),seg=await pipeline('image-segmentation','Xenova/segformer_b0_clothes',{...opts,dtype:'q8'});
let captionModel,processor,fallbackSeg;
const roleLabels=['a front view of a mannequin wearing clothing','a back view of a mannequin wearing clothing','a side view of a mannequin wearing clothing','a close-up photo of clothing fabric, zipper or buttons','a photo of a clothing care label with printed text'],roles=['front','back','side','detail','care-label'];
const binaryLabels=['A photo of the front of clothing worn by a mannequin, front side visible.','A photo of the back of clothing worn by a mannequin, back side visible.'];
const colorLabels=job.colors.map(c=>'a photo of '+englishColor(c)+' clothing');
const rawRoot=path.join(job.settings.tempRoot,'garment-analysis',job.featureVersion||'seg-caption-q8-v2');await mkdir(rawRoot,{recursive:true});
const quantiles=(pixels,channels,mask)=>{const values=[[],[],[]];for(let i=0;i<pixels.length/channels;i++)if(!mask||mask[i])for(let c=0;c<3;c++)values[c].push(pixels[i*channels+c]);return values[0].length?values.map(v=>{v.sort((a,b)=>a-b);return [.2,.5,.8].map(p=>v[Math.floor(p*v.length)]);}):null;};
const references=[];for(const chip of job.colorChips||[]){if(!chip.file){references.push({color:chip.color,quantiles:null});continue;}const {data,info}=await sharp(chip.file).removeAlpha().raw().toBuffer({resolveWithObject:true});references.push({color:chip.color,quantiles:quantiles(data,info.channels)});}
const rows=[];
for(const photo of job.photos){const bytes=await readFile(photo.file),hash=createHash('sha256').update(bytes).digest('hex'),cache=path.join(rawRoot,hash+'-'+job.kind+'.json');let raw;try{raw=JSON.parse(await readFile(cache,'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(!raw){const {data,info}=await sharp(bytes).rotate().resize({width:job.colorOnly?384:640,height:job.colorOnly?576:960,fit:'inside',withoutEnlargement:true}).removeAlpha().raw().toBuffer({resolveWithObject:true}),image=new RawImage(data,info.width,info.height,info.channels),scores=await clip(image,roleLabels,{hypothesis_template:'{}'});
  raw={name:path.basename(photo.file),hash,roleScores:scores.map(x=>({role:roles[roleLabels.indexOf(x.label)],score:x.score}))};
  if((raw.roleScores.find(x=>x.role==='care-label')?.score||0)<.8){
   const segments=await seg(image),target=job.kind==='pants'?'Pants':job.kind==='skirt'?'Skirt':job.kind==='dress'?'Dress':'Upper-clothes',selected=segments.find(x=>x.label===target);
   if(selected){let count=0,left=info.width,right=0,top=info.height,bottom=0;for(let i=0;i<selected.mask.data.length;i++)if(selected.mask.data[i]){count++;const x=i%info.width,y=Math.floor(i/info.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}let intersection=0,union=0;for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const a=selected.mask.data[y*info.width+x]>0,b=selected.mask.data[y*info.width+left+right-x]>0;if(a&&b)intersection++;if(a||b)union++;}raw.coverage=count/(info.width*info.height);raw.symmetry=union?intersection/union:0;raw.quantiles=quantiles(data,info.channels,selected.mask.data);}
   if(!job.colorOnly){captionModel||=await Florence2ForConditionalGeneration.from_pretrained(id,{...opts,dtype:{vision_encoder:'q8',encoder_model:'q8',decoder_model_merged:'q8',embed_tokens:'q8'}});processor||=await AutoProcessor.from_pretrained(id);
   const task='<CAPTION>',inputs=await processor(image,processor.construct_prompts(task)),ids=await captionModel.generate({...inputs,max_new_tokens:32,num_beams:1,do_sample:false}),text=processor.batch_decode(ids,{skip_special_tokens:false})[0];raw.caption=processor.post_process_generation(text,task,image.size)[task];
   const b=await sig(image,binaryLabels,{hypothesis_template:'{}'}),logit=x=>Math.log(Math.max(x,1e-15)/(1-Math.min(x,1-1e-15)));raw.binary={role:b[0].label===binaryLabels[0]?'front':'back',relative:1/(1+Math.exp(-(logit(b[0].score)-logit(b[1].score))))};}
  }
  await writeFile(cache,JSON.stringify(raw));
 }
 // A long shirt's back may be labelled Dress by the segmenter. Recheck only
 // the tiny garment mask; captions and directions remain cached.
 if((!raw.coverage||raw.coverage<.1)&&raw.segmentationVersion!==4&&(raw.roleScores.find(x=>x.role==='care-label')?.score||0)<.8){
  fallbackSeg||=await pipeline('image-segmentation','Xenova/segformer_b2_clothes',{...opts,dtype:'q8'});
  const {data,info}=await sharp(bytes).rotate().resize({width:640,height:960,fit:'inside',withoutEnlargement:true}).removeAlpha().raw().toBuffer({resolveWithObject:true}),image=new RawImage(data,info.width,info.height,info.channels),segments=await fallbackSeg(image),candidates=segments.filter(x=>job.kind==='upper'?['Upper-clothes','Dress'].includes(x.label):x.label===(job.kind==='pants'?'Pants':job.kind==='skirt'?'Skirt':'Dress'));
  const selected=candidates.sort((a,b)=>b.mask.data.reduce((s,x)=>s+(x?1:0),0)-a.mask.data.reduce((s,x)=>s+(x?1:0),0))[0];
  if(selected){const count=selected.mask.data.reduce((s,x)=>s+(x?1:0),0);raw.coverage=count/(info.width*info.height);raw.quantiles=quantiles(data,info.channels,selected.mask.data);}raw.segmentationVersion=4;await writeFile(cache,JSON.stringify(raw));
 }
 if(!job.colorOnly&&!raw.detailedCaption&&!subjectColors(raw.caption,job.kind).length&&/\b(?:woman|person|model)\b/i.test(raw.caption||'')&&!/mannequin/i.test(raw.caption||'')){
  captionModel||=await Florence2ForConditionalGeneration.from_pretrained(id,{...opts,dtype:{vision_encoder:'q8',encoder_model:'q8',decoder_model_merged:'q8',embed_tokens:'q8'}});processor||=await AutoProcessor.from_pretrained(id);const image=await RawImage.read(photo.file),task='<DETAILED_CAPTION>',inputs=await processor(image,processor.construct_prompts(task)),ids=await captionModel.generate({...inputs,max_new_tokens:40,num_beams:1,do_sample:false}),text=processor.batch_decode(ids,{skip_special_tokens:false})[0];raw.detailedCaption=processor.post_process_generation(text,task,image.size)[task];await writeFile(cache,JSON.stringify(raw));
 }
 // Candidate colors are style-specific; never reuse another style's color decision.
 const scores=raw.quantiles&&!job.colorOnly?await clip(photo.file,colorLabels,{hypothesis_template:'{}'}):[];const row={...raw,caption:raw.detailedCaption||raw.caption,name:path.basename(photo.file),colorScores:scores.map(x=>({color:job.colors[colorLabels.indexOf(x.label)],score:x.score}))};row.colorResult=job.colorOnly?resolveDraftPhotoColor(row,job.colors,references):resolvePhotoColor(row,job.colors,references,job.kind);rows.push(row);
 console.log('사진 대조 '+rows.length+'/'+job.photos.length+' · '+row.name);
}
if(job.colorOnly)refineNeutralDraftColors(rows,job.colors,references);
decidePhotoRoles(rows);
await writeFile(process.argv[3],JSON.stringify(rows.map(r=>({method:LOCAL_PHOTO_POLICY,status:r.supported?'supported':'needs-review',role:r.role||'detail',color:r.role==='care-label'?'':r.colorResult?.color||'',evidence:{caption:r.caption,careScore:r.roleScores?.find(x=>x.role==='care-label')?.score,coverage:r.coverage,symmetry:r.symmetry,colorBasis:r.colorResult?.basis,colorDistance:r.colorResult?.distance,reason:r.colorResult?.reason,binary:r.binary},rawCache:path.join(rawRoot,r.hash+'-'+job.kind+'.json')}))));
