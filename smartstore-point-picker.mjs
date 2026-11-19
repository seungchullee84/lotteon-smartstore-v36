import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';
import {officialPointSource} from './smartstore-selling-point-review.mjs';
import {completeSellingPoints,officialSellingPoints,usableSellingPoints,displaySellingPoints,assertSellingPointDisplay} from './smartstore-selling-points.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const benefitTopics=[/부드|소프트|촉감|터치/,/편안|(?<!간)편하게|여유|넉넉/,/스타일링|코디|매치|레이어드/,/내구|오래\s*입/,/흡습|속건|통기|쾌적/,/보온|따뜻|포근/,/조절/,/수납|포켓/,/신축|유연|움직임/,/가벼|가볍|경량/,/수축|변형|워싱/];
const topics=point=>benefitTopics.flatMap((pattern,index)=>pattern.test(point.title+' '+point.description)?[index]:[]);
async function appliedPointSelection(product,identity,text,dataRoot){
 const matches=record=>record?.style===identity.style&&record.sourceUrl===identity.sourceUrl&&record.detailHash===identity.detailHash&&(identity.detailHash||record.textHash===identity.textHash);
 const usable=points=>Array.isArray(points)&&points.length>=2&&points.length<=4&&usableSellingPoints(points,text);
 const detail=product.smartstoreDetail;
 if(detail?.style===identity.style&&detail.sourceUrl===identity.sourceUrl&&matches(detail.sellingPointSource)&&usable(detail.sellingPoints))return detail.sellingPoints;
 const root=path.join(dataRoot,'smartstore-details',identity.style);
 const read=async name=>{try{return JSON.parse(await readFile(path.join(root,name),'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}};
 const review=await read('selling-point-review.json');
 if(review?.status==='ready'&&matches(review)&&usable(review.points))return review.points;
 const draft=await read('draft.json');
 if(identity.detailHash&&matches({...draft,detailHash:draft?.officialDetailHash})&&usable(draft?.sellingPoints))return draft.sellingPoints;
 return null;
}
export async function pointPicker(product,folder,{dataRoot,sourceOverride}={}){
 const source=sourceOverride||await officialPointSource(product,folder,product.officialDescription||'',{dataRoot});
 const text=source.text,detailHash=source.detailHash||null;
 const identity={style:product.style,sourceUrl:product.sourceUrl,detailHash,textHash:hash(text)};
 let selected;try{selected=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'selling-point-selection.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const valid=selected?.style===product.style&&selected.sourceUrl===product.sourceUrl&&selected.detailHash===detailHash&&(detailHash||selected.textHash===identity.textHash)&&usableSellingPoints(selected.points,text);
 const applied=await appliedPointSelection(product,identity,text,dataRoot);
 const seed=[];
 if(valid)seed.push(...selected.points);
 if(applied)seed.push(...applied);
 for(const name of ['selling-point-candidates-reviewed.json','selling-point-image-review.json']){
  let reviewed;try{reviewed=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,name),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(reviewed?.style===product.style&&reviewed.sourceUrl===product.sourceUrl&&reviewed.detailHash===detailHash&&usableSellingPoints(reviewed.points,text))seed.push(...reviewed.points);
 }
 const ready=point=>displaySellingPoints([point]).length===1;
 const defaults=valid&&selected.points.length>=2?selected.points:!valid&&applied?.every(ready)?applied:completeSellingPoints(seed,text);
 const pool=[...defaults];
 for(const p of seed.filter(ready))if(!pool.some(q=>q.title===p.title||q.description===p.description))pool.push(p);
 for(const p of officialSellingPoints(text,{limit:5})){
  if(!ready(p)||pool.some(q=>q.title===p.title||q.description===p.description))continue;
  const kinds=topics(p),covered=new Set(seed.flatMap(topics));
  if(kinds.length&&kinds.every(kind=>covered.has(kind)))continue;
  pool.push(p);
 }
 const candidates=pool.slice(0,5).map(point=>{const display=displaySellingPoints([point])[0];return {...point,id:hash(JSON.stringify(point)).slice(0,20),displayDescription:display?.description||'',displayReady:!!display};});
 const selectedIds=candidates.slice(0,defaults.length).map(p=>p.id);
 return {...identity,revision:hash(JSON.stringify([identity,candidates])),candidates,selectedIds,omit:false,autoOmitted:false,message:candidates.length<2?'공식 상품 설명·상세이미지에서 구매 장점 2~4개를 확인합니다.':'공식 근거 후보 중 서로 다른 구매 장점 2~4개를 선택해 주세요.'};
}
export async function savePointSelection(product,folder,input,options){
 if(input.omit===true)throw Error('두 템플릿 모두 공식 근거 구매 장점 2~4개를 사용합니다. 소구점을 생략할 수 없습니다.');
 const current=await pointPicker(product,folder,options);
 if(input.channel!=='smartstore'||input.style!==product.style||input.revision!==current.revision)throw Error('상품 또는 소구점 원문이 변경됐습니다. 후보를 다시 열어 주세요.');
 const ids=input.selectedIds;if(!Array.isArray(ids)||ids.length<2||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!current.candidates.some(p=>p.id===id)))throw Error('공식 근거 후보에서 서로 다른 구매 장점 2~4개를 선택해 주세요.');
 const chosen=ids.map(id=>{const {id:_,displayDescription:__,displayReady:___,...point}=current.candidates.find(p=>p.id===id);return point;});
 const points=[...chosen];
 assertSellingPointDisplay(points);
 const root=path.join(options.dataRoot,'smartstore-details',product.style),file=path.join(root,'selling-point-selection.json'),temporary=file+'.'+randomUUID()+'.tmp';await mkdir(root,{recursive:true});
 const record={style:product.style,sourceUrl:product.sourceUrl,detailHash:current.detailHash,textHash:current.textHash,points,method:'user-selected-official-points',selectedAt:new Date().toISOString()};await writeFile(temporary,JSON.stringify(record,null,2));await rename(temporary,file);return record;
}
