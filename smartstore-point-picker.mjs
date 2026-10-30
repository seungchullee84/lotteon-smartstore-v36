import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';
import {officialPointSource} from './smartstore-selling-point-review.mjs';
import {officialSellingPoints,usableSellingPoints} from './smartstore-selling-points.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const benefitTopics=[/부드|소프트|촉감|터치/,/편안|편하게|여유|넉넉/,/스타일링|코디|매치|레이어드/,/내구|오래\s*입/,/흡습|속건|통기|쾌적/,/보온|따뜻|포근/,/조절/,/수납|포켓/,/신축|유연|움직임/,/가벼|가볍|경량/,/수축|변형|워싱/];
const topics=point=>benefitTopics.flatMap((pattern,index)=>pattern.test(point.title+' '+point.description)?[index]:[]);
export async function pointPicker(product,folder,{dataRoot,sourceOverride}={}){
 const source=sourceOverride||await officialPointSource(product,folder,product.officialDescription||'',{dataRoot});
 const text=source.text,detailHash=source.detailHash||null;
 const identity={style:product.style,sourceUrl:product.sourceUrl,detailHash,textHash:hash(text)};
 const seed=[];
 for(const name of ['selling-point-candidates-reviewed.json','selling-point-image-review.json']){
  let reviewed;try{reviewed=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,name),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(reviewed?.style===product.style&&reviewed.sourceUrl===product.sourceUrl&&reviewed.detailHash===detailHash&&usableSellingPoints(reviewed.points,text))seed.push(...reviewed.points);
 }
 const pool=[];
 for(const p of seed)if(!pool.some(q=>q.title===p.title||q.description===p.description||q.evidence===p.evidence))pool.push(p);
 for(const p of officialSellingPoints(text,{limit:5})){
  if(pool.some(q=>q.title===p.title||q.description===p.description||q.evidence===p.evidence))continue;
  const kinds=topics(p),covered=new Set(pool.flatMap(topics));
  if(kinds.length&&kinds.every(kind=>covered.has(kind)))continue;
  pool.push(p);
 }
 const candidates=pool.slice(0,5).map(point=>({...point,id:hash(JSON.stringify(point)).slice(0,20)}));
 let selected;try{selected=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'selling-point-selection.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const valid=selected?.sourceUrl===product.sourceUrl&&selected.detailHash===detailHash&&(detailHash||selected.textHash===identity.textHash);
 const autoOmitted=candidates.length===0;
 const omit=selected?.sourceUrl===product.sourceUrl&&selected.omit===true||autoOmitted;
 const selectedIds=omit?[]:valid?candidates.filter(p=>selected.points.some(s=>s.title===p.title&&s.evidence===p.evidence)).map(p=>p.id):candidates.slice(0,4).map(p=>p.id);
 return {...identity,revision:hash(JSON.stringify([identity,candidates])),candidates,selectedIds,omit,autoOmitted,message:autoOmitted?'확인된 소구점이 없어 해당 구간을 자동 생략합니다.':candidates.length<4?'공식 근거로 확인한 후보 '+candidates.length+'개를 사용합니다.':'공식 근거 후보 중 최대 4개를 선택해 주세요.'};
}
export async function savePointSelection(product,folder,input,options){
 if(input.omit===true){
  if(input.channel!=='smartstore'||input.style!==product.style)throw Error('현재 스마트스토어 상품을 확인해 주세요.');
  const root=path.join(options.dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-selection.json'),temporary=file+'.'+randomUUID()+'.tmp';await mkdir(root,{recursive:true});
  const record={style:product.style,sourceUrl:product.sourceUrl,omit:true,points:[],method:'user-omitted-points',selectedAt:new Date().toISOString()};await writeFile(temporary,JSON.stringify(record,null,2));await rename(temporary,file);return record;
 }
 const current=await pointPicker(product,folder,options);
 if(input.channel!=='smartstore'||input.style!==product.style||input.revision!==current.revision)throw Error('상품 또는 소구점 원문이 변경됐습니다. 후보를 다시 열어 주세요.');
 const ids=input.selectedIds;if(!Array.isArray(ids)||ids.length<1||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!current.candidates.some(p=>p.id===id)))throw Error('공식 근거 후보에서 1~4개를 선택하거나 소구점 없이 만들기를 선택해 주세요.');
 const points=ids.map(id=>{const {id:_,...point}=current.candidates.find(p=>p.id===id);return point;});
 const root=path.join(options.dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-selection.json'),temporary=file+'.'+randomUUID()+'.tmp';await mkdir(root,{recursive:true});
 const record={style:product.style,sourceUrl:product.sourceUrl,detailHash:current.detailHash,textHash:current.textHash,points,method:'user-selected-official-points',selectedAt:new Date().toISOString()};await writeFile(temporary,JSON.stringify(record,null,2));await rename(temporary,file);return record;
}
