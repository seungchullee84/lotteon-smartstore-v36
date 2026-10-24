import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {findPhotos} from './smartstore-photo-files.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function chooseListingPhotos(photos,product){
 const main=photos.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name||''));
 if(main.length!==1)throw Error('품번 폴더에서 대표로 사용할 사진 한 장의 파일명을 1.jpg 또는 1번.jpg로 지정해 주세요.');
 const selected=main[0],same=p=>hash(p.bytes)===hash(selected.bytes);
 const side=photos.find(p=>p.color===selected.color&&p.role==='side'&&!same(p));
 const extras=side?[side]:[];
 for(const color of product.colors.filter(color=>color!==selected.color&&photos.some(p=>p.color===color))){const front=photos.find(p=>p.color===color&&p.role==='front'&&!same(p));if(!front)throw Error(color+' 정면 사진이 필요합니다.');extras.push(front);}
 if(extras.length>9)throw Error('스마트스토어 추가이미지는 9장까지 구성할 수 있습니다. 사용할 색상 사진을 정리해 주세요.');
 return {main:selected,extras};
}
export async function saveListingSelection(root,selection){
 await mkdir(path.join(root,'listing'),{recursive:true});
 const save=async(p,name)=>{const file='listing/'+name+path.extname(p.name).toLowerCase();await writeFile(path.join(root,file),p.bytes);return {file,color:p.color,role:p.role,sourceName:p.name,sourceHash:hash(p.bytes)};};
 return {main:await save(selection.main,'main'),extras:await Promise.all(selection.extras.map((p,i)=>save(p,'extra-'+(i+1))))};
}
export async function listingManifest(product,{dataRoot}){
 let draft;try{draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(String(draft.style)!==String(product.style)||draft.sourceUrl!==product.sourceUrl)return null;
 return draft.listingImages||null;
}
export async function listingPreview(product,options){
 const manifest=await listingManifest(product,options);if(manifest)return manifest;
 const photos=await findPhotos(product,options),main=photos.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name));
 if(main.length!==1)return null;
 return {main:{sourceName:main[0].name,color:'색상 대조 전'},extras:[],previewOnly:true};
}
export async function originalListingMain(product,options){
 const originals=(await findPhotos(product,options)).filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name));
 if(originals.length!==1)throw Error('바탕화면 상품등록기사진폴더의 해당 품번 폴더에서 1.jpg 또는 1번.jpg 한 장을 확인해 주세요.');
 return originals[0].file;
}
export async function prepareListingImages(product,folder,{dataRoot,...photoOptions}){
 const manifest=await listingManifest(product,{dataRoot});if(!manifest)throw Error('대표·추가이미지 사진 선택을 먼저 준비해 주세요.');
 if(!manifest.main||!Array.isArray(manifest.extras)||manifest.extras.length>9)throw Error('스마트스토어 이미지 선택 자료를 확인해 주세요.');
 const photos=await findPhotos(product,photoOptions);
 const originals=photos.filter(p=>/^1(?:번)?\.(?:jpe?g|png|webp)$/i.test(p.name||''));
 if(originals.length!==1)throw Error('품번 폴더의 원본 1.jpg 또는 1번.jpg 한 장을 확인해 주세요.');
 const main=originals[0].file,extras=[];
 for(const entry of manifest.extras){
  if(!product.colors.includes(entry.color))throw Error('추가사진의 색상을 확인해 주세요.');
  const matches=photos.filter(p=>entry.sourceHash?hash(p.bytes)===entry.sourceHash:p.name===entry.sourceName);
  if(matches.length!==1)throw Error('품번 폴더에서 추가사진 원본을 확인해 주세요: '+entry.sourceName);
  extras.push(matches[0].file);
 }
 return {main,extras,manifest};
}
