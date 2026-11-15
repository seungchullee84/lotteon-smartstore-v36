import sharp from 'sharp';

export const BACKGROUND_COMPOSITE_VERSION='original-center-1500-jpeg-q95-444-v1';
const size=1500;
const decode={limitInputPixels:80000000,failOn:'error'};

// The caller validates the current product/selection and reviews the background seam.
// This pure operation never masks, feathers, crops, or regenerates the source subject.
export async function composeBackground({original,generated}){
 if(!Buffer.isBuffer(original)||!original.length)throw Error('합성할 JPEG 원본이 없습니다.');
 if(!Buffer.isBuffer(generated)||!generated.length)throw Error('생성된 배경 이미지가 없습니다.');
 const [source,background]=await Promise.all([sharp(original,decode).metadata(),sharp(generated,decode).metadata()]);
 if(source.format!=='jpeg'||!source.width||!source.height)throw Error('합성 원본은 크기를 확인할 수 있는 JPEG 사진이어야 합니다.');
 if(!background.width||!background.height||background.width!==background.height)throw Error('생성된 배경은 정사각형 이미지여야 합니다.');
 if((source.pages||1)!==1||(background.pages||1)!==1)throw Error('합성에는 한 장의 정지 이미지만 사용할 수 있습니다.');
 const {data,info}=await sharp(original,decode).rotate().resize(size,size,{fit:'inside'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
 const left=Math.floor((size-info.width)/2),top=Math.floor((size-info.height)/2);
 return sharp(generated,decode).rotate().resize(size,size).flatten({background:'#ffffff'}).toColourspace('srgb')
  .composite([{input:data,raw:{width:info.width,height:info.height,channels:info.channels},left,top,blend:'over'}])
  .jpeg({quality:95,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();
}
