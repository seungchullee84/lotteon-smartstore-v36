import {normalizeCountry} from './country.mjs';
import sharp from 'sharp';
import {createWorker} from 'tesseract.js';
import {extractWashingIcons,iconWashingResult} from './washing-icons.mjs';
const materialNames='폴리에스터|폴리우레탄|금속성섬유|아크릴|레이온|나일론|캐시미어|리오셀|텐셀|비스코스|알파카|인조가죽|합성피혁|합성가죽|천연가죽|소가죽|양가죽|면|모|울|마|견';
const materialPart=/(겉감\s*표면|겉감\s*이면|겉감|안감|이면|충전재)\s*[:：]/;
function cleanMaterialInput(text){
 const value=String(text||'').normalize('NFKC').trim();
 if(!value||!/^[가-힣A-Za-z0-9 \t\r\n%,.;:/()·&+\-]+$/.test(value)||!/[가-힣A-Za-z]/.test(value))return '';
 return value.replace(/\s+/g,' ');
}
export function requireMaterialInput(text){
 const value=cleanMaterialInput(text);
 if(!value)throw Error('제품 소재에 읽을 수 없는 문자가 있거나 값이 비어 있습니다. 공식 상품정보고시를 대조해 소재를 수정해 주세요.');
 const ratios=[...value.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)];
 const parts=readMaterialParts(value);
 if(ratios.length!==value.split('%').length-1||ratios.some(match=>+match[1]<=0||+match[1]>100)||
    (parts&&!validMaterialTotals(parts)))throw Error('제품 소재 혼용률이 올바르지 않습니다. 공식 상품정보고시를 확인해 주세요.');
 return value;
}
export function verifiedOcrMaterial(text){
 const clean=cleanMaterialInput(text);
 if(!clean)return '';
 const composition=parseMaterialText(clean,{requirePercent:true});
 if(composition)return composition;
 return /^(?:천연가죽|합성가죽|소가죽|양가죽|인조가죽)(?:\s*\((?:소가죽|양가죽)\))?$/.test(clean)?clean:'';
}
export function correctOcrMaterialPercent(text){
 const raw=String(text||''),clean=cleanMaterialInput(raw);
 if(!clean||verifiedOcrMaterial(clean))return null;
 const corrections=[];
 const fiber=new RegExp('('+materialNames+')\\s*(\\d+(?:\\.\\d+)?)(\\s*%)?','g');
 const corrected=clean.replace(fiber,(match,name,number,percent)=>{
  // Only impossible percentages ending in OCR's common "96" reading of "%" qualify.
  // Genuine 96%, missing ordinary percentages, and arbitrary digits are never changed.
  if(percent||!/^\d{1,3}96$/.test(number)||Number(number)<=100)return match;
  const ratio=Number(number.slice(0,-2));
  if(ratio<=0||ratio>100)return match;
  corrections.push({fiber:name,from:number,to:ratio+'%'});
  return name+' '+ratio+'%';
 });
 const material=corrections.length?verifiedOcrMaterial(corrected):'';
 return material?{material,original:raw,corrections,basis:'소재 숫자 뒤 96→% 보정 · 각 부위 혼용률 합계 100%'}:null;
}
function readMaterialParts(text,{requirePercent=false}={}){
 const [unlabeled,...labeled]=text.replace(/\s+/g,' ').trim().split(materialPart);
 const parts=[];
 if(unlabeled)parts.push(['',unlabeled]);
 for(let i=0;i<labeled.length;i+=2)parts.push([labeled[i].replace(/\s+/g,''),labeled[i+1]]);
 const result=[];
 const fiber=new RegExp('('+materialNames+')\\s*(\\d+(?:\\.\\d+)?)(\\s*%)?','g');
 for(const [label,part] of parts){
  const fibers=[...part.matchAll(fiber)];
  const remainder=part.replace(fiber,'').replace(/[\s,;/]/g,'');
  if(remainder||!fibers.length||(requirePercent&&fibers.some(match=>!match[3])))return null;
  result.push({label,fibers});
 }
 return result.length?result:null;
}
function validMaterialTotals(parts){
 return parts.every(({fibers})=>{
  const ratios=fibers.map(match=>Number(match[2]));
  return ratios.every(ratio=>ratio>0&&ratio<=100)&&Math.abs(ratios.reduce((sum,ratio)=>sum+ratio,0)-100)<=.1;
 });
}
export function parseMaterialText(text,options){
 const parts=readMaterialParts(text,options);
 if(!parts||!validMaterialTotals(parts))return '';
 return parts.map(({label,fibers})=>(label?label+': ':'')+fibers.map(match=>match[1]+' '+match[2]+'%').join(', ')).join(' / ');
}
function readUnmarkedPureMaterial(text){
 const clean=cleanMaterialInput(text);
 if(!clean||clean.includes('%'))return '';
 const parts=readMaterialParts(clean);
 if(!parts?.every(({fibers})=>fibers.length===1&&fibers[0][2]==='100'))return '';
 return parseMaterialText(clean);
}
export function reviewMaterialOCR(text){
 const raw=String(text||'').trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join(' / ');
 const invalid=[...raw.matchAll(/\d+(?:\.\d+)?/g)].some(m=>Number(m[0])>100);
 const value=raw.replace(/\d+(?:\.\d+)?\s*%?/g,token=>Number(token.replace(/[%\s]/g,''))>100?'':token).replace(/\s+/g,' ').trim();
 return {value,corrected:false,needsReview:invalid};
}
export function parseWashing(text){
 const s=String(text||'').replace(/\s+/g,'').replace(/퓨백/g,'표백');const out=[];
 const dryForbidden=/드라이(?:클리닝|크리닝|크리닝세탁|클리닝세탁)?(?:불가|금지)|드라이세탁금지/.test(s);
 const handForbidden=/손세탁(?:불가|금지)/.test(s);
 const machineForbidden=/세탁기(?:사용)?(?:불가|금지)|기계세탁(?:불가|금지)/.test(s);
 if(/물세탁(?:불가|금지)/.test(s))out.push('물세탁 금지');
 else {
  if(machineForbidden)out.push('세탁기 사용 금지');
  else if(/세탁기(?:로)?약하게|약하게세탁/.test(s))out.push('세탁기로 약하게 세탁');
  if(handForbidden)out.push('손세탁 금지');
  else if(/손세탁/.test(s))out.push('손세탁');
 }
 if(dryForbidden)out.push('드라이클리닝 금지');
 else if(/드라이/.test(s))out.push(/석유/.test(s)?'석유계 드라이클리닝':'드라이클리닝');
 if(/표백제?금지|표백금지/.test(s))out.push('표백제 금지');
 if(/다림질(?:불가|금지)/.test(s))out.push('다림질 금지');
 else if(/천대고다림질/.test(s))out.push('천 대고 다림질'+(/80.*120/.test(s)?'(80~120℃)':''));
 if(/짜기금지|비틀어짜지/.test(s))out.push('짜기 금지');
 else if(/약하게짜기/.test(s))out.push('약하게 짜기');
 if(/뉘어서.*그늘|그늘.*뉘어/.test(s))out.push('뉘어서 그늘건조');
 if(/옷걸이.*그늘건조/.test(s))out.push('옷걸이에 걸어서 그늘건조');
 if(/건조기(?:사용)?(?:불가|금지)/.test(s))out.push('건조기 금지');
 return {value:out.join(', '),complete:out.length>=5&&out.some(x=>/세탁|드라이/.test(x))};
}
function wordsFromTSV(tsv){return tsv.trim().split('\n').slice(1).map(l=>{const c=l.split('\t');return {level:+c[0],left:+c[6],top:+c[7],width:+c[8],height:+c[9],text:c[11]||''};}).filter(x=>x.level===5);}
export async function analyzeNotice(file,log=()=>{},signal,options={}){
 signal?.throwIfAborted();
 let worker,aborted=false;
 const stop=()=>{aborted=true;if(worker)void worker.terminate().catch(()=>{});};
 const pending=analyzeNoticeWork(file,log,signal,options,created=>{worker=created;if(aborted)void worker.terminate().catch(()=>{});});
 if(!signal)return pending;
 let rejectAbort;
 const cancelled=new Promise((_,reject)=>{rejectAbort=()=>{stop();reject(signal.reason||new DOMException('Aborted','AbortError'));};});
 signal.addEventListener('abort',rejectAbort,{once:true});
 if(signal.aborted)rejectAbort();
 try{return await Promise.race([pending,cancelled]);}finally{signal.removeEventListener('abort',rejectAbort);}
}
async function analyzeNoticeWork(file,log,signal,options,onWorker){
 const src=sharp(file);const {width,height}=await src.metadata();const raw=await src.clone().greyscale().raw().toBuffer();
 const rules=[];for(let y=0;y<height;y++){let n=0;for(let x=Math.floor(width*.06);x<width*.94;x++)if(raw[y*width+x]<245)n++;if(n>width*.68&&(rules.length===0||y-rules.at(-1)>3))rules.push(y);}
 if(signal?.aborted)throw Error('사용자가 중단했습니다.');
 const worker=await (options.createWorker||createWorker)('kor+eng');onWorker(worker);signal?.throwIfAborted();
 const abort=()=>{void worker.terminate().catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();throw Error('사용자가 중단했습니다.');}
 try{
 const r=await worker.recognize(file,{}, {tsv:true});const words=wordsFromTSV(r.data.tsv);const result={ocrText:r.data.text,material:'',washing:'',fieldStatus:{}};
 const band=label=>{const hit=words.find(w=>w.left<width*.25&&label.test(w.text));if(!hit)return null;const cy=hit.top+hit.height/2;const top=rules.filter(y=>y<cy).at(-1);const bottom=rules.find(y=>y>cy);return top!==undefined&&bottom!==undefined?{left:Math.floor(width*.28),top:top+2,width:Math.floor(width*.66),height:bottom-top-4}:null;};
 const crop=async rect=>sharp(file).extract(rect).resize({width:rect.width*4}).png().toBuffer();
 let mat=band(/소재|소제/);
 if(!mat){
  const hit=words.find(w=>w.left>=width*.25&&w.top<height*.4&&/폴리에스터|폴리우레탄|나일론|레이온|아크릴|캐시미어|리오셀|텐셀|면/.test(w.text));
  if(hit){const cy=hit.top+hit.height/2,top=rules.filter(y=>y<cy).at(-1),bottom=rules.find(y=>y>cy);if(top!==undefined&&bottom!==undefined)mat={left:Math.floor(width*.28),top:top+2,width:Math.floor(width*.66),height:bottom-top-4};}
 }
 if(!mat){const styleLabel=words.find(w=>w.left<width*.25&&/^스타일/.test(w.text));if(styleLabel){const cy=styleLabel.top+styleLabel.height/2,top=rules.find(y=>y>cy),bottom=rules.find(y=>y>(top??height)+3);if(top!==undefined&&bottom!==undefined)mat={left:Math.floor(width*.28),top:top+2,width:Math.floor(width*.66),height:bottom-top-4};}}
 const originalRow=result.ocrText.match(/제품\s*소재[\s:：]*([\s\S]*?)(?=색\s*상|치\s*수|제조자)/)?.[1]?.trim()||'';
 const readings=[],corrections=[];
 const readMaterial=(text,source)=>{
  const direct=verifiedOcrMaterial(text),corrected=direct?null:correctOcrMaterialPercent(text);
  const material=direct||corrected?.material||'';
  if(material)readings.push(material);
  if(corrected)corrections.push({...corrected,source});
  return direct;
 };
 readMaterial(originalRow,'ocrText');
 if(mat){
  result.materialBand=mat;log('소재 행 확대·혼용률 재인식');
  result.materialOCR=(await worker.recognize(await crop(mat))).data.text;
  const enlarged=readMaterial(result.materialOCR,'materialOCR');
  if(!enlarged){
   log('소재 행 대비를 높여 문자·% 재대조');
   await worker.setParameters({tessedit_pageseg_mode:'6'});
   try{
    const contrast=await sharp(file).extract(mat).resize({width:mat.width*3}).threshold(150).png().toBuffer();
    result.materialRecheck=(await worker.recognize(contrast)).data.text;
    readMaterial(result.materialRecheck,'materialRecheck');
   }finally{await worker.setParameters({tessedit_pageseg_mode:'3'});}
  }
 }
 const candidates=[...new Set(readings)];
 result.material=candidates.length===1?candidates[0]:'';
 if(candidates.length>1)result.materialCandidates=candidates;
 const unmarked=readUnmarkedPureMaterial(originalRow);
 if(!candidates.length&&unmarked&&unmarked===readUnmarkedPureMaterial(result.materialOCR)&&
    unmarked===readUnmarkedPureMaterial(result.materialRecheck)){
  result.material=unmarked;
  result.materialUnmarked=true;
 }
 if(corrections.length)result.materialCorrections=corrections;
 result.fieldStatus.material=result.material?'공식 고시 OCR · 혼용률 형식 확인':'확인 필요 · 고시 원본의 소재·혼용률 대조';
 if(result.materialUnmarked)result.fieldStatus.material='공식 고시 OCR 일치 · 부위별 100을 100%로 표기';
 if(result.material&&corrections.some(item=>item.material===result.material))result.fieldStatus.material='OCR % 기호 보정 · 부위별 합계 100% 확인 · 원본 확인 권장';
 const countryBand=band(/제조국/);
 if(countryBand){
  log('제조국 행 확대·국가명 재인식');
  await worker.setParameters({tessedit_pageseg_mode:'7'});
  result.countryOCR=(await worker.recognize(await crop(countryBand))).data.text;
  result.country=normalizeCountry(result.countryOCR);
  result.fieldStatus.country=result.country?'자동 추출 · 원본 확인 권장':'확인 필요';
  await worker.setParameters({tessedit_pageseg_mode:'3'});
 }
 let wash=band(/^세탁|^세$/);if(!wash&&countryBand){const top=countryBand.top+countryBand.height+2;const bottom=rules.find(y=>y>top+3);if(bottom)wash={left:countryBand.left,top:top+2,width:countryBand.width,height:bottom-top-4};}if(wash){log('세탁 행 확대·설명 인식');result.washingOCR=(await worker.recognize(await crop(wash))).data.text;const parsed=parseWashing(result.washingOCR);result.washing=parsed.value;result.fieldStatus.washing=parsed.complete?'자동 추출 · 원본 확인 권장':'확인 필요';}
 if(wash){
  const extracted=await extractWashingIcons(file,wash);result.washingIcons=extracted.icons;
  const matched=iconWashingResult(extracted.icons);
  if(matched.complete){result.washing=matched.value;result.fieldStatus.washing='확인된 아이콘 저장자료 일치 · 설명 OCR 병행';}
  else result.fieldStatus.washing='설명 OCR 유지 · 미학습 아이콘 '+extracted.icons.filter(i=>!i.known).length+'개 확인 필요';
 }
 result.fieldStatus.material||=result.material?'자동 추출 · 원본 확인 권장':'확인 필요';result.fieldStatus.washing||='확인 필요';return result;
 }finally{signal?.removeEventListener('abort',abort);await worker.terminate().catch(()=>{});}
}
