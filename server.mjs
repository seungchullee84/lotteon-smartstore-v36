import {prepareCareLabelImages} from './smartstore-care-label.mjs';
import {prepareSmartstoreDetail,localSmartstorePreview,saveSmartstoreDetail} from './smartstore-detail-files.mjs';
import {TEMPLATE_ASSET_NAMES} from './smartstore-detail.mjs';
import {serveBrandVideo,WOMEN_VIDEO_HASH} from './smartstore-brand-video.mjs';
import {runSmartstoreAuto} from './smartstore-auto.mjs';
import {prepareSmartstoreAuto} from './smartstore-auto-prepare.mjs';
import {loadSmartstoreAIKey,saveSmartstoreAIKey} from './smartstore-ai-settings.mjs';
import {smartstoreUploadParts} from './smartstore-detail-upload.mjs';
import {listingPreview,originalListingMain,prepareListingImages} from './smartstore-listing-images.mjs';
import {validateProduct} from './product-validation.mjs';
import {requireChannel} from './channel-routing.mjs';
import {verifyNaver,createKeywordOptimizer} from './naver-keywords.mjs';
import {generateBackground} from './background-image.mjs';
import {createReleaseTracker} from './app-release.mjs';
import {startGithubSync} from './github-sync.mjs';
import {brandingLock} from './branding-lock.mjs';
import {SmartstoreAutomation} from './smartstore-automation.mjs';
import {smartstorePlan} from './smartstore-form.mjs';
import {researchForProduct} from './apparel-tag-research.mjs';
import {createExpandedTitleOptimizer as createNaverTitleOptimizer,hasDuplicateTitleMeaning} from './naver-smart-title.mjs';
import {smartstoreTitle,assertSmartstoreTitleLength,applySelectedSmartstoreTitle,assertSmartstoreInputTitle} from './smartstore-title.mjs';
import {saveLongDetailImage} from './long-detail-image.mjs';
import {imageDownloadFolder} from './desktop-downloads.mjs';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildDetailContent} from './detail-html.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createProductEditStore} from './product-edits.mjs';
import {searchProductTags,saveSelectedProductTags,selectedProductTagResearch,removeProductTag} from './smartstore-tag-selection.mjs';
import {collect,parseProductInput,buildKeywords,repairCategoryFields} from './product.mjs';
import {LotteAutomation} from './automation.mjs';
import {prepareMainImage,backgroundImageStatus,backgroundSelection,applyExtraExclusions,excludeExtraImage} from './main-image.mjs';
import sharp from 'sharp';
import {saveIconMeaning,iconWashingResult} from './washing-icons.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const releases=createReleaseTracker(root);await releases.get();
const githubSync=process.env.REGISTER_PORTABLE==='1'?{state:{status:'portable',message:'배포 실행판'},stop(){}}:startGithubSync(root,{beforeSync:()=>releases.get()});
const dataRoot=path.join(root,'data');await mkdir(dataRoot,{recursive:true});
const productEdits=createProductEditStore(dataRoot);
let naverCredentials={clientId:process.env.NAVER_CLIENT_ID?.trim()||'',clientSecret:process.env.NAVER_CLIENT_SECRET?.trim()||''};
if(!naverCredentials.clientId||!naverCredentials.clientSecret){
  try{const saved=JSON.parse(await readFile(path.join(dataRoot,'naver-api-settings.json'),'utf8'));naverCredentials={clientId:saved.clientId||'',clientSecret:saved.clientSecret||''};}catch(e){if(e.code!=='ENOENT')throw e;}
}
let optimizeNaverTitle=createNaverTitleOptimizer();
let optimizeKeywords=createKeywordOptimizer();
let naverVerification={verified:false};
let naverLastAttempt=null;
const desktopSession=process.env.REGISTER_DESKTOP==='1'?JSON.parse(await readFile(path.join(dataRoot,'desktop-session.json'),'utf8')):null;
const token=desktopSession?.token||randomBytes(24).toString('hex');
let backgroundApiKey=await loadSmartstoreAIKey(dataRoot);
const protectedBranding=brandingLock(dataRoot);
const state={busy:false,phase:'idle',logs:[],product:null,folder:null,error:null,paused:null,revision:0,collectionInput:null,detailFallbackRequest:null,photoPreparation:null};
if(process.env.REGISTER_RESTORE){const restored=path.resolve(process.env.REGISTER_RESTORE);if(restored.startsWith(dataRoot+path.sep)){state.product=JSON.parse(await readFile(restored,'utf8'));repairCategoryFields(state.product);if(state.product.categoryMatch){state.product.fieldStatus||={};state.product.fieldStatus.category=state.product.categoryMatch.status;}state.product.keywords=buildKeywords(state.product);state.folder=path.dirname(restored);state.phase='done';state.revision=1;}}
if(state.product){state.product=await productEdits.apply(state.product);await applyExtraExclusions(state.folder,state.product);}
if(state.product&&state.folder){
  try{const previous=JSON.parse(await readFile(path.join(state.folder,'smartstore-tags-result.json'),'utf8'));if(previous.style===state.product.style){if(previous.validationOnly)state.tagValidation=previous;else state.tagResult=previous;}}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
let extraImageEdits=Promise.resolve();
function log(message){state.logs.push({time:new Date().toLocaleTimeString('ko-KR'),message});state.logs=state.logs.slice(-300);console.log(message);}
const bot=new LotteAutomation(dataRoot,log);bot.onPause=message=>{state.paused=message;};
const smartBot=new SmartstoreAutomation(dataRoot,log);
async function publishPhotoPreview(product,folder){const listing=await prepareListingImages(product,folder,{dataRoot});if(!product.smartstoreDetail?.photoCount&&!product.images?.detail&&!product.detailFallbackApproved)throw Error('상세사진 또는 공식 상세 원본을 확인해 주세요.');state.product=product;state.folder=folder;state.photoPreparation={style:product.style,status:product.smartstoreDetail.pendingPhotoCount?'needs-match':'ready',mainCount:1,extraCount:listing.extras.length,detailCount:product.smartstoreDetail.photoCount,pendingPhotoCount:product.smartstoreDetail.pendingPhotoCount||0,message:product.smartstoreDetail.pendingPhotoCount?'제공 사진 '+product.smartstoreDetail.pendingPhotoCount+'장은 색상별 매칭 대기 중입니다. 별도 구간을 만들지 않고 공식 상세 원본을 유지합니다.':undefined};state.revision++;log('미리보기 반영 완료 · 대표 1장 · 추가 '+listing.extras.length+'장 · 상세사진 '+product.smartstoreDetail.photoCount+'장');}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>1600000)throw Error('요청이 너무 큽니다.');}return JSON.parse(text||'{}');}
let activeAbort=null;
function job(phase,fn){if(state.busy)throw Error('진행 중인 작업이 있습니다.');const controller=new AbortController();activeAbort=controller;state.busy=true;state.phase=phase;state.error=null;Promise.resolve().then(fn).then(()=>{state.phase=controller.signal.aborted?'stopped':'done';}).catch(e=>{state.error=controller.signal.aborted?null:e.message;if(state.photoPreparation?.status==='preparing')state.photoPreparation={...state.photoPreparation,status:controller.signal.aborted?'stopped':'needs-review',message:controller.signal.aborted?'사진 준비를 중단했습니다.':e.message};if(['PHOTO_ANALYSIS_REQUIRED','PHOTO_FOLDER_EMPTY'].includes(e.code)&&!controller.signal.aborted)state.photoPreparation={style:state.product?.style,status:e.code==='PHOTO_ANALYSIS_REQUIRED'?'needs-analysis':'missing',photoCount:e.photoCount||0,unknownCount:e.unknownCount||0,message:e.message};if(e.code==='DETAIL_SOURCE_MISSING'&&!controller.signal.aborted)state.detailFallbackRequest={input:state.collectionInput};state.phase=controller.signal.aborted?'stopped':'error';log(controller.signal.aborted?'작업을 중단했습니다.':e.message);}).finally(()=>{state.busy=false;state.paused=null;activeAbort=null;});}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403);return res.end();}
    const port=server.address().port;
    if(req.method==='POST'&&req.headers.origin!==`http://127.0.0.1:${port}`)return json(res,403,{error:'잘못된 요청 출처'});
    const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).includes('session='+token);
    if(url.pathname==='/'&&url.searchParams.get('key')===token){res.writeHead(302,{'Set-Cookie':`session=${token}; HttpOnly; SameSite=Strict; Path=/`,'Location':'/'});return res.end();}
    if(!cookie)return json(res,403,{error:'시작 화면의 전용 링크로 접속해 주세요.'});
    if(['GET','HEAD'].includes(req.method)&&url.pathname==='/smartstore-brand-video.mp4')return await serveBrandVideo(req,res,dataRoot,url.searchParams.get('variant')==='women'?{filename:'women.mp4',expectedHash:WOMEN_VIDEO_HASH}:undefined);
    if(req.method==='GET'&&url.pathname==='/api/branding')return json(res,200,await protectedBranding.get());
    if(req.method==='GET'&&url.pathname==='/api/naver-status')return json(res,200,{configured:!!(naverCredentials.clientId&&naverCredentials.clientSecret),...naverVerification,researchConfigured:state.product?researchForProduct(state.product).configured:false,lastAttempt:naverLastAttempt});
    if(req.method==='GET'&&url.pathname==='/api/state'){
      const versions={};
      for(const key of ['main','extra1','extra2'])versions[key]=state.folder?(await backgroundImageStatus(state.folder,key)).version||null:null;
      let colorChipStatus=null;
      if(state.folder)try{colorChipStatus=JSON.parse(await readFile(path.join(state.folder,'colorchip-status.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(colorChipStatus)versions.main=(versions.main||'original')+':'+colorChipStatus.hash;
      const selected=state.folder?await backgroundSelection(state.folder):'main';
      const listing=state.product?await listingPreview(state.product,{dataRoot}):null;
      return json(res,200,{...state,folder:undefined,capabilities:{manualTags:true,photoAnalysisSettings:true},tagResearch:state.product?selectedProductTagResearch(state.product,{dataRoot}):null,smartstoreListing:listing?{previewOnly:!!listing.previewOnly,detailRevision:listing.detailRevision,mainColor:listing.main.color||'품번 폴더 사진',extraColors:listing.extras.map(p=>p.color||'제공한 상품사진'),extraRoles:listing.extras.map(p=>p.role),sourceNames:[listing.main,...listing.extras].map(p=>p.sourceName)}:null,mainImageVersion:versions.main,imageVersions:versions,colorChipStatus,backgroundSelection:selected,backgroundConfigured:!!backgroundApiKey,release:await releases.get(),githubSync:githubSync.state});
    }
    if(req.method==='GET'&&/^\/smartstore-listing\/(?:main|extra-\d+)$/.test(url.pathname)){
      if(!state.product||url.searchParams.get('style')!==state.product.style)throw Error('현재 품번을 확인해 주세요.');
      const key=url.pathname.split('/').at(-1);const file=key==='main'?await originalListingMain(state.product,{dataRoot}):(await prepareListingImages(state.product,state.folder,{dataRoot})).extras[Number(key.slice(6))];
      if(!file)return json(res,404,{});res.writeHead(200,{'Content-Type':({'.png':'image/png','.webp':'image/webp'})[path.extname(file).toLowerCase()]||'image/jpeg','Cache-Control':'no-store'});return res.end(await readFile(file));
    }
    if(req.method==='GET'&&url.pathname.startsWith('/smartstore-template/')){
      const name=url.pathname.slice('/smartstore-template/'.length);
      if(!TEMPLATE_ASSET_NAMES.includes(name))return json(res,404,{error:'없는 템플릿 파일'});
      res.writeHead(200,{'Content-Type':name.endsWith('.ttf')?'font/ttf':'image/jpeg','Cache-Control':'no-store'});
      return res.end(await readFile(path.join(root,'public','smartstore-template',name)));
    }
    if(req.method==='GET'&&/^\/smartstore-photo\/[a-f0-9]{24}$/.test(url.pathname)){
      if(!state.folder)return json(res,404,{});
      res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});
      return res.end(await readFile(path.join(state.folder,'smartstore-photo-'+url.pathname.split('/').at(-1)+'.jpg')));
    }
    if(req.method==='GET'&&url.pathname==='/smartstore-detail-preview.html'){
      const current=state.product;if(!current||!state.folder)return json(res,400,{error:'먼저 상품을 수집해 주세요.'});
      if(url.searchParams.get('style')!==current.style)return json(res,409,{error:'상품이 변경되었습니다. 상세 미리보기를 다시 열어 주세요.'});
      const fields=JSON.parse(url.searchParams.get('fields')||'{}');
      const edits={};for(const key of ['name','gender','material'])if(typeof fields[key]==='string'&&fields[key].length<500)edits[key]=fields[key];
      for(const key of ['colors','sizes'])if(Array.isArray(fields[key])&&fields[key].length<=100&&fields[key].every(v=>typeof v==='string'&&v.length<100))edits[key]=fields[key];
      const p=await prepareSmartstoreDetail({...current,...edits},state.folder);
      if(state.product!==current)return json(res,409,{error:'상품이 변경되었습니다.'});
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src 'self'; media-src 'self'; font-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"});
      return res.end(localSmartstorePreview(p).html);
    }
    if(req.method==='GET'&&url.pathname.startsWith('/image/')){
      if(/^\/image\/wash-icon-[1-9]\d*$/.test(url.pathname)&&state.folder){
        const key=url.pathname.slice(7);
        if(!state.product?.noticeAnalysis?.washingIcons?.some(i=>i.key===key))return json(res,404,{});
        res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(await readFile(path.join(state.folder,key+'.png')));
      }
      if(/^\/image\/(main|extra1|extra2)-original$/.test(url.pathname)&&state.folder){const key=url.pathname.slice(7).replace('-original','');res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(await readFile(path.join(state.folder,key+'.jpg')));}
      if(url.pathname==='/image/main'&&state.folder){const file=await prepareMainImage(state.folder);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(await readFile(file));}
      if(/^\/image\/extra[12]$/.test(url.pathname)&&state.folder){const composite=await backgroundImageStatus(state.folder,url.pathname.slice(7));if(composite.ready){res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(await readFile(composite.file));}}
      const name=url.pathname.slice(7);if((!['info','main','extra1','extra2','detail','size','check','ready','completed','stopped'].includes(name)&&!/^color[1-9]\d*_[12]$/.test(name))||!state.folder)return json(res,404,{});
      const png=['ready','completed','stopped'].includes(name);const bytes=await readFile(path.join(state.folder,name+(png?'.png':'.jpg')));
      res.writeHead(200,{'Content-Type':png?'image/png':'image/jpeg','Cache-Control':'no-store'});return res.end(bytes);
    }
    if(req.method==='POST'){
      const b=await body(req);
      requireChannel(url.pathname.slice(5),b.channel);
      if(url.pathname==='/api/naver-verify'){
        naverVerification=await verifyNaver(naverCredentials);return json(res,200,naverVerification);
      }
      if(url.pathname==='/api/naver-keywords'){
        if(state.busy||!state.product||b.style!==state.product.style)throw Error('수집 완료 후 현재 상품으로 다시 조회해 주세요.');
        const current=state.product;
        const result=await optimizeKeywords(current,naverCredentials);
        if(state.busy||state.product!==current)throw Error('상품이 변경되어 키워드를 적용하지 않았습니다.');
        return json(res,200,result);
      }
      if(url.pathname==='/api/naver-settings'){
        if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 연결해 주세요.');
        if(typeof b.clientId!=='string'||typeof b.clientSecret!=='string'||!/^\S{5,200}$/.test(b.clientId.trim())||!/^\S{5,200}$/.test(b.clientSecret.trim()))throw Error('네이버 Client ID와 Client Secret을 확인해 주세요.');
        const settings={clientId:b.clientId.trim(),clientSecret:b.clientSecret.trim()};
        naverLastAttempt={attemptedAt:new Date().toISOString(),provider:'NAVER API HUB',clientIdLength:settings.clientId.length,clientSecretLength:settings.clientSecret.length,verified:false};
        let verified;
        try{verified=await verifyNaver(settings);naverLastAttempt.verified=true;}
        catch(e){naverLastAttempt.httpStatus=e.httpStatus;naverLastAttempt.errorCode=e.apiCode;naverLastAttempt.error=e.message;throw e;}
        await writeFile(path.join(dataRoot,'naver-api-settings.json'),JSON.stringify(settings),{mode:0o600});
        naverCredentials=settings;naverVerification=verified;optimizeNaverTitle=createNaverTitleOptimizer();optimizeKeywords=createKeywordOptimizer();return json(res,200,{configured:true,...verified});
      }
      if(url.pathname==='/api/smartstore-optimize-title'){
        if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 조회해 주세요.');
        if(!state.product||b.product?.style!==state.product.style)throw Error('현재 수집한 상품을 다시 확인해 주세요.');
        const p={...state.product,name:b.product.name,gender:b.product.gender,smartstoreName:b.product.smartstoreName};
        return json(res,200,await optimizeNaverTitle(p,naverCredentials));
      }
      if(['/api/smartstore-tags','/api/smartstore-tags-validate'].includes(url.pathname)){
        if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 실행해 주세요.');
        if(!state.product||b.style!==state.product.style)throw Error('현재 상품 품번을 확인해 주세요.');
        const current=state.product,folder=state.folder,validateOnly=url.pathname.endsWith('-validate');
        if(b.selectedTags!==undefined)await saveSelectedProductTags(current,b.selectedTags,{dataRoot});
        const research=selectedProductTagResearch(current,{dataRoot});
        job('smartstore-tags',async()=>{
          const report=await smartBot.runTags(current,{validateOnly,folder,research});
          if(state.product!==current)throw Error('작업 중 상품이 변경되었습니다.');
          if(validateOnly)state.tagValidation=report;else state.tagResult=report;await writeFile(path.join(folder,'smartstore-tags-result.json'),JSON.stringify(report,null,2));
        });return json(res,202,{ok:true});
      }
      if(url.pathname==='/api/exclude-extra-image'){
        const edit=extraImageEdits.then(async()=>{
          if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 사진을 제외해 주세요.');
          if(!state.product||!state.folder||b.style!==state.product.style)throw Error('현재 상품을 다시 확인해 주세요.');
          await excludeExtraImage(state.folder,state.product,b.key);
          return {...state.product.images};
        });
        extraImageEdits=edit.catch(()=>{});
        return json(res,200,{ok:true,images:await edit});
      }
      if(url.pathname==='/api/background-selection'){
        if(!state.product||!state.folder||b.style!==state.product.style)throw Error('현재 상품을 다시 확인해 주세요.');
        if(!['main','extra1','extra2'].includes(b.key)||!state.product.images[b.key])throw Error('선택할 이미지가 없습니다.');
        await readFile(path.join(state.folder,b.key+'.jpg'));
        await writeFile(path.join(state.folder,'background-selection.json'),JSON.stringify({key:b.key,style:state.product.style}));
        return json(res,200,{ok:true,key:b.key});
      }
      if(url.pathname==='/api/background-settings'){
        if(state.busy)throw Error('작업이 끝난 뒤 합성 설정을 변경해 주세요.');
        if(typeof b.apiKey!=='string'||!/^sk-[A-Za-z0-9_-]{16,}$/.test(b.apiKey.trim()))throw Error('올바른 OpenAI API 키를 입력해 주세요.');
        backgroundApiKey=b.apiKey.trim();
        return json(res,200,{ok:true,configured:true});
      }
      if(url.pathname==='/api/smartstore-ai-settings'){
        if(state.busy)throw Error('작업이 끝난 뒤 연결 설정을 변경해 주세요.');
        backgroundApiKey=await saveSmartstoreAIKey(dataRoot,b.apiKey);
        return json(res,200,{ok:true,configured:true});
      }
      if(url.pathname==='/api/smartstore-tags-search'){
        if(state.busy||!state.product||b.style!==state.product.style)throw Error('수집 완료 후 현재 품번으로 태그를 찾아 주세요.');
        return json(res,200,searchProductTags(state.product,b.query));
      }
      if(url.pathname==='/api/smartstore-tags-remove'){
        if(state.busy||!state.product||b.style!==state.product.style)throw Error('현재 품번을 확인하고 작업 종료 후 태그를 삭제해 주세요.');
        const record=await removeProductTag(state.product,b.tag,{dataRoot});state.tagResult=null;state.tagValidation=null;
        return json(res,200,{ok:true,tags:record.tags});
      }
      if(url.pathname==='/api/smartstore-tags-selection'){
        if(state.busy||!state.product||b.style!==state.product.style)throw Error('현재 품번의 태그 선택을 확인해 주세요.');
        const record=await saveSelectedProductTags(state.product,b.tags,{dataRoot});state.tagResult=null;state.tagValidation=null;
        return json(res,200,{ok:true,tags:record.tags,saved:true});
      }
      if(url.pathname==='/api/smartstore-tags-selected'){
        if(state.busy||!state.product||b.style!==state.product.style)throw Error('현재 품번의 태그 선택을 확인해 주세요.');
        const current=state.product,folder=state.folder;
        await saveSelectedProductTags(current,b.tags,{dataRoot});
        job('smartstore-tags',async()=>{const report=await smartBot.runTags(current,{folder,research:selectedProductTagResearch(current,{dataRoot})});state.tagResult=report;await writeFile(path.join(folder,'smartstore-tags-result.json'),JSON.stringify(report,null,2));});
        return json(res,202,{ok:true});
      }
      if(url.pathname==='/api/smartstore-auto'){
        if(state.busy)throw Error('진행 중인 작업이 있습니다.');
        parseProductInput(b.style);
        if(b.edits)await productEdits.save(b.edits,state.product?.style);
        const selectedTitle=b.selectedTitle;const input=b.style,key=backgroundApiKey;const previous=state.product;const parsedInput=parseProductInput(input);const sourceUrlHint=previous&&(parsedInput.style===previous.style||parsedInput.url===previous.sourceUrl)?previous.sourceUrl:null;smartBot.stopped=false;bot.stopped=false;
        job('smartstore-auto',async()=>{
          const signal=activeAbort.signal;
          const result=await runSmartstoreAuto({input,apiKey:key,signal,log,step:name=>{state.autoStep=name;},
            preflight:()=>smartBot.preflight(),
            collect:async value=>{
              const folder=path.join(dataRoot,'smartstore-auto-'+Date.now());
              let product=await collect(value,folder,log,()=>signal.aborted,signal,{saveSmartstoreSource:true,sourceUrlHint,noticeCacheRoot:path.join(dataRoot,'smartstore-notice-cache'),prepareMain:false});
              product.keywords=buildKeywords(product);
              product=await productEdits.apply(product);
              if(selectedTitle){Object.assign(product,applySelectedSmartstoreTitle(product,selectedTitle));log('현재 전용 상품명 그대로 사용 · 자동 재작성 없음');}
              else{product.smartstoreName=smartstoreTitle(product);
              const optimized=await optimizeNaverTitle(product,naverCredentials);
              product.smartstoreName=optimized.title;log('상품명 자동 최적화 · '+optimized.source);
              assertSmartstoreTitleLength(product.smartstoreName);
              }
              smartstorePlan(product,product.consumerPrice);
              return {product,folder};
            },
            onProduct:async(product,folder)=>{state.product=product;state.folder=folder;state.photoPreparation={style:product.style,status:'preparing'};state.revision++;},
            onPrepared:publishPhotoPreview,
            prepare:(p,folder)=>prepareSmartstoreAuto(p,folder,{dataRoot,apiKey:key,signal,log}),
            includeMain:false,
            render:async(p,folder)=>{
              const output=path.join(await imageDownloadFolder(),p.style+'_스마트스토어자동상세_'+Date.now()+'.png');
              const detail=await saveSmartstoreDetail(p,folder,output,{signal,log});return {...detail,path:output};
            },
            upload:async(p,folder,{main,detail})=>{
              const selected=await prepareListingImages(p,folder,{dataRoot});
              const detailParts=await smartstoreUploadParts(detail.path,folder,path.join(root,'public/smartstore-template/brand-intro.jpg'),{includeVideo:detail.includeVideo,dataRoot,videoOptions:detail.videoOptions,brandIntroHeight:detail.brandIntroHeight,footerTop:detail.footerTop});
              const careLabels=await prepareCareLabelImages(p,folder,{dataRoot});
              return smartBot.uploadPrepared(p,folder,{main:selected.main,extras:selected.extras,detailParts,careLabels});
            }
          });
          state.autoStep='done';await writeFile(path.join(result.folder,'smartstore-auto-completed.json'),JSON.stringify(result,null,2));
        });return json(res,202,{ok:true});
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
        assertSmartstoreInputTitle(smartstoreTitle(b.product),b.product?.smartstoreNameUserEdited);
        if(!b.product?.smartstoreNameUserEdited&&hasDuplicateTitleMeaning(b.product,smartstoreTitle(b.product)))throw Error('스마트스토어 상품명에 같은 의미의 단어가 반복됩니다. 중복 표현을 제거해 주세요.');
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
        const current=state.product;
        if(b.channel==='smartstore'){
          if(b.product?.style!==current.style)throw Error('현재 상품을 다시 확인해 주세요.');
          const edits={};for(const key of ['name','gender','material'])if(typeof b.product[key]==='string')edits[key]=b.product[key].slice(0,500);
          for(const key of ['colors','sizes'])if(Array.isArray(b.product[key])&&b.product[key].length<=100&&b.product[key].every(v=>typeof v==='string'&&v.length<100))edits[key]=b.product[key];
          const p={...current,...edits};const saveFolder=await imageDownloadFolder();
          const savedPath=path.join(saveFolder,p.style+'_스마트스토어상세_'+Date.now()+'.png');
          const controller=new AbortController();activeAbort=controller;state.busy=true;state.phase='smartstore-detail';state.error=null;
          try{
            const dimensions=await saveSmartstoreDetail(p,state.folder,savedPath,{signal:controller.signal});
            state.phase='done';log('스마트스토어 확정 템플릿 상세페이지 저장 완료 · 품번 '+p.style);
            return json(res,200,{ok:true,path:savedPath,...dimensions});
          }catch(e){state.phase=controller.signal.aborted?'stopped':'error';state.error=controller.signal.aborted?null:e.message;throw e;}
          finally{state.busy=false;activeAbort=null;}
        }
        const p=current;
        const saveFolder=await imageDownloadFolder();
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
        const saveFolder=await imageDownloadFolder();
        const key=b.image||'main';
        if(b.channel==='smartstore'){
          const files=await prepareListingImages(state.product,state.folder,{dataRoot});
          const file=key==='main'?files.main:/^extra-\d+$/.test(key)?files.extras[Number(key.slice(6))]:null;
          if(!file)throw Error('저장할 스마트스토어 사진을 확인해 주세요.');
          const savedPath=path.join(saveFolder,state.product.style+'_스마트스토어_'+key+'_'+Date.now()+path.extname(file).toLowerCase());await writeFile(savedPath,await readFile(file));return json(res,200,{ok:true,path:savedPath});
        }
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
        if(b.edits)await productEdits.save(b.edits,state.product?.style);
        job('collect',async()=>{const folder=path.join(dataRoot,style+'-'+new Date().toISOString().replace(/[:.]/g,'-'));let product=await collect(b.style,folder,log,()=>bot.stopped,activeAbort.signal,{allowMissingDetail:b.allowMissingDetail===true,saveSmartstoreSource:b.channel==='smartstore',noticeCacheRoot:b.channel==='smartstore'?path.join(dataRoot,'smartstore-notice-cache'):undefined,prepareMain:b.channel!=='smartstore'});product.keywords=buildKeywords(product);product=await productEdits.apply(product);state.product=product;state.folder=folder;state.photoPreparation=null;state.revision++;if(b.channel==='smartstore'){state.photoPreparation={style:product.style,status:'preparing'};try{const prepared=await prepareSmartstoreAuto(product,folder,{dataRoot,apiKey:backgroundApiKey,signal:activeAbort.signal,log});await publishPhotoPreview(prepared,folder);}catch(error){if(error.code!=='PHOTO_FOLDER_EMPTY')throw error;state.photoPreparation={style:product.style,status:'missing',message:error.message};log(error.message);}}log('수집 완료. 고시 이미지와 입력값을 검토해 주세요.'+(Object.keys(product.userEditedFields||{}).length?' · 직접 수정한 항목 유지':''));});return json(res,202,{ok:true});
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
      if(url.pathname==='/api/stop'){if(state.busy){const phase=state.phase;state.phase='stopping';state.paused=null;activeAbort?.abort();if(phase==='register')await bot.stop();if(phase==='smartstore'||phase==='smartstore-auto')await smartBot.stop();}return json(res,200,{ok:true});}
    }
    if(req.method==='GET'&&url.pathname==='/detail-preview.html'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src https://www.giordano.co.kr; style-src 'unsafe-inline'; frame-ancestors 'none'"});
      return res.end(await readFile(path.join(root,'public','detail-preview.html')));
    }
    if(req.method==='GET'&&url.pathname==='/giordano-official-logo.png'){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(await readFile(path.join(root,'public','giordano-official-logo.png')));}
    if(req.method==='GET'&&url.pathname==='/smartstore-title.mjs'){
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
      return res.end(await readFile(path.join(root,'smartstore-title.mjs')));
    }
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
