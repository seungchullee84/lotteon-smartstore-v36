import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';
import {officialPointSource} from './smartstore-selling-point-review.mjs';
import {officialSellingPoints,usableSellingPoints} from './smartstore-selling-points.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function pointPicker(product,folder,{dataRoot,sourceOverride}={}){
 const source=sourceOverride||await officialPointSource(product,folder,product.officialDescription||'',{dataRoot});
 const text=source.text,detailHash=source.detailHash||null;
 const identity={style:product.style,sourceUrl:product.sourceUrl,detailHash,textHash:hash(text)};
 let reviewed;try{reviewed=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'selling-point-candidates-reviewed.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const seed=reviewed?.sourceUrl===product.sourceUrl&&reviewed.detailHash===detailHash&&usableSellingPoints(reviewed.points,text)?reviewed.points:[];
 const pool=[];for(const p of [...seed,...officialSellingPoints(text,{limit:5})])if(!pool.some(q=>q.title===p.title||q.description===p.description||q.evidence===p.evidence))pool.push(p);
 const candidates=pool.slice(0,5).map(point=>({...point,id:hash(JSON.stringify(point)).slice(0,20)}));
 let selected;try{selected=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'selling-point-selection.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const valid=selected?.sourceUrl===product.sourceUrl&&selected.detailHash===detailHash&&(detailHash||selected.textHash===identity.textHash);
 const omit=selected?.sourceUrl===product.sourceUrl&&selected.omit===true;
 const selectedIds=omit?[]:valid?candidates.filter(p=>selected.points.some(s=>s.title===p.title&&s.evidence===p.evidence)).map(p=>p.id):candidates.slice(0,4).map(p=>p.id);
 return {...identity,revision:hash(JSON.stringify([identity,candidates])),candidates,selectedIds,omit,message:candidates.length<4?'공식 근거로 확인한 후보 '+candidates.length+'개만 표시합니다.':'공식 근거 후보 중 3~4개를 선택해 주세요.'};
}
export async function savePointSelection(product,folder,input,options){
 if(input.omit===true){
  if(input.channel!=='smartstore'||input.style!==product.style)throw Error('현재 스마트스토어 상품을 확인해 주세요.');
  const root=path.join(options.dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-selection.json'),temporary=file+'.'+randomUUID()+'.tmp';await mkdir(root,{recursive:true});
  const record={style:product.style,sourceUrl:product.sourceUrl,omit:true,points:[],method:'user-omitted-points',selectedAt:new Date().toISOString()};await writeFile(temporary,JSON.stringify(record,null,2));await rename(temporary,file);return record;
 }
 const current=await pointPicker(product,folder,options);
 if(input.channel!=='smartstore'||input.style!==product.style||input.revision!==current.revision)throw Error('상품 또는 소구점 원문이 변경됐습니다. 후보를 다시 열어 주세요.');
 const ids=input.selectedIds;if(!Array.isArray(ids)||ids.length<3||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!current.candidates.some(p=>p.id===id)))throw Error('공식 근거 후보에서 3~4개를 선택해 주세요.');
 const points=ids.map(id=>{const {id:_,...point}=current.candidates.find(p=>p.id===id);return point;});
 const root=path.join(options.dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-selection.json'),temporary=file+'.'+randomUUID()+'.tmp';await mkdir(root,{recursive:true});
 const record={style:product.style,sourceUrl:product.sourceUrl,detailHash:current.detailHash,textHash:current.textHash,points,method:'user-selected-official-points',selectedAt:new Date().toISOString()};await writeFile(temporary,JSON.stringify(record,null,2));await rename(temporary,file);return record;
}
