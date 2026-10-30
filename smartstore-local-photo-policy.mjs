export const LOCAL_PHOTO_POLICY='local-garment-ensemble-v2';
export function garmentKind(product){const text=(product.rawName||product.name||'')+' '+(product.sourceCategory||[]).join(' ');return /원피스|드레스|\bDRESS\b/i.test(text)?'dress':/스커트|\bSKIRT\b/i.test(text)?'skirt':/바지|팬츠|쇼츠|슬랙스|레깅스|\bPANTS\b|\bJEANS\b|\bSHORTS\b/i.test(text)?'pants':'upper';}
const terms=[['white',/아이보리|오프화이트|화이트|크림|백색/,/\b(?:white|ivory|cream|off-white)\b/i],['gray',/그레이|차콜|멜란지/,/\b(?:gray|grey|charcoal)\b/i],['black',/블랙|검정/,/\bblack\b/i],['blue',/블루|네이비|청색|인디고|데님/,/\b(?:blue|navy|indigo)\b/i],['brown',/브라운|카멜|베이지|초코|밤색/,/\b(?:brown|tan|beige|camel)\b/i],['pink',/핑크|로즈/,/\b(?:pink|rose)\b/i],['red',/레드|와인|버건디|체리/,/\b(?:red|burgundy|wine)\b/i],['green',/그린|카키|올리브|민트/,/\b(?:green|khaki|olive|mint)\b/i],['yellow',/옐로|머스타드/,/\b(?:yellow|mustard)\b/i],['purple',/퍼플|라벤더|라일락/,/\b(?:purple|lavender|lilac)\b/i],['orange',/오렌지|주황/,/\borange\b/i]];
export function englishColor(color){return terms.filter(([,re])=>re.test(color)).map(([name])=>name).join(' and ')+( /체크/.test(color)?' plaid':'');}
export function subjectColors(caption,kind='upper'){
 const sentences=String(caption||'').split(/[.!?]/);const noun=kind==='pants'?/\b(?:pants|jeans|trousers|shorts)\b/i:kind==='skirt'?/\bskirt\b/i:kind==='dress'?/\bdress\b/i:/\b(?:shirt|sweater|cardigan|jacket|coat|vest|hoodie|top)\b/i;
 for(const s of sentences){const match=s.match(noun);if(!match)continue;const prefix=s.slice(Math.max(0,match.index-65),match.index);if(/under|behind|row of|shelves|display behind/i.test(prefix))continue;const last=prefix.split(/\b(?:shirt|sweater|cardigan|jacket|coat|vest|hoodie|top|pants|jeans|trousers|shorts|skirt|dress)\b/i).at(-1);let found=terms.filter(([, ,re])=>re.test(last)).map(([name])=>name);if(!found.length&&/^\s*(?:is|has a)\b/i.test(s.slice(match.index+match[0].length))){const suffix=s.slice(match.index+match[0].length).split(/\b(?:pants|jeans|trousers|shirt|sweater|jacket|coat)\b/i)[0];found=terms.filter(([, ,re])=>re.test(suffix)).map(([name])=>name);}if(found.length)return found;}
 return [];
}
export function colorDistance(q,reference){
 const a=q.map(v=>v[1]),b=reference.map(v=>v[1]);const light=x=>x.reduce((s,n)=>s+n,0)/3,texture=x=>x.reduce((s,v)=>s+v[2]-v[0],0)/3;
 // Solid fabric acquires a broad brightness range under shop lighting;
 // plaid swatches retain useful contrast information about their pattern.
 const contrastWeight=texture(reference)>30?.5:.1;
 return Math.hypot((a[0]-a[1])-(b[0]-b[1]),(a[1]-a[2])-(b[1]-b[2]),contrastWeight*(texture(q)-texture(reference)),.12*(light(a)-light(b)));
}
export function resolvePhotoColor(raw,colors,references,kind){
 if(!raw.quantiles)return {supported:false,reason:'의류 영역 확인 필요'};
 const ranked=colors.map((color,i)=>({color,i,distance:references[i]?.quantiles?colorDistance(raw.quantiles,references[i].quantiles):Infinity})).sort((a,b)=>a.distance-b.distance);
 const families=subjectColors(raw.caption,kind),tokens=color=>terms.filter(([,re])=>re.test(color)).map(([name])=>name);
 const semantic=colors.map((color,i)=>{const t=tokens(color),overlap=t.filter(x=>families.includes(x)).length;return {color,i,score:overlap/(new Set([...t,...families]).size||1)};}).sort((a,b)=>b.score-a.score);
 const clip=raw.colorScores?.[0],clipColor=clip?.color,clipIndex=colors.indexOf(clipColor),median=raw.quantiles.map(v=>v[1]),brightness=median.reduce((s,v)=>s+v,0)/3;
 // A strong text/image match still needs garment-pixel support (background gray is insufficient).
 if(clip?.score>=.85&&clipIndex>=0&&references[clipIndex]?.quantiles&&Math.abs(brightness-references[clipIndex].quantiles.reduce((s,v)=>s+v[1],0)/3)<65)return {supported:true,color:clipColor,basis:'의류 영역·색상 후보 비교',distance:ranked.find(r=>r.i===clipIndex)?.distance};
 if(semantic[0]?.score>=.5&&semantic[0].score>(semantic[1]?.score||0))return {supported:true,color:semantic[0].color,basis:'의류 설명·공식 색상명 대조',distance:ranked.find(r=>r.i===semantic[0].i)?.distance};
 const best=ranked[0],second=ranked[1];
 if(!families.length&&/\b(?:woman|person|model)\b/i.test(raw.caption||'')&&!/mannequin/i.test(raw.caption||'')&&clip?.score>=.3&&clipColor!==best?.color)return {supported:false,color:best?.color,reason:'모델 착용컷의 색상 근거가 서로 다름'};
 if(best?.distance<=22&&(!second||second.distance-best.distance>=1.5))return {supported:true,color:best.color,basis:'의류 영역·공식 색상칩 대조',distance:best.distance};
 return {supported:false,color:best?.color,reason:'공식 색상칩 후보 간 차이 부족',distance:best?.distance};
}
export function decidePhotoRoles(rows){
 for(const r of rows){const care=r.roleScores?.find(x=>x.role==='care-label')?.score||0;if(care>=.8){r.role='care-label';r.supported=true;continue;}if(!r.colorResult?.supported){r.supported=false;continue;}
  r.supported=true;r.role='detail';
  if(r.binary?.role==='back'&&r.binary.relative>=.9&&r.coverage>=.1)r.role='back';
  const side=r.roleScores?.find(x=>x.role==='side')?.score||0,other=Math.max(...(r.roleScores||[]).filter(x=>x.role!=='side').map(x=>x.score));
  if(side>=.65&&side-other>=.25&&r.coverage>=.12)r.role='side';
  const front=r.roleScores?.find(x=>x.role==='front')?.score||0;
  r.frontQuality=r.role==='detail'&&r.binary?.role==='front'&&r.binary.relative>=.7&&front>=.35&&r.coverage>=.12&&r.coverage<=.8?r.binary.relative+.15*front+.2*(r.symmetry||0):-Infinity;
 }
 for(const color of new Set(rows.filter(r=>r.supported&&r.role!=='care-label').map(r=>r.colorResult.color))){const candidates=rows.filter(r=>r.colorResult?.color===color&&r.frontQuality>0).sort((a,b)=>b.frontQuality-a.frontQuality);if(candidates[0])candidates[0].role='front';for(const r of candidates)if(/^1(?:번)?\.(jpe?g|png|webp)$/i.test(r.name)&&r.binary.relative>=.85)r.role='front';}
 return rows;
}
