import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {createWorker} from 'tesseract.js';
import {isCareLabelPhoto,saveCareLabelSelection} from './smartstore-care-label.mjs';
import {chooseListingPhotos,saveListingSelection} from './smartstore-listing-images.mjs';
import {prepareSmartstoreDetail} from './smartstore-detail-files.mjs';
import {officialSellingPoints,usableSellingPoints} from './smartstore-selling-points.mjs';
import {importedPhotoSelection} from './smartstore-imported-selection.mjs';
import {savePhotoMappings} from './smartstore-photo-mapping-cache.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function careLabelText(text){
 const words=['제조국','제조연월','혼용률','취급주의','관리번호','LOT','MADE IN','폴리에스터','소비자상담'];
 const compact=String(text||'').replace(/\s+/g,'').toUpperCase();
 return words.filter(word=>compact.includes(word.replace(/\s+/g,'').toUpperCase())).length>=3;
}
// The style folder is user-authoritative. Unknown color/angle stays unlabelled;
// local OCR separates care labels without requiring a remote image-analysis key.
export async function prepareTrustedFolder(product,folder,{dataRoot,photos,mapped=[],old,description,detailHash,signal,log=()=>{},recognizePhoto}={}){
 const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(path.join(root,'trusted'),{recursive:true});
 const known=new Map(mapped.map(p=>[p.name+'|'+hash(p.bytes),p]));let worker;
 const recognize=recognizePhoto||(async bytes=>{
  worker||=await createWorker('kor+eng');signal?.throwIfAborted();
  await worker.setParameters({tessedit_pageseg_mode:'11'});
  return (await worker.recognize(await sharp(bytes).rotate().resize({width:1000,withoutEnlargement:true}).toBuffer())).data.text;
 });
 const reviewed=[];
 try{
  for(const p of photos){
   signal?.throwIfAborted();const digest=hash(p.bytes),matches=mapped.filter(m=>hash(m.bytes)===digest),mappedPrior=known.get(p.name+'|'+digest)||(matches.length===1?matches[0]:undefined);const prior=mappedPrior?.reviewed===true?mappedPrior:old?.photoMapping?.files?.find(r=>r.name===p.name&&r.hash===digest&&r.role!=='provided')||mappedPrior;
   let cachedLabel=false;
   try{const cached=JSON.parse(await readFile(path.join(dataRoot,'smartstore-photo-label-cache',digest+'.json'),'utf8'));cachedLabel=cached?.version===1&&cached.label===true;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
   if(cachedLabel||isCareLabelPhoto(p,old)){reviewed.push({...p,color:'',role:'care-label'});continue;}
   if(prior&&prior.role!=='provided'&&!prior.automatic){const code=prior.source==='seller-detail'&&p.name.match(/^기존상품_(\d{2})_/)?.[1];const color=code&&product.colors.find(c=>c.startsWith(code));reviewed.push({...p,color:color||prior.color,role:prior.role,...(prior.reviewed===true?{reviewed:true,reviewedAt:prior.reviewedAt,reviewBasis:prior.reviewBasis,reviewedBy:prior.reviewedBy}:{})});continue;}
   const parent=path.basename(path.dirname(p.file)).replace(/\s+/g,'').toLowerCase();
   const folderColor=product.colors.find(color=>[color.replace(/\s+/g,'').toLowerCase(),color.replace(/^\d+/,'').replace(/\s+/g,'').toLowerCase()].includes(parent));
   let label=isCareLabelPhoto(p,old);
   if(!label){
    const cache=path.join(dataRoot,'smartstore-photo-label-cache',hash(p.bytes)+'.json');let record;
    try{record=JSON.parse(await readFile(cache,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(record?.version===1&&typeof record.label==='boolean')label=record.label;
    else{try{label=careLabelText(await recognize(p.bytes));await mkdir(path.dirname(cache),{recursive:true});await writeFile(cache,JSON.stringify({version:1,label}));}catch(error){signal?.throwIfAborted();log('라벨 문구 인식은 생략하고 제공 사진으로 연결합니다: '+p.name);}}
   }
   reviewed.push({...p,color:label?'':prior?.automatic?prior.color:folderColor||'',role:label?'care-label':prior?.automatic?prior.role:folderColor?'detail':'provided'});
  }
 }finally{await worker?.terminate();}
 signal?.throwIfAborted();
 const imported=null; // Every current folder file is authoritative.
 const active=p=>!imported||imported.get(p.color)?.includes(hash(p.bytes));
 const garments=reviewed.filter(p=>p.role!=='care-label'),main=garments.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name));
 if(main.length!==1)throw Error('현재 품번 폴더에 대표사진 1.jpg 또는 1번.jpg 한 장을 지정해 주세요.');
 let extras;
 if(product.colors.includes(main[0].color)){
  const frontColors=new Set(garments.filter(p=>p.role==='front').map(p=>p.color));frontColors.add(main[0].color);
  extras=chooseListingPhotos(garments.filter(p=>(p===main[0]||active(p))&&p.role!=='provided'&&frontColors.has(p.color)),product).extras;
 }else extras=[];
 const listingImages={...await saveListingSelection(root,{main:main[0],extras}),trustedFolder:true};
 const groups=[],providedPhotos=[],records=[];
 const roleOrder=['front','side','detail','back','provided','care-label'];
 const detailPhotos=[...reviewed].sort((a,b)=>Number(/^1(?:번)?\./i.test(b.name))-Number(/^1(?:번)?\./i.test(a.name))||roleOrder.indexOf(a.role)-roleOrder.indexOf(b.role));
 for(const p of detailPhotos){
  const digest=hash(p.bytes),prior=old?.photoMapping?.files?.find(r=>r.name===p.name&&r.hash===digest);records.push({...prior,name:p.name,hash:digest,color:p.color,role:p.role,...(p.reviewed===true?{reviewed:true,reviewedAt:p.reviewedAt,reviewBasis:p.reviewBasis,reviewedBy:p.reviewedBy}:{})});
  if(p.role==='care-label')continue;
  if(!active(p))continue;
  const relative='trusted/'+hash(Buffer.from(p.name+'|'+digest))+path.extname(p.name).toLowerCase();await writeFile(path.join(root,relative),p.bytes);
  if(p.color&&p.role!=='provided'){
   let group=groups.find(g=>g.color===p.color);if(!group){group={color:p.color,files:[]};groups.push(group);}
   group.files.push({file:relative,role:p.role,main:p===main[0],hash:digest});
  }else providedPhotos.push(relative);
 }
 for(const g of groups){const imported=old?.importedColorPhotos?.find(p=>p.color===g.color)?.hashes||[],rank=p=>{const i=imported.indexOf(p.hash);return i<0?100:i;};const front=g.files.find(p=>p.main)||g.files.find(p=>p.role==='front');g.files=g.files.sort((a,b)=>rank(a)-rank(b)||Number(b===front)-Number(a===front)||['side','detail','back','front'].indexOf(a.role)-['side','detail','back','front'].indexOf(b.role)).map(p=>p.file);}
 const previous=old?.sourceUrl===product.sourceUrl&&old?.officialDetailHash===detailHash?old:null;
 const officialPoints=officialSellingPoints(description);
 const points=usableSellingPoints(previous?.sellingPoints,description)&&previous.sellingPoints.length>=officialPoints.length?previous.sellingPoints:officialPoints;
 const draft={style:product.style,sourceUrl:product.sourceUrl,headline:previous?.headline||product.name,officialDetailHash:detailHash,photos:groups,importedMainPhoto:old?.importedMainPhoto,importedColorPhotos:old?.importedColorPhotos,unmatchedPhotos:providedPhotos,listingImages,careLabels:await saveCareLabelSelection(root,reviewed.filter(p=>p.role==='care-label')),sellingPoints:points,officialPhotos:previous?.officialPhotos,trustedFolder:true,acceptAllFolderPhotos:true,photoMapping:{basis:'사용자 지시: 현재 품번 폴더 사진 신뢰 · 미확인 색상·각도는 임의 지정하지 않음',files:records,ignoredPhotos:old?.style===product.style&&old?.sourceUrl===product.sourceUrl?old.photoMapping?.ignoredPhotos||[]:[]},preparedAt:new Date().toISOString()};
 if(old?.style===product.style&&old?.sourceUrl===product.sourceUrl&&Array.isArray(old.editedPhotoReplacements))draft.editedPhotoReplacements=old.editedPhotoReplacements;
 if(old?.style===product.style&&old?.sourceUrl===product.sourceUrl&&Array.isArray(old.officialPaletteFronts))draft.officialPaletteFronts=old.officialPaletteFronts;
 await writeFile(path.join(root,'draft.json'),JSON.stringify(draft,null,2));
 await savePhotoMappings(dataRoot,product,records);
 log('품번 폴더 사진 적용 · 대표 1장 · 폴더 추가 '+extras.length+'장 · 상세 '+(groups.reduce((n,g)=>n+g.files.length,0)+providedPhotos.length)+'장 · 색상 미확인 '+providedPhotos.length+'장(모두 반영) · 케어라벨 '+reviewed.filter(p=>p.role==='care-label').length+'장 · 외부 사진분석 없이 진행');
 return prepareSmartstoreDetail({...product,officialDescription:description},folder,{dataRoot,photoRoots:[...new Set(photos.map(p=>path.dirname(p.file)))]});
}
