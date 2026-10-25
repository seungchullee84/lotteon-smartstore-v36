import {fileURLToPath} from 'node:url';
// Rebuild the six extra banners from official photographs without altering faces/clothes.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import sharp from 'sharp';
const root=new URL('./',import.meta.url),asset=new URL('public/smartstore-template/',root),work=new URL('data/banner-work/',root);
const sourcePage='https://www.giordano.co.kr/';
const photographs={
 men:['97f2d97c6970cfd63291b9b5fdcdbc94','9382a2585d78c9bd765e66c96f6f7eb2','14361e56276b654d85247d847f6d1c55'],
 women:['64e020337fe5a82306c702aa79040a8f','4caaed2d7f4f868adff5397ef15a7449','2028b136156e68a9c78359347843de94']
};
await mkdir(work,{recursive:true});
const font=(await readFile(new URL('GowunDodum-Regular.ttf',asset))).toString('base64');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:860,height:420},deviceScaleFactor:1});
 const manifest=JSON.parse(await readFile(new URL('store-discovery-sources.json',asset),'utf8'));
 manifest.additionalVariants=[];
 for(const [gender,ids]of Object.entries(photographs))for(let index=0;index<ids.length;index++){
  const variant=index+2,url='https://m.giordano.co.kr/_data/banner/'+ids[index]+'.jpg';
  const response=await fetch(url);if(!response.ok)throw Error('공식 화보 다운로드 실패');
  const original=Buffer.from(await response.arrayBuffer());const meta=await sharp(original).metadata();
  if(meta.width!==1904||meta.height!==800)throw Error('공식 화보 구도가 변경되었습니다.');
  await writeFile(new URL(gender+'-'+variant+'-original.jpg',work),original);
  // Remove the official campaign's promotional copy by framing only its model photograph.
  const photograph=await sharp(original).extract({left:1060,top:0,width:844,height:800}).jpeg({quality:97}).toBuffer();
  const image='data:image/jpeg;base64,'+photograph.toString('base64');
  const copy=`<div class="copy"><p class="kicker">롯데백화점 동탄점 · 지오다노</p><h1>마음에 드는 옷,<br>더 만나볼까요?</h1><p class="description">여길 누르면 지오다노 다른 상품을<br>구경할 수 있어요</p><div class="cta">다른 상품 구경하기 <span>→</span></div></div>`;
  const html=`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:g;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{margin:0;font-family:g;color:#203c30}main{width:860px;height:420px;display:flex;overflow:hidden;background:#f3f0e6}.copy{width:530px;padding:36px 30px 28px 36px;flex-shrink:0}.kicker{font-size:16px;letter-spacing:.8px;margin:0 0 26px}h1{font-size:35px;line-height:1.45;margin:0 0 24px;font-weight:700;letter-spacing:-.7px}.description{font-size:21px;line-height:1.8;margin:0 0 25px;white-space:nowrap}.cta{font-size:21px;display:inline-flex;gap:30px;align-items:center;padding:12px 22px;border-radius:28px;background:#294d3b;color:white}.photo{flex:1;min-width:0;height:420px}.photo img{width:100%;height:100%;object-fit:cover;object-position:50% 10%}.v2{background:#233e34;color:#fff9e9}.v2 .copy{border-top:7px solid #c3a16f;padding-top:29px}.v2 .kicker{color:#dac59c}.v2 .cta{background:#f0e5cb;color:#213e32}.v3{background:#f8f6f0;color:#493c32}.v3 .photo{order:-1}.v3 .copy{width:524px;padding-left:32px}.v3 .kicker{padding-bottom:12px;margin-bottom:18px;border-bottom:1px solid #c7beb0}.v3 h1{font-size:34px}.v3 .cta{border-radius:5px;background:#655144}.v4{background:#e8ede7}.v4 .copy{width:512px;padding:35px 24px 22px 30px}.v4 h1{font-size:34px;margin-bottom:21px}.v4 .kicker{border-left:4px solid #b3884b;padding-left:13px;margin-bottom:23px}.v4 .cta{border-radius:0;background:transparent;color:#294d3b;border-bottom:2px solid #294d3b;padding:12px 0 8px;width:100%;justify-content:space-between}.v4 .photo{margin:18px 18px 18px 0;height:384px;border-radius:80px 8px 8px 8px;overflow:hidden}.v4 .description{font-size:20px}</style><main class="v${variant}">${copy}<div class="photo"><img src="${image}"></div></main>`;
  await page.setContent(html);await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(n=>n.decode())]));
  const file='store-discovery-'+gender+'-'+variant+'.jpg';
  await page.screenshot({path:fileURLToPath(new URL(file,asset)),type:'jpeg',quality:95});
  manifest.additionalVariants.push({gender,variant,file,sourcePage,url,sha256:createHash('sha256').update(original).digest('hex'),framing:{left:1060,top:0,width:844,height:800},modelAltered:false});
 }
 manifest.checked='2026-10-26';await writeFile(new URL('store-discovery-sources.json',asset),JSON.stringify(manifest,null,2));
}finally{await browser.close();}
