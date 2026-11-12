import sharp from 'sharp';
import {createWorker,PSM} from 'tesseract.js';

export async function readNoticeRegion(file,region,signal){
 const {left,top,right,bottom}=region??{};
 if(![left,top,right,bottom].every(Number.isFinite)||
    left<0||top<0||right>1||bottom>1||left>=right||top>=bottom){
  throw Error('이미지에서 읽을 범위를 다시 선택해 주세요.');
 }
 signal.throwIfAborted();
 const image=sharp(file);
 const {width,height}=await image.metadata();
 const x=Math.floor(left*width),y=Math.floor(top*height);
 const crop={left:x,top:y,width:Math.ceil(right*width)-x,height:Math.ceil(bottom*height)-y};
 const scale=Math.min(4,2000/Math.max(crop.width,crop.height));
 const enlarged=await image.extract(crop)
  .resize({width:Math.max(1,Math.round(crop.width*scale))})
  .extend({top:12,bottom:12,left:12,right:12,background:'white'})
  .png().toBuffer();
 signal.throwIfAborted();

 let worker,abort;
 const cancelled=new Promise((_,reject)=>{abort=()=>reject(signal.reason);});
 const recognize=async()=>{
  worker=await createWorker('kor+eng');
  if(signal.aborted){await worker.terminate().catch(()=>{});signal.throwIfAborted();}
  await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK});
  const {data}=await worker.recognize(enlarged);
  const text=data.text.trim();
  return /[가-힣A-Za-z0-9]/.test(text)?text:'';
 };
 signal.addEventListener('abort',abort,{once:true});
 try{return await Promise.race([recognize(),cancelled]);}
 finally{
  signal.removeEventListener('abort',abort);
  await worker?.terminate().catch(()=>{});
 }
}
