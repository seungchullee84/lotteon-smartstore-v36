import {readFileSync} from 'node:fs';
import {allLotteStandardPaths,LOTTE_ACCESSORY_COMMON_PATHS,sameCategoryLabel} from './lotte-category-validation.mjs';

const read=name=>JSON.parse(readFileSync(new URL('./data/'+name,import.meta.url),'utf8'));
const defaults=()=>({common:read('category-catalog-common.json'),standard:read('category-catalog-standard.json')});
const node=text=>{const match=String(text).match(/^([A-Z0-9]+)\s*[:：]\s*(.+)$/i);if(!match)throw Error('분류 목록의 코드와 이름을 확인해 주세요.');return {code:match[1],name:match[2]};};
const commonKeys=['commonMajor','commonMiddle','commonSmall'];
const channelKeys=['channelMajor','channelMiddle','channelSmall','channelDetail'];
const levels=['major','middle','small','detail'];
const full=n=>n.code+' : '+n.name;
function commonPaths(common){
 return [...(common?.genders||[]).flatMap(g=>(g.middles||[]).flatMap(m=>(m.children||[]).map(s=>[g.major,m.middle,s]))),...LOTTE_ACCESSORY_COMMON_PATHS].map(p=>p.map(node));
}
export function lotteCategoryChoices({common,standard}=defaults()){
 const roots=[];
 for(const path of commonPaths(common)){
  let siblings=roots;
  for(const [index,item] of path.entries()){
   let value=siblings.find(n=>n.code===item.code);
   if(!value){value={...item,children:[]};siblings.push(value);}
   if(index<2)siblings=value.children;
  }
 }
 const channel=(standard?.majors||[]).map(m=>({code:m.code,name:m.name,children:(m.middles||[]).map(n=>({code:n.code,name:n.name,children:(n.smalls||[]).map(s=>({code:s.code,name:s.name,children:(s.details||[]).map(d=>({code:d.code,name:d.name,children:[]}))}))}))}));
 return {version:1,common:roots,channel,catalogDate:standard?.completedAt||standard?.collectedAt||'',scope:'저장된 성인 남녀 의류와 확인된 잡화 목록'};
}
export function createManualLotteCategory(product,choice,{common,standard}=defaults()){
 const first=commonPaths(common).filter(p=>p.every((n,i)=>n.code===choice?.common?.[i]));
 const second=allLotteStandardPaths(standard).filter(p=>levels.every((level,i)=>String(p[level]?.code||'')===String(choice?.channel?.[i]||'')));
 if(first.length!==1)throw Error('1차 대·중·소분류를 같은 경로에서 모두 선택해 주세요.');
 if(second.length!==1)throw Error('2차 대·중·소·세분류를 같은 경로에서 끝까지 선택해 주세요.');
 const category={...Object.fromEntries(commonKeys.map((key,i)=>[key,full(first[0][i])])),...Object.fromEntries(channelKeys.map((key,i)=>[key,second[0][levels[i]]?.name||''])),channelCodes:Object.fromEntries(levels.map(level=>[level,second[0][level]?.code||'']))};
 const selection={version:1,style:product.style,sourceUrl:product.sourceUrl||'',gender:product.gender,category};
 return {...category,manualSelection:selection};
}
export function readManualLotteCategory(product,selection=product.category?.manualSelection,{checkCurrent=true,...catalogs}={}){
 if(!selection)return null;
 if(selection.version!==1||selection.style!==product.style||selection.sourceUrl!==(product.sourceUrl||'')||selection.gender!==product.gender)throw Error('직접 선택한 분류의 품번·공식 주소·성별이 바뀌었습니다. 분류를 다시 선택해 주세요.');
 const selected=selection.category||{};
 let common;
 try{common=commonKeys.map(key=>node(selected[key]).code);}catch{throw Error('직접 선택한 1차 분류를 다시 확인해 주세요.');}
 const category=createManualLotteCategory(product,{common,channel:levels.map(level=>selected.channelCodes?.[level]||'')},Object.keys(catalogs).length?catalogs:undefined);
 for(const key of [...commonKeys,...channelKeys]){
  const wanted=category[key],saved=selected[key]||'';
  if(wanted?saved!==wanted:!!saved)throw Error('직접 선택한 분류의 이름과 코드가 일치하지 않습니다. 다시 선택해 주세요.');
  if(checkCurrent&&!sameCategoryLabel(product.category?.[key]||'',wanted))throw Error('직접 선택한 분류와 현재 입력값이 달라졌습니다. 분류를 다시 선택해 주세요.');
 }
 if(checkCurrent&&levels.some(level=>String(product.category?.channelCodes?.[level]||'')!==category.channelCodes[level]))throw Error('직접 선택한 분류 코드가 변경됐습니다. 분류를 다시 선택해 주세요.');
 return {...product.category,...category};
}
export async function saveManualLotteCategory({getState,editStore,product,category}){
 const captured=getState();
 if(captured.busy||!captured.product||captured.product.style!==product.style||captured.product.sourceUrl!==product.sourceUrl)throw Error('현재 상품과 작업 상태가 바뀌었습니다. 분류를 다시 열어 주세요.');
 const checked=readManualLotteCategory({...product,category});
 if(!checked)throw Error('직접 선택한 분류가 없습니다.');
 const fields={lotteCategorySelection:JSON.stringify(checked.manualSelection),gender:product.gender,...Object.fromEntries(['commonMiddle','commonSmall','channelMiddle','channelSmall'].map(key=>[key,checked[key]]))};
 await editStore.save({style:product.style,fields},product.style);
 const current=getState();
 if(current.product!==captured.product||current.folder!==captured.folder||current.busy)throw Error('상품 또는 작업 상태가 바뀌어 화면에 적용하지 않았습니다. 현재 상품에서 다시 확인해 주세요.');
 return {...captured.product,gender:product.gender,category:checked,userEditedFields:{...captured.product.userEditedFields,...fields}};
}
