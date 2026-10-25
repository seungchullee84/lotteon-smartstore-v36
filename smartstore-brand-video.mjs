import {readFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
export const BRAND_VIDEO_HASH='de5190da3e0320e926d4a5393451210420cf8a032df1a4ea3b3fe59d12c88085';
export const BRAND_VIDEO_URL='/smartstore-brand-video.mp4?v='+BRAND_VIDEO_HASH.slice(0,16);
export const BRAND_VIDEO_FILENAME='common.mp4';
export const BRAND_VIDEO_TITLE='GIORDANO BRAND 26 F/W FILM';
export const BRAND_VIDEO_HEADING_HEIGHT=88;
export const WOMEN_VIDEO_HASH='fe6e9b1ba13962a619459029971c21495b9682fb1b8d5e4feba6475fac7625b9';
export function productVideoOptions(product){
 const gender=String(product?.gender||'').trim();
 return /^(여성|여자|women|woman|female)$/i.test(gender)?{filename:'women.mp4',expectedHash:WOMEN_VIDEO_HASH}:{};
}
export function productVideoUrl(product){
 const selected=productVideoOptions(product);
 return selected.filename?'/smartstore-brand-video.mp4?variant=women&v='+selected.expectedHash.slice(0,16):BRAND_VIDEO_URL;
}
export const brandVideoFile=(dataRoot=path.join(root,'data'),filename=BRAND_VIDEO_FILENAME)=>path.join(dataRoot,'brand-video',filename);

// The user's original MP4 stays local; do not publish it or substitute the old YouTube clip.
export async function requireBrandVideo(dataRoot,{expectedHash=BRAND_VIDEO_HASH,filename=BRAND_VIDEO_FILENAME}={}){
 if(!['common.mp4','women.mp4'].includes(filename))throw Error('브랜드 영상 종류를 확인해 주세요.');
 const file=brandVideoFile(dataRoot,filename);let bytes;
 try{bytes=await readFile(file);}catch(e){if(e.code==='ENOENT')throw Error('공통 MP4가 없습니다. data/brand-video/'+filename+'에 확인된 원본을 준비해 주세요.');throw e;}
 if(bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp'||createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('공통 MP4가 확인된 원본과 다릅니다. 영상 파일을 다시 확인해 주세요.');
 return {file,bytes,sha256:expectedHash,size:bytes.length};
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function brandVideoHeadingHtml(){
 return `<section data-brand-video-heading style="height:${BRAND_VIDEO_HEADING_HEIGHT}px;display:flex;align-items:center;justify-content:center;background:#f4f3ec;text-align:center;"><h2 style="font-size:30px;line-height:1.5;font-weight:700;margin:0;">${BRAND_VIDEO_TITLE}</h2></section>`;
}
export function brandVideoHtml(src=BRAND_VIDEO_URL){
 return brandVideoHeadingHtml()+`<section data-brand-video="mp4" style="padding:0 28px 28px;background:#f4f3ec;"><video src="${escape(src)}" title="지오다노 공통 브랜드 영상" controls autoplay muted loop playsinline preload="metadata" width="720" height="1280" style="display:block;width:100%;max-width:720px;height:auto;aspect-ratio:9/16;margin:0 auto;background:#000;"></video></section>`;
}
export async function exportBrandVideo(stem,dataRoot,videoOptions){
 const {file,sha256}=await requireBrandVideo(dataRoot,videoOptions);const output=stem+'_브랜드영상.mp4';
 await copyFile(file,output);
 return {path:output,sha256,filename:path.basename(output),previewPlayback:'autoplay-muted-loop',storePlayback:'unverified'};
}
// Range responses are necessary for seeking and metadata loading in Chrome's MP4 player.
export async function serveBrandVideo(req,res,dataRoot,videoOptions){
 const {bytes}=await requireBrandVideo(dataRoot,videoOptions);const size=bytes.length;
 const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 let start=0,end=size-1;
 if(req.headers.range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(!match||(!match[1]&&!match[2])){res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});return res.end();}
  if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),size-1);}
  else start=Math.max(0,size-Number(match[2]));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size){res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});return res.end();}
  res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`});
 }else res.writeHead(200,{...headers,'Content-Length':size});
 return res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));
}
