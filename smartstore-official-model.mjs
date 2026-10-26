import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function supplementOfficialModels(product,prepared,folder,{dataRoot}){
 const root=path.join(dataRoot,'smartstore-details',product.style);let review;try{review=JSON.parse(await readFile(path.join(root,'official-model-cuts.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return;throw e;}
 if(review.style!==product.style||review.sourceUrl!==product.sourceUrl||review.sourceImageUrl!==product.images.detail)return;
 let bytes;try{bytes=await readFile(path.join(folder,'detail.jpg'));}catch(e){if(e.code==='ENOENT')return;throw e;}
 if(hash(bytes)!==review.sourceImageHash)return;
 prepared.photoSources||={};
 for(const color of product.colors){
  if(prepared.colorImages[color]?.length!==2||prepared.colorSources[color]==='official')continue;
  const record=review.cuts?.find(r=>r.color===color&&r.verified===true&&r.role==='model'&&r.evidence);
  if(!record)continue;
  const rect=record.rect;if(!rect||!['left','top','width','height'].every(k=>Number.isInteger(rect[k]))||rect.left<0||rect.top<0||rect.width<100||rect.height<100)continue;
  const meta=await sharp(bytes).metadata();if(rect.left+rect.width>meta.width||rect.top+rect.height>meta.height)continue;
  const output=await sharp(bytes).extract(rect).jpeg({quality:95}).toBuffer(),digest=hash(output),id=digest.slice(0,24),src='/smartstore-photo/'+id;
  const existing=await Promise.all(prepared.colorImages[color].map(async url=>{const file=prepared.photoFiles[url];return file?hash(await readFile(path.join(folder,file))):null;}));
  if(existing.includes(digest)||prepared.colorImages[color].includes(src))continue;
  const name='smartstore-photo-'+id+'.jpg';await writeFile(path.join(folder,name),output);
  await mkdir(path.join(root,'official-model'),{recursive:true});await writeFile(path.join(root,'official-model',digest+'.jpg'),output);
  prepared.photoFiles[src]=name;prepared.colorImages[color].push(src);prepared.photoSources[src]='official-model';prepared.colorSources[color]='mixed';prepared.photoCount++;
 }
}
