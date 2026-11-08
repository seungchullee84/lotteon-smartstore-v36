import sharp from 'sharp';

const width=400;
const rowGaps=[7,11,5,19]; // Different exports can join or split nearby text rows.
const minInk=20;

async function layoutImage(bytes){
 const {data,info}=await sharp(bytes,{limitInputPixels:false}).flatten({background:'#fff'})
  .resize({width}).greyscale().raw().toBuffer({resolveWithObject:true});
 const softened=await sharp(data,{raw:{width,height:info.height,channels:1}})
  .blur(.75).greyscale().raw().toBuffer();
 const ink=Uint8Array.from(softened,value=>Math.max(0,248-value));
 return {data,ink,height:info.height};
}

function layoutGroups(image,box,axis,gap){
 const horizontal=axis==='rows';
 const first=horizontal?box.top:box.left,last=horizontal?box.bottom:box.right;
 const crossFirst=horizontal?box.left:box.top,crossLast=horizontal?box.right:box.bottom;
 const groups=[];
 for(let i=first;i<last;i++){
  let lo=crossLast,hi=crossFirst,count=0;
  for(let j=crossFirst;j<crossLast;j++){
   const x=horizontal?j:i,y=horizontal?i:j;
   if(image.data[y*width+x]>=212)continue;
   lo=Math.min(lo,j);hi=Math.max(hi,j+1);count++;
  }
  if(count<(horizontal?2:1))continue;
  let group=groups.at(-1);
  if(!group||i-group.end>=gap){
   group={start:i,end:i,crossStart:lo,crossEnd:hi,ink:0};groups.push(group);
  }
  group.end=i+1;
  group.crossStart=Math.min(group.crossStart,lo);
  group.crossEnd=Math.max(group.crossEnd,hi);
  group.ink+=count;
 }
 return groups.filter(group=>group.ink>=minInk).map(g=>horizontal
  ?{top:g.start,bottom:g.end,left:g.crossStart,right:g.crossEnd}
  :{left:g.start,right:g.end,top:g.crossStart,bottom:g.crossEnd});
}

function horizontalGroups(image,gap){
 return layoutGroups(image,{left:0,right:width,top:0,bottom:image.height},'rows',gap);
}

function matchingShape(a,b){
 return Math.abs(a.left-b.left)<=16&&Math.abs(a.right-b.right)<=16
  &&Math.abs((a.bottom-a.top)-(b.bottom-b.top))<=Math.max(4,(a.bottom-a.top)*.15);
}

function sampleInk(image,x,y){
 const left=Math.floor(x),top=Math.floor(y),dx=x-left,dy=y-top;
 if(left<0||left+1>=width||top<0||top+1>=image.height)return 0;
 const i=top*width+left,p=image.ink;
 return (1-dy)*((1-dx)*p[i]+dx*p[i+1])+dy*((1-dx)*p[i+width]+dx*p[i+width+1]);
}

function similarity(detail,section,box,dx,dy,step=1,xScale=1,centerX=0){
 let dot=0,aSquare=0,bSquare=0,difference=0,ink=0;
 for(let y=box.top;y<box.bottom;y+=step)for(let x=box.left;x<box.right;x+=step){
  const a=sampleInk(detail,x+dx+(x-centerX)*(xScale-1),y+dy),b=section.ink[y*width+x];
  dot+=a*b;aSquare+=a*a;bSquare+=b*b;difference+=Math.abs(a-b);ink+=Math.max(a,b);
 }
 return {cosine:dot/Math.sqrt(aSquare*bSquare),error:difference/ink,ink};
}

function compareRegion(detail,section,target,sample){
 const centerX=(target.left+target.right-sample.left-sample.right)/2;
 const centerY=(target.top+target.bottom-sample.top-sample.bottom)/2;
 const box={left:Math.max(0,sample.left-2),right:Math.min(width,sample.right+2),
  top:Math.max(0,sample.top-2),bottom:Math.min(section.height,sample.bottom+2)};
 let best={cosine:0};
 const center=(sample.left+sample.right)/2;
 const scaled=(target.right-target.left)/(sample.right-sample.left);
 const scales=scaled>=.9&&scaled<=1.1&&Math.abs(scaled-1)>.01?[1,scaled]:[1];
 const search=(x,y,offsets,step,factors)=>{
  for(const scale of factors)for(const dx of offsets)for(const dy of offsets){
   const score=similarity(detail,section,box,x+dx,y+dy,step,scale,center);
   if(score.cosine>best.cosine)best={...score,dx:x+dx,dy:y+dy,scale};
  }
 };
 search(centerX,centerY,[0,-1,1,-2,2,-3,3],2,scales);
 if(best.cosine<.86)return false;
 const coarse=best;
 best={cosine:0};
 search(coarse.dx,coarse.dy,[0,-.25,.25,-.5,.5],1,[coarse.scale]);
 if(best.cosine<.95||best.error>.27)return false;
 // Check overlapping small areas under the same alignment. A single changed
 // measurement or a moved CHECK UP marker can be lost in the overall score.
 const tileWidth=16,tileHeight=12;
 let weakest=1,worst=0;
 for(let y=box.top;y<box.bottom;y+=6)for(let x=box.left;x<box.right;x+=8){
  const tile={left:x,right:Math.min(box.right,x+tileWidth),top:y,bottom:Math.min(box.bottom,y+tileHeight)};
  const score=similarity(detail,section,tile,best.dx,best.dy,1,best.scale,center);
  if(score.ink<1000)continue;
  weakest=Math.min(weakest,score.cosine||0);
  worst=Math.max(worst,score.error);
 }
 return weakest>=.945&&worst<=.4;
}

function subdivide(image,box){
 const columns=layoutGroups(image,box,'columns',16);
 if(columns.length<2)return [box];
 return columns.flatMap(column=>layoutGroups(image,column,'rows',12));
}

export function createOfficialLayoutMatcher(detailBytes){
 let detailJob;
 return async sectionBytes=>{
  detailJob??=layoutImage(detailBytes).then(image=>({image,groupsByGap:new Map(rowGaps.map(gap=>[gap,horizontalGroups(image,gap)]))}));
  const [{image:detail,groupsByGap},section]=await Promise.all([detailJob,layoutImage(sectionBytes)]);
  for(const gap of rowGaps){
   const sampleGroups=horizontalGroups(section,gap),targetGroups=groupsByGap.get(gap);
   if(!sampleGroups.length)continue;
   const sampleHeight=sampleGroups.at(-1).bottom-sampleGroups[0].top;
   if(sampleHeight<25)continue;
   for(let index=0;index<=targetGroups.length-sampleGroups.length;index++){
    const candidates=targetGroups.slice(index,index+sampleGroups.length);
    const height=candidates.at(-1).bottom-candidates[0].top;
    if(height>1.45*sampleHeight||height<.65*sampleHeight)continue;
    if(!candidates.every((candidate,n)=>matchingShape(sampleGroups[n],candidate)))continue;
    const matched=candidates.every((candidate,n)=>{
     const sample=sampleGroups[n];
     if(compareRegion(detail,section,candidate,sample))return true;
     const pieces=subdivide(section,sample),targets=subdivide(detail,candidate);
     return pieces.length>1&&pieces.length===targets.length&&pieces.every((piece,k)=>
      matchingShape(piece,targets[k])&&compareRegion(detail,section,targets[k],piece));
    });
    if(matched)return {included:true,comparison:'layout-regions'};
   }
  }
  return {included:false};
 };
}
