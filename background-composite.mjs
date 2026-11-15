import sharp from 'sharp';

export const BACKGROUND_COMPOSITE_VERSION='original-center-outside-match96-1500-jpeg-q95-444-v2';
const size=1500;
const correctionWidth=96;
const decode={limitInputPixels:80000000,failOn:'error'};

// Correct only newly generated pixels. The nearest outside pixel matches the
// original edge, then a zero-slope smoothstep fades the RGB offset to zero.
function matchOutsideEdges(canvas,source,width,height,left,top){
 const correct=(sourceIndex,edgeIndex,span,indexAt)=>{
  if(span<=0)return;
  const delta=[0,1,2].map(c=>source[sourceIndex+c]-canvas[edgeIndex+c]);
  for(let distance=0;distance<span;distance++){
   const t=span===1?0:distance/(span-1),weight=1-t*t*(3-2*t),index=indexAt(distance);
   for(let c=0;c<3;c++)canvas[index+c]=Math.round(Math.max(0,Math.min(255,canvas[index+c]+delta[c]*weight)));
  }
 };
 for(let y=0;y<height;y++){
  const row=(top+y)*size;
  correct(y*width*3,(row+left-1)*3,Math.min(correctionWidth,left),distance=>(row+left-1-distance)*3);
  const right=left+width;
  correct((y*width+width-1)*3,(row+right)*3,Math.min(correctionWidth,size-right),distance=>(row+right+distance)*3);
 }
 for(let x=0;x<width;x++){
  const column=left+x;
  correct(x*3,((top-1)*size+column)*3,Math.min(correctionWidth,top),distance=>((top-1-distance)*size+column)*3);
  const bottom=top+height;
  correct(((height-1)*width+x)*3,(bottom*size+column)*3,Math.min(correctionWidth,size-bottom),distance=>((bottom+distance)*size+column)*3);
 }
}

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
 const canvas=await sharp(generated,decode).rotate().resize(size,size).flatten({background:'#ffffff'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 matchOutsideEdges(canvas,data,info.width,info.height,left,top);
 // Copy every source RGB byte after outside correction: no inside blending.
 for(let y=0;y<info.height;y++)data.copy(canvas,((top+y)*size+left)*3,y*info.width*3,(y+1)*info.width*3);
 return sharp(canvas,{raw:{width:size,height:size,channels:3}}).jpeg({quality:95,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();
}
