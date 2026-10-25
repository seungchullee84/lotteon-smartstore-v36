import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {createWorker} from 'tesseract.js';
import {isCareLabelPhoto,saveCareLabelSelection} from './smartstore-care-label.mjs';
import {chooseListingPhotos,saveListingSelection} from './smartstore-listing-images.mjs';
import {prepareSmartstoreDetail} from './smartstore-detail-files.mjs';
import {productSellingPoints} from './smartstore-detail.mjs';
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
 const known=new Map(mapped.map(p=>[hash(p.bytes),p]));let worker;
 const recognize=recognizePhoto||async bytes=>{
  worker||=await createWorker('kor+eng');signal?.throwIfAborted();
  await worker.setParameters({tessedit_pageseg_mode:'11'});
  return (await worker.recognize(await sharp(bytes).rotate().resize({width:1000,withoutEnlargement:true}).toBuffer())).data.text;
 };
 const reviewed=[];
 try{
  for(const p of photos){
   signal?.throwIfAborted();const prior=known.get(hash(p.bytes));
   if(prior){reviewed.push({...p,color:prior.color,role:prior.role});continue;}
   let label=isCareLabelPhoto(p,old);
   if(!label){
    const cache=path.join(dataRoot,'smartstore-photo-label-cache',hash(p.bytes)+'.json');let record;
    try{record=JSON.parse(await readFile(cache,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(record?.version===1&&typeof record.label==='boolean')label=record.label;
    else{label=careLabelText(await recognize(p.bytes));await mkdir(path.dirname(cache),{recursive:true});await writeFile(cache,JSON.stringify({version:1,label}));}
   }
   reviewed.push({...p,color:'',role:label?'care-label':'provided'});
  }
 }finally{await worker?.terminate();}
 signal?.throwIfAborted();
 const garments=reviewed.filter(p=>p.role!=='care-label'),main=garments.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name));
 if(main.length!==1)throw Error('현재 품번 폴더에 대표사진 1.jpg 또는 1번.jpg 한 장을 지정해 주세요.');
 let extras;
 if(product.colors.includes(main[0].color)){
  extras=chooseListingPhotos(garments.filter(p=>p.role!=='provided'),product).extras;
  extras=[...extras,...garments.filter(p=>p.role==='provided'&&p!==main[0])].slice(0,9);
 }else extras=garments.filter(p=>p!==main[0]).slice(0,9);
 const listingImages={...await saveListingSelection(root,{main:main[0],extras}),trustedFolder:true};
 const groups=[],providedPhotos=[],records=[];
 for(const p of reviewed){
  const digest=hash(p.bytes);records.push({name:p.name,hash:digest,color:p.color,role:p.role});
  if(p.role==='care-label')continue;
  const relative='trusted/'+digest+path.extname(p.name).toLowerCase();await writeFile(path.join(root,relative),p.bytes);
  if(p.color&&p.role!=='provided'){
   let group=groups.find(g=>g.color===p.color);if(!group){group={color:p.color,files:[]};groups.push(group);}
   group.files.push({file:relative,role:p.role,main:p===main[0]});
  }else providedPhotos.push(relative);
 }
 for(const g of groups)g.files=g.files.sort((a,b)=>Number(b.main)-Number(a.main)||['front','side','detail'].indexOf(a.role)-['front','side','detail'].indexOf(b.role)).map(p=>p.file);
 const previous=old?.sourceUrl===product.sourceUrl&&old?.officialDetailHash===detailHash?old:null;
 const points=previous?.sellingPoints?.length?previous.sellingPoints:productSellingPoints(product).filter(p=>!/^SIZE$|COLORS$|^PRODUCT$/.test(p.title)).map(p=>({...p,evidence:description+' / '+product.sourceUrl}));
 const draft={style:product.style,sourceUrl:product.sourceUrl,headline:previous?.headline||product.name,officialDetailHash:detailHash,photos:groups,providedPhotos,listingImages,careLabels:await saveCareLabelSelection(root,reviewed.filter(p=>p.role==='care-label')),sellingPoints:points,officialPhotos:previous?.officialPhotos,trustedFolder:true,photoMapping:{basis:'사용자 지시: 현재 품번 폴더 사진 신뢰 · 미확인 색상·각도는 임의 지정하지 않음',files:records},preparedAt:new Date().toISOString()};
 await writeFile(path.join(root,'draft.json'),JSON.stringify(draft,null,2));
 log('품번 폴더 사진 적용 · 대표 1장 · 추가 '+extras.length+'장 · 상세 '+garments.length+'장 · 케어라벨 '+reviewed.filter(p=>p.role==='care-label').length+'장 · 외부 사진분석 없이 진행');
 return prepareSmartstoreDetail({...product,officialDescription:description},folder,{dataRoot});
}
