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
 'JSON {"style":"입력값","noticeHash":"입력값","material":"원문"}만 답한다.',
].join('\n');

export async function reviewNoticeMaterial(product,folder,{dataRoot,signal}){
 if(product.material||!product.images?.info||!/^\d{6}$/.test(product.style)||
    !sameOfficialProduct(product.sourceUrl,product.sourceUrl)||
    !product.images.info.startsWith('https://www.giordano.co.kr/'))return '';
 const cli=openMausCli(dataRoot);
 const bytes=await readFile(path.join(folder,'info.jpg'));
 signal?.throwIfAborted();
 const noticeHash=createHash('sha256').update(bytes).digest('hex');
 const file=path.join(dataRoot,'openmausbot','notice','v1-'+product.style+'-'+noticeHash+'.json');
 let response;
 try{response=JSON.parse(await readFile(file,'utf8'));}catch{}
 if(!response){
  try{await access(cli);}catch{return '';}
  let image=sharp(bytes,{limitInputPixels:80000000});
  if(product.noticeAnalysis?.materialBand)image=image.extract(product.noticeAnalysis.materialBand);
  response=await runOpenMausReview(cli,{style:product.style,noticeHash},prompt,{
   signal,image:await image.resize({width:1400,height:2800,fit:'inside'}).png().toBuffer(),
  });
 }
 signal?.throwIfAborted();
 if(response?.style!==product.style||response.noticeHash!==noticeHash||typeof response.material!=='string'||response.material.length>1000)return '';
 const material=verifiedOcrMaterial(response.material);
 await atomicWrite(file,JSON.stringify({style:product.style,noticeHash,material}));
 return material;
}
