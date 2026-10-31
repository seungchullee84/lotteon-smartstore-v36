import {readFile,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
// Reviewed official originals fill palette gaps only. Store photos and sale
// options remain independent, and original bytes are reused without editing.
export async function attachOfficialPalette(product,prepared,entries,{folder,draftRoot}){
 if(!Array.isArray(entries)||!entries.length)return;
 const detailHash=digest(await readFile(path.join(folder,'detail.jpg')));
 const root=await realpath(draftRoot);
 prepared.paletteImages||={};prepared.paletteSources||={};
 for(const entry of entries){
  if(entry.verified!==true||entry.role!=='front'||entry.style!==product.style||entry.sourceUrl!==product.sourceUrl||entry.sourceDetailHash!==detailHash||!product.colors.includes(entry.color))continue;
  if(prepared.paletteImages[entry.color]||(!prepared.acceptAllFolderPhotos&&prepared.colorImages[entry.color]?.length))continue;
  let url;try{url=new URL(entry.sourceImageUrl);}catch{continue;}
  if(url.protocol!=='https:'||!['www.giordano.co.kr','giordano.co.kr'].includes(url.hostname))continue;
  if(typeof entry.file!=='string'||path.isAbsolute(entry.file)||entry.file.split(/[\\/]/).includes('..'))throw Error('공식 팔레트 사진 경로를 확인해 주세요.');
  const file=await realpath(path.join(root,entry.file));
  if(!file.startsWith(root+path.sep))throw Error('공식 팔레트 사진이 상품 자료 폴더 밖에 있습니다.');
  const bytes=await readFile(file),hash=digest(bytes);
  if(hash!==entry.sourceHash)throw Error('공식 팔레트 원본이 변경되었습니다: '+entry.color);
  if((await sharp(bytes).metadata()).format!=='jpeg')throw Error('공식 팔레트 원본 JPEG를 확인해 주세요.');
  const id=hash.slice(0,24),name='smartstore-photo-'+id+'.jpg',src='/smartstore-photo/'+id;
  await writeFile(path.join(folder,name),bytes);
  prepared.photoFiles[src]=name;prepared.paletteImages[entry.color]=src;prepared.paletteSources[entry.color]='official';
 }
}
