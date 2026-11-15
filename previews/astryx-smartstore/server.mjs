import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir,stat,realpath} from 'node:fs/promises';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(root,'../..');
const data=await realpath(path.join(project,'data'));
const runtime=path.join(root,'.runtime');
await mkdir(runtime,{recursive:true});
const key=randomBytes(24).toString('hex');
const assets=new Map();
let port,cookieName;
const sameKey=value=>typeof value==='string'&&value.length===key.length&&timingSafeEqual(Buffer.from(value),Buffer.from(key));
const within=(candidate,parent)=>candidate===parent||candidate.startsWith(parent+path.sep);
function respond(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'"});
  res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));
}
async function productData(style,channel='smartstore'){
  if(style&&!/^\d{6}$/.test(style))throw Error('품번 6자리를 입력해 주세요.');
  const candidates=[];
  for(const entry of await readdir(data,{withFileTypes:true})){
    if(!entry.isDirectory()||!/^\d{6}-/.test(entry.name)||(style&&!entry.name.startsWith(style+'-')))continue;
    const file=path.join(data,entry.name,'product.json');
    try{candidates.push({file,modified:(await stat(file)).mtimeMs});}catch{}
  }
  candidates.sort((a,b)=>b.modified-a.modified);
  for(const candidate of candidates){
    let p;
    try{p=JSON.parse(await readFile(candidate.file,'utf8'));}catch{continue;}
    if(!/^\d{6}$/.test(p.style)||(style&&p.style!==style))continue;
    const folder=await realpath(path.dirname(candidate.file));
    if(!within(folder,data))continue;
    const registerAsset=async(file)=>{
      if(!file||path.basename(file)!==file||!/^[-\w]+\.(jpg|jpeg|png|webp)$/i.test(file))return null;
      let resolved;try{resolved=await realpath(path.join(folder,file));}catch{return null;}
      if(!within(resolved,folder))return null;
      const id=createHash('sha256').update(resolved).digest('hex').slice(0,24);
      assets.set(id,resolved);return {id,url:'/asset/'+id};
    };
    if(channel==='lotteon'){
      const images={};
      for(const role of ['main','extra1','extra2','detail','size','check','info']){
        const asset=await registerAsset(role+'.jpg');
        if(asset)images[role]=asset;
      }
      const text=value=>typeof value==='string'?value:'';
      const category=p.category||{},channelPath=p.categoryMatch?.path||{};
      return {
        mode:'preview',channel:'lotteon',images,
        product:{style:p.style,name:text(p.name||p.rawName),rawName:text(p.rawName||p.name),gender:text(p.gender),
          consumerPrice:Number.isFinite(p.consumerPrice)?p.consumerPrice:null,
          material:text(p.material),country:text(p.country),washing:text(p.washing),manufactured:text(p.manufactured),
          colors:Array.isArray(p.colors)?p.colors.filter(c=>typeof c==='string'):[],sizes:Array.isArray(p.sizes)?p.sizes.filter(s=>typeof s==='string'):[],
          keywords:text(p.keywords),sourceUrl:/^https:\/\/(?:www\.)?giordano\.co\.kr\//.test(p.sourceUrl||'')?p.sourceUrl:null,
          category:Object.fromEntries(['commonMajor','commonMiddle','commonSmall','channelMajor','channelMiddle','channelSmall','channelDetail'].map(k=>[k,text(category[k])])),
          channelPath:['major','middle','small','detail'].map(k=>({name:text(channelPath[k]?.name),code:text(channelPath[k]?.code)})).filter(x=>x.name),
        }
      };
    }
    const photos=[],detail=p.smartstoreDetail||{},fileMap=detail.photoFiles||{};
    for(const [color,urls] of Object.entries(detail.colorImages||{})){
      if(!Array.isArray(urls))continue;
      for(const url of urls){
        const asset=await registerAsset(fileMap[url]);
        if(asset&&!photos.some(item=>item.id===asset.id))photos.push({...asset,color,angle:'확인 필요',isMain:url===detail.heroImage});
      }
    }
    const hero=await registerAsset(fileMap[detail.heroImage]);
    if(hero&&!photos.some(item=>item.id===hero.id))photos.unshift({...hero,color:'색상 확인 필요',angle:'확인 필요',isMain:true});
    if(!photos.length){
      for(const file of ['main.jpg','extra1.jpg','extra2.jpg']){
        const asset=await registerAsset(file);if(asset)photos.push({...asset,color:'색상 확인 필요',angle:'확인 필요',isMain:false});
      }
    }
    let originalUrl=null;
    try{const session=JSON.parse(await readFile(path.join(data,'active-register-session.json'),'utf8'));if(Number.isInteger(session.port))originalUrl='http://127.0.0.1:'+session.port+'/';}catch{}
    return {mode:'preview',product:{style:p.style,name:p.name||p.rawName,rawName:p.rawName||p.name,material:p.material||'',country:p.country||'',sizes:p.sizes||[],colors:detail.displayColors||p.colors||[],sourceUrl:/^https:\/\/(?:www\.)?giordano\.co\.kr\//.test(p.sourceUrl||'')?p.sourceUrl:null},photos,originalUrl};
  }
  throw Error(style?'이 PC에 저장된 해당 품번 자료가 없어요. 다른 품번을 입력해 주세요.':'시안에 표시할 저장된 상품이 없어요. 기존 등록기에서 상품을 수집한 뒤 다시 열어 주세요.');
}
const server=createServer(async(req,res)=>{
  try{
    if(req.headers.host!=='127.0.0.1:'+port&&req.headers.host!=='localhost:'+port)return respond(res,403,{error:'Local preview only'});
    if(req.method!=='GET')return respond(res,405,{error:'Read-only preview'});
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(['/','/lotteon'].includes(url.pathname)&&sameKey(url.searchParams.get('key'))){res.writeHead(302,{'Location':url.pathname,'Set-Cookie':cookieName+'='+key+'; HttpOnly; SameSite=Strict; Path=/','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});return res.end();}
    const cookie=(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(!sameKey(cookie))return respond(res,403,'시안 실행 링크로 접속해 주세요.','text/plain; charset=utf-8');
    if(url.pathname==='/preview-data')return respond(res,200,await productData(url.searchParams.get('style')||''));
    if(url.pathname==='/lotte-preview-data')return respond(res,200,await productData(url.searchParams.get('style')||'','lotteon'));
    if(/^\/asset\/[a-f0-9]{24}$/.test(url.pathname)){
      const file=assets.get(url.pathname.slice(7));if(!file)return respond(res,404,{error:'Photo not found'});
      const ext=path.extname(file).toLowerCase();return respond(res,200,await readFile(file),ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg');
    }
    const name=['/','/lotteon'].includes(url.pathname)?'index.html':url.pathname.slice(1);
    if(!/^(?:index\.html|app\.(?:js|css)|[^/]+\.(?:woff2?|ttf))$/.test(name))return respond(res,404,{error:'Not found'});
    const type=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'font/woff2';
    respond(res,200,await readFile(path.join(root,'dist',name)),type);
  }catch(error){respond(res,400,{error:error.message});}
});
server.listen(0,'127.0.0.1',async()=>{
  port=server.address().port;cookieName='astryx_preview_'+port;
  const sessionFile=process.env.ASTRYX_PREVIEW_CHANNEL==='lotteon'?'lotte-session.json':'session.json';
  await writeFile(path.join(runtime,sessionFile),JSON.stringify({port,key,pid:process.pid}));
  console.log('Astryx preview listening on 127.0.0.1:'+port);
});
