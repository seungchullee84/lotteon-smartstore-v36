import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {channelCategoryPath} from './category.mjs';
import {validateTemplateHeadline} from './smartstore-template-headline.mjs';

const strings=['name','gender','material','country','washing','manufactured','keywords','smartstoreName','templateHeadline'];
const categories=['commonMiddle','commonSmall','channelMiddle','channelSmall'];
const allowed=new Set([...strings,...categories,'consumerPrice','colors','sizes']);
export function validateProductEdits(record,expectedStyle=record?.style){
 if(!/^\d{6}$/.test(record?.style||'')||record.style!==expectedStyle)throw Error('수정 정보의 품번이 현재 상품과 다릅니다.');
 if(!record.fields||typeof record.fields!=='object'||Array.isArray(record.fields))throw Error('수정 항목을 확인해 주세요.');
 const fields={};
 for(const [key,value] of Object.entries(record.fields)){
  if(!allowed.has(key)||typeof value!=='string'||value.length>2000)throw Error('저장할 수 없는 수정 항목입니다: '+key);
  if(key==='consumerPrice'&&value!==''&&(!Number.isSafeInteger(Number(value))||Number(value)<0||Number(value)>100000000))throw Error('소비자가 수정값을 확인해 주세요.');
  fields[key]=key==='templateHeadline'?validateTemplateHeadline(value):value;
 }
 return {style:record.style,fields};
}
export function applyProductEdits(product,record){
 if(!record)return product;
 const {fields}=validateProductEdits(record,product.style);
 const result={...product,category:{...product.category},userEditedFields:{...fields}};
 for(const [key,value] of Object.entries(fields)){
  if(categories.includes(key))result.category[key]=value;
  else if(key==='colors'||key==='sizes')result[key]=value.split(',').map(s=>s.replace(/\s+/g,'')).filter(Boolean);
  else if(key==='consumerPrice')result[key]=value===''?'':Number(value);
  else result[key]=value;
 }
 if(Object.hasOwn(fields,'smartstoreName'))result.smartstoreNameUserEdited=true;
 if(['니트머플러','남성내의','머플러'].includes(result.category.channelSmall?.trim()))result.category=channelCategoryPath(result.category);
 return result;
}
export function createProductEditStore(dataRoot){
 const root=path.join(dataRoot,'product-edits');let writes=Promise.resolve();
 const file=style=>{validateProductEdits({style,fields:{}});return path.join(root,style+'.json');};
 async function read(style){try{return validateProductEdits(JSON.parse(await readFile(file(style),'utf8')),style);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 return {
  read,
  async apply(product){return applyProductEdits(product,await read(product.style));},
  save(record,expectedStyle){
   const clean=validateProductEdits(record,expectedStyle);
   const operation=writes.catch(()=>{}).then(async()=>{
    const old=await read(clean.style),merged={style:clean.style,fields:{...old?.fields,...clean.fields},updatedAt:new Date().toISOString()};
    await mkdir(root,{recursive:true});const target=file(clean.style);await writeFile(target+'.tmp',JSON.stringify(merged,null,2));await rename(target+'.tmp',target);return merged;
   });writes=operation;return operation;
  }
 };
}
