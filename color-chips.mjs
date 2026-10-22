import sharp from 'sharp';
import * as cheerio from 'cheerio';
import path from 'node:path';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';

export function officialColorChips(html,sourceUrl,colors){
 const $=cheerio.load(html),norm=s=>String(s||'').replace(/\s/g,'');
 const found=new Map();
 $('.color_option img').each((_,el)=>{
  const label=$(el).attr('alt')||$(el).attr('title'),src=$(el).attr('src');
  if(!src||!label)return;
  const url=new URL(src,sourceUrl);
  if(url.origin!=='https://www.giordano.co.kr'||!url.pathname.startsWith('/_data/product/'))return;
  found.set(norm(label),{name:label,url:url.href});
 });
 return colors.map(color=>found.get(norm(color))).filter(Boolean);
}

export async function collectColorChips(folder,product,request,log=()=>{}){
 const chips=product.colorChips||[];
 if(!chips.length||chips.length!==product.colors.length){log('색상칩 생략: 공식몰의 전체 색상칩을 확인하지 못했습니다.');return;}
 const results=await Promise.allSettled(chips.map(async(chip,index)=>{
  const url=new URL(chip.url);
  if(url.origin!=='https://www.giordano.co.kr'||!url.pathname.startsWith('/_data/product/'))throw Error('잘못된 색상칩 주소');
  const response=await request(chip.url);
  if(!response.ok())throw Error('색상칩 다운로드 실패');
  const bytes=Buffer.from(await response.body());
  const image=await sharp(bytes,{limitInputPixels:16000000}).rotate().resize(72,72).jpeg({quality:95}).toBuffer();
  const file='colorchip-'+index+'.jpg';await writeFile(path.join(folder,file),image);
  return {name:chip.name,file};
 }));
 if(results.some(r=>r.status==='rejected')){log('색상칩 생략: 일부 색상칩을 받지 못했습니다.');return;}
 await writeFile(path.join(folder,'color-chips.json'),JSON.stringify(results.map(r=>r.value)));
 log('공식몰 색상칩 '+chips.length+'개 수집 완료');
}

// Conservative blank-space test: every small tile must be bright and smooth.
// A textured wall or any uncertain/object-covered area is skipped.
export async function colorChipPosition(bytes,count){
 const height=count*74+(count-1)*14;
 if(count<1||height>1480)return null;
 const positions=[{name:'bottom-right',left:1416,top:1490-height},{name:'middle-right',left:1416,top:Math.floor((1500-height)/2)}];
 for(const position of positions){
  const {data,info}=await sharp(bytes).extract({left:1400,top:Math.max(0,position.top-8),width:100,height:Math.min(1500-position.top,height+8)}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let blank=true;
  for(let y=0;y<info.height&&blank;y+=10)for(let x=0;x<info.width&&blank;x+=10){
   let n=0,sum=0,sum2=0,min=255,max=0;
   for(let yy=y;yy<Math.min(y+10,info.height);yy++)for(let xx=x;xx<Math.min(x+10,info.width);xx++){
    const offset=(yy*info.width+xx)*info.channels;
    const value=(data[offset]+data[offset+1]+data[offset+2])/3;
    n++;sum+=value;sum2+=value*value;min=Math.min(min,value);max=Math.max(max,value);
   }
   if(min<205||max-min>22||sum2/n-(sum/n)**2>18)blank=false;
  }
  if(blank)return position;
 }
 return null;
}

export async function decorateMainImage(folder,source){
 let chips;
 try{chips=JSON.parse(await readFile(path.join(folder,'color-chips.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return source;throw e;}
 if(!Array.isArray(chips)||!chips.length)return source;
 const bytes=await readFile(source),images=[];
 for(const chip of chips){if(!/^colorchip-\d+\.jpg$/.test(chip.file))throw Error('색상칩 파일 경로가 올바르지 않습니다.');images.push(await readFile(path.join(folder,chip.file)));}
 const signature=createHash('sha256').update('right-blank-v1').update(bytes);
 for(const image of images)signature.update(image);
 const hash=signature.digest('hex'),statusFile=path.join(folder,'colorchip-status.json');
 try{const previous=JSON.parse(await readFile(statusFile,'utf8'));if(previous.hash===hash){if(previous.position){await readFile(path.join(folder,previous.file));return path.join(folder,previous.file);}return source;}}catch(e){if(e.code!=='ENOENT')throw e;}
 const position=await colorChipPosition(bytes,images.length);
 if(!position){await writeFile(statusFile,JSON.stringify({hash,position:null,reason:'여백 부족으로 색상칩 생략'}));return source;}
 const layers=[];
 const border=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="74" height="74"><rect x="0.5" y="0.5" width="73" height="73" fill="none" stroke="#c8c8c8"/></svg>');
 for(let i=0;i<images.length;i++){
  const top=position.top+i*88;
  layers.push({input:await sharp(images[i]).resize(72,72).toBuffer(),left:position.left+1,top:top+1},{input:border,left:position.left,top});
 }
 const file='main-colorchips-'+hash.slice(0,24)+'.jpg',output=path.join(folder,file),temporary=output+'.'+randomBytes(6).toString('hex')+'.tmp';
 await sharp(bytes).composite(layers).jpeg({quality:95}).toFile(temporary);await rename(temporary,output);
 await writeFile(statusFile,JSON.stringify({hash,file,position:position.name}));
 return output;
}
