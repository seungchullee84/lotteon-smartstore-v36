import {readFile,writeFile,mkdir,readdir,realpath,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {imageDownloadFolder} from './desktop-downloads.mjs';
import {requireBrandVideo} from './smartstore-brand-video.mjs';
import {STORE_BANNER_URL} from './smartstore-store-banner.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const idCheck=id=>{if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id||''))throw Error('두 상품 상세 선택값을 확인해 주세요.');return id;};
const folderFor=(root,id)=>path.join(root,'smartstore-two-choice',idCheck(id));
const basename=name=>typeof name==='string'&&name.length<180&&name===path.basename(name)&&!/[\\/]|\.\./.test(name);
function assertManifest(m,id){
 if(m.schema!==1||m.id!==id||m.choiceCount!==2||m.products?.length!==2||new Set(m.products.map(p=>p.style)).size!==2||m.products.some(p=>!/^\d{6}$/.test(p.style)))throw Error('두 상품 구성의 품번·자료를 확인해 주세요.');
 if(!Array.isArray(m.parts)||m.parts.length<2||!Array.isArray(m.files)||m.files.some(f=>!basename(f.name)||! /^[a-f0-9]{64}$/.test(f.sha256)))throw Error('두 상품 상세 파일 목록을 확인해 주세요.');
 for(const name of ['preview.html','overview.png','full.png','brand.mp4',...m.parts])if(!m.files.some(f=>f.name===name))throw Error('두 상품 상세 파일이 누락되었습니다.');
 if(!Number.isInteger(m.videoAfterIndex)||m.videoAfterIndex<0||m.videoAfterIndex>=m.parts.length||!Number.isInteger(m.bannerIndex)||m.bannerIndex<0||m.bannerIndex>=m.parts.length||!Number.isInteger(m.footerIndex)||m.footerIndex<0||m.footerIndex>=m.parts.length)throw Error('두 상품 상세 순서를 확인해 주세요.');
}
const summary=m=>({id:m.id,label:m.label,products:m.products,choiceCount:2,revision:m.revision,template:m.template,updatedAt:m.updatedAt});
export async function listTwoChoicePackages(root){
 let dirs;try{dirs=await readdir(path.join(root,'smartstore-two-choice'),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const list=[];for(const d of dirs.filter(d=>d.isDirectory()&&/^[a-z0-9-]+$/.test(d.name))){try{const m=JSON.parse(await readFile(path.join(folderFor(root,d.name),'manifest.json'),'utf8'));assertManifest(m,d.name);list.push(summary(m));}catch{}}
 return list;
}
export async function installTwoChoicePackage(root,input){
 const id=idCheck(input.id),folder=folderFor(root,id);await mkdir(folder,{recursive:true});
 const files=[];for(const [name,source] of Object.entries(input.sources)){if(!basename(name))throw Error('보관 파일명을 확인해 주세요.');const bytes=await readFile(source);await writeFile(path.join(folder,name),bytes);files.push({name,sha256:hash(bytes),bytes:bytes.length});}
 const m={schema:1,id,choiceCount:2,label:input.label,products:input.products,template:input.template||'two-choice-v2',includeVideo:input.includeVideo!==false,updatedAt:new Date().toISOString(),parts:input.parts,videoAfterIndex:input.videoAfterIndex,bannerIndex:input.bannerIndex,footerIndex:input.footerIndex,files};m.revision=hash(Buffer.from(JSON.stringify([m.products,m.parts,m.includeVideo,m.videoAfterIndex,m.bannerIndex,m.footerIndex,m.files])));assertManifest(m,id);
 await writeFile(path.join(folder,'manifest.json'),JSON.stringify(m,null,2));return summary(m);
}
export async function readTwoChoicePackage(root,id,revision){
 const folder=folderFor(root,id),m=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));assertManifest(m,id);
 if(revision&&revision!==m.revision)throw Error('두 상품 상세가 변경되었습니다. 미리보기를 다시 확인해 주세요.');
 const canonical=await realpath(folder),files={};
 for(const f of m.files){const absolute=await realpath(path.join(folder,f.name));if(!absolute.startsWith(canonical+path.sep))throw Error('두 상품 상세 파일 위치를 확인해 주세요.');const bytes=await readFile(absolute);if(hash(bytes)!==f.sha256)throw Error('두 상품 상세 파일이 변경되었습니다: '+f.name);files[f.name]=absolute;}
 for(const name of m.parts){const file=files[name],size=(await stat(file)).size,meta=await sharp(file,{limitInputPixels:false}).metadata();if(meta.width!==860||!meta.height||size>19000000)throw Error('업로드 이미지 크기·용량을 확인해 주세요: '+name);}
 return {folder,manifest:m,files};
}
export async function twoChoiceUploadParts(root,id,revision){
 const bundle=await readTwoChoicePackage(root,id,revision),m=bundle.manifest,video=m.includeVideo===false?null:await requireBrandVideo(root);
 if(video&&m.files.find(f=>f.name==='brand.mp4').sha256!==video.sha256)throw Error('저장된 두 상품 영상이 현재 공통 영상과 다릅니다.');
 return {...bundle,parts:{files:m.parts.map(name=>bundle.files[name]),includeVideo:m.includeVideo!==false,dataRoot:root,videoAfterIndex:m.videoAfterIndex,hash:m.revision,bannerLink:{index:m.bannerIndex,file:bundle.files[m.parts[m.bannerIndex]],url:STORE_BANNER_URL},footerIndex:m.footerIndex}};
}
export async function saveTwoChoicePackage(root,id,revision,kind='parts'){
 if(!['parts','full'].includes(kind))throw Error('저장 종류를 확인해 주세요.');const b=await readTwoChoicePackage(root,id,revision);
 const folder=path.join(await imageDownloadFolder(),'두상품선택형',id);await mkdir(folder,{recursive:true});
 const names=kind==='full'?['full.png']:[...b.manifest.parts,...(b.manifest.includeVideo===false?[]:['brand.mp4'])];
 for(const name of names)await copyFile(b.files[name],path.join(folder,name==='full.png'?'두상품선택형_전체상세.png':name));
 return {folder,count:names.length,kind,savedToMarketplace:false};
}
