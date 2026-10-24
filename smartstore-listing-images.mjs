import {readFile,writeFile,mkdir,realpath,access} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {decorateMainImage} from './color-chips.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function chooseListingPhotos(photos,product){
 const main=photos.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name||''));
 if(main.length!==1)throw Error('품번 폴더에서 대표로 사용할 사진 한 장의 파일명을 1.jpg 또는 1번.jpg로 지정해 주세요.');
 const selected=main[0],same=p=>hash(p.bytes)===hash(selected.bytes);
 const side=photos.find(p=>p.color===selected.color&&p.role==='side'&&!same(p));
 if(!side)throw Error('대표 색상의 옆면 사진이 필요합니다. 품번 폴더에 사진을 추가해 주세요.');
 const extras=[side];
 for(const color of product.colors.filter(color=>color!==selected.color&&photos.some(p=>p.color===color))){const front=photos.find(p=>p.color===color&&p.role==='front'&&!same(p));if(!front)throw Error(color+' 정면 사진이 필요합니다.');extras.push(front);}
 if(extras.length>9)throw Error('스마트스토어 추가이미지는 9장까지 구성할 수 있습니다. 사용할 색상 사진을 정리해 주세요.');
 return {main:selected,extras};
}
export async function saveListingSelection(root,selection){
 await mkdir(path.join(root,'listing'),{recursive:true});
 const save=async(p,name)=>{const file='listing/'+name+'.jpg';await writeFile(path.join(root,file),await sharp(p.bytes).rotate().jpeg({quality:98}).toBuffer());return {file,color:p.color,role:p.role,sourceName:p.name};};
 return {main:await save(selection.main,'main'),extras:await Promise.all(selection.extras.map((p,i)=>save(p,'extra-'+(i+1))))};
}
export async function listingManifest(product,{dataRoot}){
 let draft;try{draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(String(draft.style)!==String(product.style)||draft.sourceUrl!==product.sourceUrl)return null;
 return draft.listingImages||null;
}
export async function prepareListingImages(product,folder,{dataRoot}){
 const manifest=await listingManifest(product,{dataRoot});if(!manifest)throw Error('대표·추가이미지 사진 선택을 먼저 준비해 주세요.');
 if(!manifest.main||!Array.isArray(manifest.extras)||manifest.extras.length>9)throw Error('스마트스토어 이미지 선택 자료를 확인해 주세요.');
 const root=await realpath(path.join(dataRoot,'smartstore-details',product.style));
 const prepare=async(p,key)=>{
  if(!product.colors.includes(p.color)||typeof p.file!=='string'||path.isAbsolute(p.file)||p.file.split(/[\\/]/).includes('..'))throw Error('선택 사진의 색상·위치를 확인해 주세요.');
  const file=await realpath(path.join(root,p.file));if(!file.startsWith(root+path.sep))throw Error('선택 사진은 품번 자료 폴더 안에서만 사용합니다.');
  const bytes=await readFile(file);const output=path.join(folder,'smartstore-listing-'+key+'-'+hash(bytes).slice(0,20)+'.jpg');
  try{await access(output);}catch{await sharp(bytes).rotate().resize(1500,1500,{fit:'contain',background:'#ffffff'}).jpeg({quality:96}).toFile(output);}
  return key==='main'?decorateMainImage(folder,output):output;
 };
 const main=await prepare(manifest.main,'main'),extras=[];for(const [i,p]of manifest.extras.entries())extras.push(await prepare(p,'extra-'+i));
 return {main,extras,manifest};
}
