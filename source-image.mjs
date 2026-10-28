import sharp from 'sharp';
export function sourceImageCandidates(address,product){
 const original=new URL(address),result=[original.href];
 if(original.origin!=='https://www.giordano.co.kr'||!/^\d{6}$/.test(product.style||''))return result;
 const file=original.pathname.match(new RegExp('^/_gio_on/+(\\d{2}'+product.style+'(?:info|ch)(?:_)?\\.(?:jpe?g|png|webp))$','i'))?.[1];
 if(!file)return result;
 const prefix=file.match(/^\d+/)[0],directories=new Set();
 for(const source of Object.values(product.images||{})){
  let peer;try{peer=new URL(source);}catch{continue;}
  if(peer.origin!==original.origin)continue;
  const match=peer.pathname.match(new RegExp('^/_gio_on/(20\\d{2})/'+prefix+'(?:size|info|ch)?_?\\.(?:jpe?g|png|webp)$','i'));
  if(match)directories.add(match[1]);
 }
 // Multiple years are ambiguous. Never search arbitrary seasons or another style.
 if(directories.size===1){const fixed=new URL(original.href);fixed.pathname='/_gio_on/'+[...directories][0]+'/'+file;result.push(fixed.href);}
 return result;
}
export async function readSourceImage(response){
 if(!response.ok())throw Error('공식몰 이미지 HTTP '+response.status());
 const type=response.headers()['content-type']||'';
 if(/text\/html|application\/json/.test(type))throw Error('공식몰이 이미지 대신 '+(/html/.test(type)?'HTML 페이지':'JSON 안내')+'를 반환했습니다');
 const bytes=await response.body();
 try{const meta=await sharp(bytes).metadata();if(!meta.width||!meta.height)throw Error('empty');}
 catch{throw Error('공식몰 응답에서 유효한 이미지 데이터를 확인하지 못했습니다');}
 return bytes;
}
export async function inspectDetailSource(product,request,approved=false){
 if(!product.images.detail)return null;
 const url=product.images.detail;
 try{return await readSourceImage(await request(url));}
 catch(error){
  if(!approved||!/HTML 페이지|HTTP (404|410)\b/.test(error.message))throw error;
  product.missingOriginalDetailUrl=url;
  product.detailFallbackApproved=true;
  product.originalDetailUrl=null;
  delete product.images.detail;
  product.warnings.push('공식몰 상세 원본 누락 · 사용자 승인으로 대표·색상별 사진을 활용해 구성합니다.');
  return null;
 }
}
