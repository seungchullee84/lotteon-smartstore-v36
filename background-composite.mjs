import sharp from 'sharp';

export const BACKGROUND_COMPOSITE_VERSION='original-center-outside-match96-1500-jpeg-q95-444-smooth16-v4';
const size=1500;
const correctionWidth=96;
const decode={limitInputPixels:80000000,failOn:'error'};

// Correct only broad lighting differences outside the original. Smoothing the
// offset along each edge prevents source texture from being stretched into bands.
function matchOutsideEdges(canvas,source,width,height,left,top){
 const correctEdge=(length,span,sourceAt,edgeAt,indexAt)=>{
  if(span<=0)return;
  const deltas=new Float64Array(length*3),radius=16;
  for(let point=0;point<length;point++)for(let c=0;c<3;c++)deltas[point*3+c]=source[sourceAt(point)+c]-canvas[edgeAt(point)+c];
  for(let point=0;point<length;point++){
   const delta=[0,0,0];let total=0;
   for(let offset=-radius;offset<=radius;offset++){
    const neighbor=point+offset;if(neighbor<0||neighbor>=length)continue;
    const weight=Math.exp(-offset*offset/128);total+=weight;
    for(let c=0;c<3;c++)delta[c]+=deltas[neighbor*3+c]*weight;
   }
   for(let c=0;c<3;c++)delta[c]/=total;
   for(let distance=0;distance<span;distance++){
    const t=span===1?0:distance/(span-1),weight=1-t*t*(3-2*t),index=indexAt(point,distance);
    for(let c=0;c<3;c++)canvas[index+c]=Math.round(Math.max(0,Math.min(255,canvas[index+c]+delta[c]*weight)));
   }
  }
 };
 const right=left+width,bottom=top+height;
 correctEdge(height,Math.min(correctionWidth,left),y=>y*width*3,y=>((top+y)*size+left-1)*3,(y,d)=>((top+y)*size+left-1-d)*3);
 correctEdge(height,Math.min(correctionWidth,size-right),y=>(y*width+width-1)*3,y=>((top+y)*size+right)*3,(y,d)=>((top+y)*size+right+d)*3);
 correctEdge(width,Math.min(correctionWidth,top),x=>x*3,x=>((top-1)*size+left+x)*3,(x,d)=>((top-1-d)*size+left+x)*3);
 correctEdge(width,Math.min(correctionWidth,size-bottom),x=>((height-1)*width+x)*3,x=>(bottom*size+left+x)*3,(x,d)=>((bottom+d)*size+left+x)*3);
}

// The caller validates the current product/selection and reviews the background seam.
// This pure operation never masks, feathers, crops, or regenerates the source subject.
export async function composeBackground({original,generated}){
 if(!Buffer.isBuffer(original)||!original.length)throw Error('합성할 원본 사진이 없습니다.');
 if(!Buffer.isBuffer(generated)||!generated.length)throw Error('생성된 배경 이미지가 없습니다.');
 const [source,background]=await Promise.all([sharp(original,decode).metadata(),sharp(generated,decode).metadata()]);
 // Official images can keep their downloaded PNG/WebP bytes under a .jpg
 // filename. Decode the actual format without rewriting the original file.
 if(!['jpeg','png','webp'].includes(source.format)||!source.width||!source.height)throw Error('합성 원본은 크기를 확인할 수 있는 JPEG·PNG·WebP 사진이어야 합니다.');
 if(!background.width||!background.height||background.width!==background.height)throw Error('생성된 배경은 정사각형 이미지여야 합니다.');
 if((source.pages||1)!==1||(background.pages||1)!==1)throw Error('합성에는 한 장의 정지 이미지만 사용할 수 있습니다.');
 const {data,info}=await sharp(original,decode).rotate().resize(size,size,{fit:'inside'}).flatten({background:'#ffffff'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
 const left=Math.floor((size-info.width)/2),top=Math.floor((size-info.height)/2);
 const canvas=await sharp(generated,decode).rotate().resize(size,size).flatten({background:'#ffffff'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 matchOutsideEdges(canvas,data,info.width,info.height,left,top);
 // Copy every source RGB byte after outside correction: no inside blending.
 for(let y=0;y<info.height;y++)data.copy(canvas,((top+y)*size+left)*3,y*info.width*3,(y+1)*info.width*3);
 return sharp(canvas,{raw:{width:size,height:size,channels:3}}).jpeg({quality:95,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();
}
