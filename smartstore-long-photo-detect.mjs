import sharp from 'sharp';
import {createWorker} from 'tesseract.js';
const compact=s=>String(s||'').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
export function ocrPhotoSections(tsv,{style,colors,width,height}){
 const grouped=new Map();
 for(const line of String(tsv||'').trim().split('\n').slice(1)){const r=line.split('\t');if(r[0]!=='5'||!r[11]?.trim())continue;const key=r.slice(1,5).join('/');const list=grouped.get(key)||[];list.push({text:r.slice(11).join('\t'),left:+r[6],top:+r[7],width:+r[8],height:+r[9]});grouped.set(key,list);}
 const lines=[...grouped.values()].map(a=>({text:compact(a.map(w=>w.text).join('')),left:Math.min(...a.map(w=>w.left)),top:Math.min(...a.map(w=>w.top)),bottom:Math.max(...a.map(w=>w.top+w.height)),height:Math.max(...a.map(w=>w.height))})).sort((a,b)=>a.top-b.top);
 const text=lines.map(l=>l.text).join(' ');const recorded=[...text.matchAll(/style(\d{6})/g)].map(m=>m[1]);if(recorded.some(v=>v!==style))return [];
 const marker=lines.find(l=>/매장.*(?:마네.*착용|직접.*촬영)/.test(l.text));if(!marker)return [];
 const end=lines.find(l=>l.top>marker.bottom&&/^(materialsize|productdetail|fabricfit|fabricandfit)$/.test(l.text))?.top||height;
 const headings=[];
 for(const l of lines){if(l.top<=marker.bottom||l.top>=end||l.left>width*.2||l.height<width*.027)continue;
  const exact=colors.filter(c=>l.text===compact(c)||l.text.endsWith(compact(c.slice(2)))&&l.text.length<=compact(c).length+2);
  let color=exact.length===1?exact[0]:null;
  if(!color&&/^\d{2}/.test(l.text)){
   const code=l.text.slice(0,2),possible=colors.filter(c=>c.slice(0,2)===code&&text.includes(compact(c)));
   const anchor=lines.find(a=>/^color\d{2}$/.test(a.text)&&a.top<l.top&&l.top-a.top<width*.2);
   if(possible.length===1&&anchor)color=possible[0];
  }
  if(color&&!headings.some(h=>h.color===color))headings.push({...l,color});
 }
 return headings.map((h,i)=>{const limit=headings[i+1]?.top||end;const detail=lines.find(l=>l.top>h.bottom+width*.3&&l.top<limit&&l.text==='detail');return {color:h.color,top:h.bottom+2,bottom:detail?.top||limit};}).filter(s=>s.bottom-s.top>width*.25);
}
function runs(values,gap,min){const out=[];let first=-1,last=-1;for(let i=0;i<values.length;i++){if(values[i]){if(first<0)first=i;last=i;}else if(first>=0&&i-last>gap){if(last-first+1>=min)out.push([first,last+1]);first=-1;}}if(first>=0&&last-first+1>=min)out.push([first,last+1]);return out;}
export function sectionPhotoRectangles(data,{width,height},section){
 const top=Math.max(0,Math.ceil(section.top)),bottom=Math.min(height,Math.floor(section.bottom)),minimum=Math.floor(width*.16);
 const active=(x,y)=>{const i=(y*width+x)*3,b=(y*width+Math.min(5,width-1))*3;if(Math.min(data[i],data[i+1],data[i+2])>245)return false;const light=Math.min(data[b],data[b+1],data[b+2])>225;return Math.max(Math.abs(data[i]-(light?data[b]:255)),Math.abs(data[i+1]-(light?data[b+1]:255)),Math.abs(data[i+2]-(light?data[b+2]:255)))>24;};
 const split=(rect,depth=0)=>{
  if(depth>3)return [rect];
  const columns=Array.from({length:rect.width},(_,dx)=>{let n=0;for(let y=rect.top;y<rect.top+rect.height;y++)if(active(rect.left+dx,y))n++;return n/rect.height>.15;});
  const xs=runs(columns,0,minimum),out=[];
  for(const [a,b] of xs){const left=rect.left+a,right=rect.left+b;const rows=Array.from({length:rect.height},(_,dy)=>{let n=0;for(let x=left;x<right;x++)if(active(x,rect.top+dy))n++;return n/(right-left)>.30;});
   for(const [c,d] of runs(rows,0,minimum)){const child={left,top:rect.top+c,width:right-left,height:d-c};
    if(depth<3&&(xs.length>1||c>2||d<rect.height-2))out.push(...split(child,depth+1));else out.push(child);
   }
  }return out;
 };
 const rects=split({left:0,top,width,height:bottom-top}).filter(r=>r.width/r.height>=.32&&r.width/r.height<=1.8);
 // Template order: left/full image first, then the right column or following row.
 rects.sort((a,b)=>Math.abs(a.top-b.top)<width*.03?a.left-b.left:a.top-b.top);
 return rects.length>=1&&rects.length<=4?rects.map(r=>({...r,color:section.color})):[];
}
export async function detectLongPhotoRegions(bytes,{style,colors,recognize,check=()=>{}}){
 let data;if(recognize)data=await recognize(bytes);else{const worker=await createWorker('kor+eng');try{check();data=(await worker.recognize(bytes,{},{tsv:true})).data;}finally{await worker.terminate();}}
 check();const raw=await sharp(bytes,{limitInputPixels:false}).flatten({background:'#fff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const sections=ocrPhotoSections(data.tsv,{style,colors,width:raw.info.width,height:raw.info.height});
 if(!sections.length)return [];
 return sections.flatMap(s=>sectionPhotoRectangles(raw.data,raw.info,s));
}
