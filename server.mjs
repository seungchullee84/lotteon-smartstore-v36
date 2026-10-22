import {generateBackground} from './background-image.mjs';
import {createReleaseTracker} from './app-release.mjs';
import {brandingLock} from './branding-lock.mjs';
import {SmartstoreAutomation} from './smartstore-automation.mjs';
import {smartstorePlan} from './smartstore-form.mjs';
import {saveLongDetailImage} from './long-detail-image.mjs';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildDetailContent} from './detail-html.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {collect,parseProductInput,validateStyle,cleanMarketingText,buildKeywords,easyProductName,repairCategoryFields} from './product.mjs';
import {LotteAutomation} from './automation.mjs';
import {prepareMainImage,backgroundImageStatus} from './main-image.mjs';
import sharp from 'sharp';
import {saveIconMeaning,iconWashingResult} from './washing-icons.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const releases=createReleaseTracker(root);await releases.get();
const dataRoot=path.join(root,'data');await mkdir(dataRoot,{recursive:true});
const desktopSession=process.env.REGISTER_DESKTOP==='1'?JSON.parse(await readFile(path.join(dataRoot,'desktop-session.json'),'utf8')):null;
const token=desktopSession?.token||randomBytes(24).toString('hex');
let backgroundApiKey=process.env.OPENAI_API_KEY?.trim()||'';
const protectedBranding=brandingLock(dataRoot);
const state={busy:false,phase:'idle',logs:[],product:null,folder:null,error:null,paused:null,revision:0,collectionInput:null,detailFallbackRequest:null};
if(process.env.REGISTER_RESTORE){const restored=path.resolve(process.env.REGISTER_RESTORE);if(restored.startsWith(dataRoot+path.sep)){state.product=JSON.parse(await readFile(restored,'utf8'));repairCategoryFields(state.product);if(state.product.categoryMatch){state.product.fieldStatus||={};state.product.fieldStatus.category=state.product.categoryMatch.status;}state.product.keywords=buildKeywords(state.product);state.folder=path.dirname(restored);state.phase='done';state.revision=1;}}
function log(message){state.logs.push({time:new Date().toLocaleTimeString('ko-KR'),message});state.logs=state.logs.slice(-300);console.log(message);}
const bot=new LotteAutomation(dataRoot,log);bot.onPause=message=>{state.paused=message;};
const smartBot=new SmartstoreAutomation(dataRoot,log);
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>1600000)throw Error('요청이 너무 큽니다.');}return JSON.parse(text||'{}');}
let activeAbort=null;
function job(phase,fn){if(state.busy)throw Error('진행 중인 작업이 있습니다.');activeAbort=new AbortController();state.busy=true;state.phase=phase;state.error=null;Promise.resolve().then(fn).then(()=>{state.phase=bot.stopped?'stopped':'done';}).catch(e=>{state.error=bot.stopped?null:e.message;if(e.code==='DETAIL_SOURCE_MISSING'&&!bot.stopped)state.detailFallbackRequest={input:state.collectionInput};state.phase=bot.stopped?'stopped':'error';log(bot.stopped?'작업을 중단했습니다.':e.message);}).finally(()=>{state.busy=false;state.paused=null;activeAbort=null;});}
function validateProduct(p){

  repairCategoryFields(p);
  p.country=String(p.country||'').replace(/[^가-힣A-Za-z\s]+/g,'').trim();
  p.name=easyProductName(p.name);
  p.keywords=cleanMarketingText(p.keywords).replace(/,{2,}/g,',').replace(/^,|,$/g,'');
  validateStyle(p.style);
  for(const key of ['name','gender','material','country','washing','manufactured','keywords'])if(!p[key]?.trim())throw Error('검토란을 입력해 주세요: '+key);
  if(!['여성','남성'].includes(p.gender))throw Error('성별을 확인해 주세요.');
  if(!p.name.startsWith(p.gender+' '))throw Error('선택한 성별과 상품명 앞의 남성/여성 표시가 다릅니다.');
  if(p.gender==='남성'&&Object.values(p.category||{}).some(v=>/여성/.test(v))||p.gender==='여성'&&Object.values(p.category||{}).some(v=>/남성/.test(v)))throw Error('성별과 상품분류가 다릅니다. 분류를 다시 확인해 주세요.');
  if(!Number.isInteger(+p.consumerPrice)||+p.consumerPrice<1000)throw Error('공식몰 소비자가를 확인해 주세요.');
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.manufactured))throw Error('제조연월은 YYYY-MM 형식입니다.');
  if(!p.colors?.length||!p.sizes?.length)throw Error('색상과 사이즈가 필요합니다.');
  if(p.colors.some(v=>!/^\d{2}\S+$/.test(v)))throw Error('색상은 번호+색상명이며 공백이 없어야 합니다.');
  for(const key of ['commonMiddle','commonSmall','channelMiddle','channelSmall'])if(!p.category?.[key]?.trim())throw Error('카테고리를 입력해 주세요: '+key);
  if(p.keywords.length>35)throw Error('검색키워드는 쉼표·공백 포함 35자 이내로 입력해 주세요.');
  if(!p.keywords.startsWith('지오다노'))throw Error('검색키워드는 지오다노로 시작해야 합니다.');
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403);return res.end();}
    const port=server.address().port;
    if(req.method==='POST'&&req.headers.origin!==`http://127.0.0.1:${port}`)return json(res,403,{error:'잘못된 요청 출처'});
    const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).includes('session='+token);
    if(url.pathname==='/'&&url.searchParams.get('key')===token){res.writeHead(302,{'Set-Cookie':`session=${token}; HttpOnly; SameSite=Strict; Path=/`,'Location':'/'});return res.end();}
    if(!cookie)return json(res,403,{error:'시작 화면의 전용 링크로 접속해 주세요.'});
    if(req.method==='GET'&&url.pathname==='/api/branding')return json(res,200,await protectedBranding.get());
    if(req.method==='GET'&&url.pathname==='/api/state'){
      const composite=state.folder?await backgroundImageStatus(state.folder):{ready:false};
      return json(res,200,{...state,folder:undefined,mainImageVersion:composite.version||null,backgroundConfigured:!!backgroundApiKey,release:await releases.get()});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/image/')){
      if(/^\/image\/wash-icon-[1-9]\d*$/.test(url.pathname)&&state.folder){
        const key=url.pathname.slice(7);
        if(!state.product?.noticeAnalysis?.washingIcons?.some(i=>i.key===key))return json(res,404,{});
        res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(await readFile(path.join(state.folder,key+'.png')));
      }
      if(url.pathname==='/image/main-original'&&state.folder){res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(await readFile(path.join(state.folder,'main.jpg')));}
      if(url.pathname==='/image/main'&&state.folder){const file=await prepareMainImage(state.folder);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(await readFile(file));}
      const name=url.pathname.slice(7);if((!['info','main','extra1','extra2','detail','size','check','ready','completed','stopped'].includes(name)&&!/^color[1-9]\d*_[12]$/.test(name))||!state.folder)return json(res,404,{});
      const png=['ready','completed','stopped'].includes(name);const bytes=await readFile(path.join(state.folder,name+(png?'.png':'.jpg')));
      res.writeHead(200,{'Content-Type':png?'image/png':'image/jpeg','Cache-Control':'no-store'});return res.end(bytes);
    }
    if(req.method==='POST'){
      const b=await body(req);
      if(url.pathname==='/api/background-settings'){
        if(state.busy)throw Error('작업이 끝난 뒤 합성 설정을 변경해 주세요.');
        if(typeof b.apiKey!=='string'||!/^sk-[A-Za-z0-9_-]{16,}$/.test(b.apiKey.trim()))throw Error('올바른 OpenAI API 키를 입력해 주세요.');
        backgroundApiKey=b.apiKey.trim();
        return json(res,200,{ok:true,configured:true});
      }
      if(url.pathname==='/api/background-request'){
        if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 합성을 요청해 주세요.');
        if(!state.product||!state.folder)throw Error('먼저 상품을 수집해 주세요.');
        if(!backgroundApiKey)throw Error('합성 설정에서 OpenAI API 키를 먼저 연결해 주세요.');
        const folder=state.folder,key=backgroundApiKey;
        bot.stopped=false;smartBot.stopped=false;
        job('background',async()=>{
          log('대표사진 배경 합성을 시작합니다.');
          await generateBackground({folder,apiKey:key,signal:activeAbort.signal});
          log('합성 완료. 대표이미지를 변경했습니다.');
        });
        return json(res,202,{ok:true});
      }
      if(url.pathname==='/api/smartstore-open'){
        if(state.busy)throw Error('진행 중인 작업이 있습니다.');
        await smartBot.open();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/smartstore-plan'||url.pathname==='/api/smartstore-test'){
        if(state.busy)throw Error('진행 중인 작업이 있습니다.');
        if(!state.product||b.product?.style!==state.product.style)throw Error('먼저 해당 상품을 수집해 주세요.');
        if(b.finalize||b.save)throw Error('스마트스토어 연결은 저장 없는 입력 테스트만 지원합니다.');
        const p={...state.product,...b.product,images:state.product.images,originalDetailUrl:state.product.originalDetailUrl,colorImages:state.product.colorImages,sourceCategory:state.product.sourceCategory};
        const plan=smartstorePlan(p,b.salePrice);
        if(url.pathname==='/api/smartstore-plan'){
          const assets={main:await prepareMainImage(state.folder),extras:[]};
          for(const key of ['extra1','extra2'])if(p.images[key])assets.extras.push(await prepareMainImage(state.folder,key));
          return json(res,200,{plan,assets});
        }
        bot.stopped=false;smartBot.stopped=false;
        job('smartstore',()=>smartBot.run(p,state.folder,plan.salePrice,b.includeImages===true));return json(res,202,{ok:true});
      }
      if(url.pathname==='/api/learn-washing-icon'){
        if(state.busy)return json(res,409,{error:'진행 중인 작업이 끝난 뒤 아이콘을 확인해 주세요.'});
        const icons=state.product?.noticeAnalysis?.washingIcons;
        const icon=icons?.find(i=>i.key===b.key);
        if(!icon||!state.folder)throw Error('현재 상품의 아이콘을 확인해 주세요.');
        const saved=await saveIconMeaning(await readFile(path.join(state.folder,icon.key+'.png')),b.meaning);
        Object.assign(icon,saved,{known:true});
        const matched=iconWashingResult(icons);
        state.product.fieldStatus||={};
        if(matched.complete){state.product.washing=matched.value;state.product.noticeAnalysis.washing=matched.value;}
        state.product.fieldStatus.washing=matched.complete?'확인된 아이콘 저장자료 일치 · 설명 OCR 병행':'설명 OCR 유지 · 미학습 아이콘 '+icons.filter(i=>!i.known).length+'개 확인 필요';
        await writeFile(path.join(state.folder,'product.json'),JSON.stringify(state.product,null,2));
        return json(res,200,{ok:true,icons,washing:state.product.washing,status:state.product.fieldStatus.washing});
      }
      if(url.pathname==='/api/save-detail-images'){
        if(state.busy)return json(res,409,{error:'작업이 끝난 뒤 상세이미지를 저장해 주세요.'});
        if(!state.product||!state.folder)return json(res,400,{error:'먼저 상품 정보를 수집해 주세요.'});
        const p=state.product;
        const saveFolder=path.resolve(root,'..','대표이미지컷 폴더');
        await mkdir(saveFolder,{recursive:true});
        const filename=String(p.style).replace(/[^a-zA-Z0-9_-]/g,'')+'_상세전체_'+Date.now()+'.png';
        const savedPath=path.join(saveFolder,filename);
        const dimensions=await saveLongDetailImage(p,state.folder,savedPath);
        return json(res,200,{ok:true,path:savedPath,...dimensions});
      }
      if(url.pathname==='/api/branding'){
        // Validate image data before persisting; SVG and external URLs are excluded.
        if(b.logo!==undefined&&b.logo!==null){if(typeof b.logo!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(b.logo)||b.logo.length>1400000)throw Error('로고는 1MB 이하 PNG/JPG/WebP를 선택해 주세요.');const bytes=Buffer.from(b.logo.split(',')[1],'base64');const meta=await sharp(bytes,{limitInputPixels:16000000}).metadata();if(!['png','jpeg','webp'].includes(meta.format))throw Error('지원하지 않는 이미지입니다.');b.logo='data:image/png;base64,'+(await sharp(bytes).resize({width:600,height:300,fit:'inside',withoutEnlargement:true}).png().toBuffer()).toString('base64');}
        return json(res,200,await protectedBranding.update(b));
      }
      if(url.pathname==='/api/save-main-image'){
        if(state.busy)return json(res,409,{error:'작업이 끝난 뒤 대표이미지를 저장해 주세요.'});
        if(!state.product||!state.folder)return json(res,400,{error:'먼저 상품 정보를 수집해 주세요.'});
        const saveFolder=path.resolve(root,'..','대표이미지컷 폴더');
        await mkdir(saveFolder,{recursive:true});
        const key=b.image||'main';
        if(!['main','extra1','extra2'].includes(key)||!state.product.images[key])return json(res,400,{error:'저장할 이미지를 확인해 주세요.'});
        const filename=String(state.product.style).replace(/[^a-zA-Z0-9_-]/g,'')+'_'+key+'_1500x1500_'+Date.now()+'.jpg';
        const savedPath=path.join(saveFolder,filename);
        await writeFile(savedPath,await readFile(await prepareMainImage(state.folder,key)));
        return json(res,200,{ok:true,path:savedPath});
      }
      if(url.pathname==='/api/shutdown'){
        if(state.busy)return json(res,409,{error:'작업 중에는 종료할 수 없습니다. 중단 후 작업이 멈추면 다시 눌러 주세요.'});
        if(state.folder&&state.product)await writeFile(path.join(state.folder,'shutdown-draft.json'),JSON.stringify({product:state.product,form:b.form||null,savedAt:new Date().toISOString()},null,2));
        res.once('finish',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();});
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/open'){if(state.busy)throw Error('작업 중에는 브라우저를 다시 열 수 없습니다.');await bot.open();state.error=null;return json(res,200,{ok:true});}
      if(url.pathname==='/api/collect'){
        if(state.busy)return json(res,409,{error:'진행 중인 작업이 있습니다.'});
        if(b.allowMissingDetail===true&&state.detailFallbackRequest?.input!==b.style)return json(res,400,{error:'먼저 일반 수집으로 해당 상품의 상세 원본 누락을 확인해 주세요.'});
        const input=parseProductInput(b.style);const style=input.style||"url";bot.stopped=false;state.collectionInput=b.style;state.detailFallbackRequest=null;
        job('collect',async()=>{const folder=path.join(dataRoot,style+'-'+new Date().toISOString().replace(/[:.]/g,'-'));const product=await collect(b.style,folder,log,()=>bot.stopped,activeAbort.signal,{allowMissingDetail:b.allowMissingDetail===true});product.keywords=buildKeywords(product);state.product=product;state.folder=folder;state.revision++;log('수집 완료. 고시 이미지와 입력값을 검토해 주세요.');});return json(res,202,{ok:true});
      }
      if(url.pathname==='/api/run'){
        if(state.busy)return json(res,409,{error:'진행 중인 작업이 있습니다.'});
        if(!state.product||b.product?.style!==state.product.style)throw Error('먼저 해당 품번 정보를 수집해 주세요.');
        // Source images are server-owned: edited client data cannot redirect uploads or HTML.
        const p={...b.product,images:state.product.images,colorImages:state.product.colorImages,originalDetailUrl:state.product.originalDetailUrl,sourceCategory:state.product.sourceCategory,sourceUrl:state.product.sourceUrl,missingOriginalDetailUrl:state.product.missingOriginalDetailUrl,detailFallbackApproved:state.product.detailFallbackApproved};validateProduct(p);
        await writeFile(path.join(state.folder,'reviewed.json'),JSON.stringify(p,null,2));
        state.product=p;job('register',()=>bot.run(p,state.folder,b.finalize===true));return json(res,202,{ok:true});
      }
      if(url.pathname==='/api/continue'){state.paused=null;bot.resume();return json(res,200,{ok:true});}
      if(url.pathname==='/api/stop'){if(state.busy){state.phase='stopping';state.paused=null;activeAbort?.abort();await bot.stop();await smartBot.stop();}return json(res,200,{ok:true});}
    }
    if(req.method==='GET'&&url.pathname==='/detail-preview.html'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src https://www.giordano.co.kr; style-src 'unsafe-inline'; frame-ancestors 'none'"});
      return res.end(await readFile(path.join(root,'public','detail-preview.html')));
    }
    if(req.method==='GET'&&url.pathname==='/giordano-official-logo.png'){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(await readFile(path.join(root,'public','giordano-official-logo.png')));}
    if(req.method==='GET'&&['/','/app.js','/style.css'].includes(url.pathname)){
      const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      const types={'index.html':'text/html','app.js':'text/javascript','style.css':'text/css'};
      res.writeHead(200,{'Content-Type':types[name]+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'"});return res.end(await readFile(path.join(root,'public',name)));
    }
    json(res,404,{error:'없는 경로'});
  }catch(e){json(res,400,{error:e.message});}
});
server.listen(desktopSession?.port||0,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${server.address().port}/?key=${token}`;
  console.log('\n지오다노 등록 도우미: '+url+'\n이 창을 닫으면 프로그램이 종료됩니다.');
  if(!process.env.NO_AUTO_OPEN){const child=spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'});child.on('error',()=>{});}
});
