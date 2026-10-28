import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createWorker} from 'tesseract.js';

export async function extractEmbeddedNotice(product,detail,{recognize,signal}={}){
 if(!/^\d{6}$/.test(product.style||''))throw Error('상세 원본의 품번을 확인해 주세요.');
 const meta=await sharp(detail).metadata();if(!meta.width||!meta.height)throw Error('상세 원본 이미지가 올바르지 않습니다.');
 const height=Math.min(meta.height,Math.round(meta.width*4)),top=meta.height-height;
 const tail=await sharp(detail).extract({left:0,top,width:meta.width,height}).toBuffer();
 let worker,result;
 try{signal?.throwIfAborted();if(recognize)result=await recognize(tail);else{worker=await createWorker('kor+eng');result=(await worker.recognize(tail,{}, {tsv:true})).data;}signal?.throwIfAborted();}
 finally{await worker?.terminate();}
 const text=String(result.text||'').replace(/\s/g,'');
 if(!text.includes(product.style)||!/소재|혼용률/.test(text)||!/제조국|원산지/.test(text)||!/제조연월|제조년월|제조일/.test(text))throw Error('상세 하단에서 현재 품번의 정보고시 표를 확인하지 못했습니다. 다른 상품의 정보로 대체하지 않습니다.');
 const words=String(result.tsv||'').split('\n').slice(1).map(line=>{const c=line.split('\t');return {level:+c[0],line:c.slice(1,5).join(':'),top:+c[7],height:+c[9],text:c[11]||''};}).filter(w=>w.level===5&&w.height>0);
 const grouped=new Map();for(const word of words){const line=grouped.get(word.line)||{top:word.top,text:''};line.top=Math.min(line.top,word.top);line.text+=word.text;grouped.set(word.line,line);}
 const lines=[...grouped.values()];
 const header=lines.find(w=>/INFORMATION/i.test(w.text));
 const styleLabel=lines.find(w=>/스타일/.test(w.text)&&w.text.includes(product.style));
 if(!header&&!styleLabel)throw Error('상세 하단 정보고시 영역의 위치를 확인하지 못했습니다.');
 const cropTop=Math.max(0,Math.floor(top+(header||styleLabel).top-meta.width*.04));
 return {bytes:await sharp(detail).extract({left:0,top:cropTop,width:meta.width,height:meta.height-cropTop}).jpeg({quality:98}).toBuffer(),source:{type:'embedded-detail',style:product.style,sourceUrl:product.sourceUrl,detailUrl:product.images.detail,detailHash:createHash('sha256').update(detail).digest('hex'),crop:{left:0,top:cropTop,width:meta.width,height:meta.height-cropTop}}};
}
