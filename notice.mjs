import {normalizeCountry} from './country.mjs';
import sharp from 'sharp';
import {createWorker} from 'tesseract.js';
import {extractWashingIcons,iconWashingResult} from './washing-icons.mjs';
export function parseMaterialText(text){
 const clean=text.replace(/\s+/g,' ').trim();
 const parts=clean.split(/(?=(?:겉감표면|겉감이면|겉감|안감|이면|충전재)\s*[:：])/).filter(Boolean);
 const output=[];
 for(const part of parts){
  const label=part.match(/^(겉감표면|겉감이면|겉감|안감|이면|충전재)\s*[:：]/)?.[1];
  const pattern=/(폴리에스터|폴리우레탄|아크릴|레이온|나일론|캐시미어|리오셀|텐셀|비스코스|알파카|면|모|울|마|견)\s*(\d+(?:\.\d+)?)\s*%?/g;
  const matches=[...part.matchAll(pattern)];
  const remainder=part.replace(/^(겉감표면|겉감이면|겉감|안감|이면|충전재)\s*[:：]/,'').replace(pattern,'').replace(/[\s,;/]/g,'');
  if(remainder)return '';
  if(!matches.length||Math.abs(matches.reduce((s,m)=>s+Number(m[2]),0)-100)>.1)return '';
  if(matches.some(m=>Number(m[2])<=0||Number(m[2])>100))return '';
  output.push((label?label+': ':'')+matches.map(m=>m[1]+' '+m[2]+'%').join(', '));
 }
 return output.join(' / ');
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
export async function analyzeNotice(file,log=()=>{},signal){
 const src=sharp(file);const {width,height}=await src.metadata();const raw=await src.clone().greyscale().raw().toBuffer();
 const rules=[];for(let y=0;y<height;y++){let n=0;for(let x=Math.floor(width*.06);x<width*.94;x++)if(raw[y*width+x]<245)n++;if(n>width*.68&&(rules.length===0||y-rules.at(-1)>3))rules.push(y);}
 if(signal?.aborted)throw Error('사용자가 중단했습니다.');
 const worker=await createWorker('kor+eng');let numeric;
 const abort=()=>{void worker.terminate().catch(()=>{});if(numeric)void numeric.terminate().catch(()=>{});};
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
 if(mat){result.materialBand=mat;log('소재 행 확대·혼용률 재인식');const m=(await worker.recognize(await crop(mat))).data.text;result.materialOCR=m;
 // Preserve the enlarged row transcription, including uncertain percentages, for review.
 let reviewed=reviewMaterialOCR(m);
 if(reviewed.needsReview){
  const originalRow=result.ocrText.match(/제품\s*소재\s*([\s\S]*?)(?=색\s*상)/)?.[1]?.trim()||'';
  const fallback=reviewMaterialOCR(originalRow);
  if(!fallback.needsReview&&parseMaterialText(originalRow)){reviewed=fallback;result.materialRecheck=originalRow;}
 }
 result.material=reviewed.value;
 result.fieldStatus.material=reviewed.corrected?'% 오인식 보정 · 혼용률 대조 · 원본 확인 필요':reviewed.needsReview?'101 이상 숫자 제외 · 혼용률 원본 확인 필요':result.material?'확대 인식 원문 · 원본 확인 필요':'확인 필요';
 }
 if(!mat){
  const beforeColor=result.ocrText.split(/색\s*상/)[0];
  for(const line of beforeColor.split(/\r?\n/)){
   const index=line.search(/폴리에스터|폴리우레탄|나일론|레이온|아크릴|캐시미어|리오셀|텐셀|면/);
   if(index<0)continue;const candidate=line.slice(index).trim();
   if(parseMaterialText(candidate)){result.material=reviewMaterialOCR(candidate).value;result.materialOCR=candidate;result.fieldStatus.material='소재 제목 인식 실패 · 정상 소재 원문에서 추출 · 원본 확인 필요';break;}
  }
 }
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
 }finally{signal?.removeEventListener('abort',abort);await worker.terminate().catch(()=>{});if(numeric)await numeric.terminate().catch(()=>{});}
}
