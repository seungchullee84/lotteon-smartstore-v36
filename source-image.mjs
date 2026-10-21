import sharp from 'sharp';
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
