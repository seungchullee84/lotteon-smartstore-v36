import {createHash} from 'node:crypto';
import {access,readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {atomicWrite} from './atomic-file.mjs';
import {sameOfficialProduct} from './official-benefit-catalog.mjs';
import {openMausCli,runOpenMausReview} from './openmaus-research.mjs';
import {verifiedOcrMaterial} from './notice.mjs';

const prompt=[
 '첨부한 지오다노 공식 상품정보고시의 제품 소재 행만 그대로 읽어라. 각 부위의 소재명, 숫자, %를 원본 순서대로 적는다.',
 '확실히 읽을 수 없거나 %가 보이지 않는 숫자가 있으면 material을 빈 문자열로 둔다. 잘못 읽힌 값이나 누락된 값은 추측하지 않는다.',
 'JSON {"style":"입력값","sourceUrl":"입력값","noticeUrl":"입력값","noticeHash":"입력값","material":"원문"}만 답한다.',
].join('\n');

const reviewStatus='자동 재판독 · 원본 확인 권장';
function noticeSource(product){
 const source={style:product.style,sourceUrl:product.sourceUrl,noticeUrl:product.images?.info};
 if(!/^\d{6}$/.test(source.style)||!sameOfficialProduct(source.sourceUrl,source.sourceUrl)||
    !/^[a-f0-9]{32}$/i.test(new URL(source.sourceUrl).searchParams.get('pno')||'')||
    !source.noticeUrl?.startsWith('https://www.giordano.co.kr/'))return null;
 return source;
}
function materialAlreadySet(product){return !!product.material||Object.hasOwn(product.userEditedFields||{},'material');}
export function verifiedNoticeMaterialReview(response,input){
 if(!input||!response||!['style','sourceUrl','noticeUrl','noticeHash'].every(key=>response[key]===input[key])||
    !/^[a-f0-9]{64}$/.test(input.noticeHash||'')||typeof response.material!=='string'||response.material.length>1000)return null;
 const material=verifiedOcrMaterial(response.material);
 return material?{...input,material,method:'OpenMausBot'}:null;
}

export async function reviewNoticeMaterial(product,folder,{dataRoot,signal,review=runOpenMausReview,checkCli=access}){
 const source=noticeSource(product);
 if(materialAlreadySet(product)||!source)return null;
 const cli=openMausCli(dataRoot);
 const bytes=await readFile(path.join(folder,'info.jpg'));
 signal?.throwIfAborted();
 const noticeHash=createHash('sha256').update(bytes).digest('hex');
 const input={...source,noticeHash};
 const file=path.join(dataRoot,'openmausbot','notice','v2-'+source.style+'-'+noticeHash+'.json');
 let response;
 try{response=JSON.parse(await readFile(file,'utf8'));}catch{}
 const cached=verifiedNoticeMaterialReview(response,input);
 if(cached)return cached;
 try{await checkCli(cli);}catch{return null;}
 let image=sharp(bytes,{limitInputPixels:80000000});
 if(product.noticeAnalysis?.materialBand)image=image.extract(product.noticeAnalysis.materialBand);
 response=await review(cli,input,prompt,{
  signal,image:await image.resize({width:1400,height:2800,fit:'inside'}).png().toBuffer(),
 });
 signal?.throwIfAborted();
 const result=verifiedNoticeMaterialReview(response,input);
 // Empty or invalid readings must remain retryable; never cache them as a completed review.
 if(result)await atomicWrite(file,JSON.stringify(result));
 return result;
}

export async function applyNoticeMaterialReview(product,folder,review,{signal,isCurrent=()=>true}={}){
 if(!review||signal?.aborted||!isCurrent()||materialAlreadySet(product))return false;
 const source=noticeSource(product);
 if(!source)return false;
 const bytes=await readFile(path.join(folder,'info.jpg'));
 const noticeHash=createHash('sha256').update(bytes).digest('hex');
 const result=verifiedNoticeMaterialReview(review,{...source,noticeHash});
 // Recheck after the file read so a style switch or manual edit cannot be overwritten.
 if(!result||signal?.aborted||!isCurrent()||materialAlreadySet(product)||
    JSON.stringify(noticeSource(product))!==JSON.stringify(source))return false;
 product.material=result.material;
 product.fieldStatus={...product.fieldStatus,material:reviewStatus};
 product.noticeAnalysis={...product.noticeAnalysis,material:result.material,
  fieldStatus:{...product.noticeAnalysis?.fieldStatus,material:reviewStatus},
  materialReview:{...result,reviewedAt:new Date().toISOString()}};
 product.warnings=product.warnings?.filter(w=>!w.startsWith('소재 혼용률'))||[];
 await atomicWrite(path.join(folder,'product.json'),JSON.stringify(product,null,2));
 return true;
}
