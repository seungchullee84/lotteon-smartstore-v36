import {load} from 'cheerio';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
export const NEW_LIST_INTERVAL=25*60*1000;
const listing='https://www.giordano.co.kr/shop/big_section.php?cno1=2375';
export function parseNewListing(html){
 const $=load(html);if(/Request Rejected|Access Denied/i.test($('title').text()))throw Error('공식몰 목록 접근 제한');
 const links=$('a[href*="detail.php?pno="]');if(!links.length)throw Error('신상품 목록을 읽지 못했습니다. 기존 기록 유지');
 const products=new Map();for(const el of links.toArray()){
  const a=$(el),u=new URL(a.attr('href'),listing),id=u.searchParams.get('pno');if(u.origin!=='https://www.giordano.co.kr'||!/^[a-f0-9]{16,64}$/i.test(id||''))continue;
  const box=a.closest('.box');const name=box.find('.name,.prd_name,.prdname,.product_name').first().text().trim()||a.text().trim()||box.find('.info').text().replace(/\s+/g,' ').trim();
  const text=name||box.text().replace(/\s+/g,' ').trim();if(/JUNIOR|KIDS|BOYS|GIRLS|주니어|키즈|아동|여아|남아/i.test(text))continue;
  const style=text.match(/(?:^|\D)(\d{6})(?!\d)/)?.[1]||box.find('img[src*="colorchip_auto"]').first().attr('src')?.match(/colorchip_auto\/(?:\d{2})(\d{6})\d{2}\./)?.[1]||'확인 필요';
  products.set(id.toLowerCase(),{id:id.toLowerCase(),style,name:name||'공식 신상품 목록 상품',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+id,changes:[],status:'on-demand'});
 }
 const pages=Number($('.more_count .total').first().text())||1;if(pages<1||pages>32)throw Error('신상품 목록 페이지 범위 확인 필요');
 return {products:[...products.values()],pages};
}
export async function checkNewListing({file,fetchImpl=fetch,now=new Date().toISOString(),transport='http'}){
 let bytes=0,requests=0;const read=async url=>{
  requests++;const r=await fetchImpl(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('공식몰 목록 응답 '+r.status);
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;bytes+=chunk.length;if(size>1024*1024||bytes>8*1024*1024)throw Error('목록 응답 용량 제한');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');
 };
 const first=parseNewListing(await read(listing)),products=new Map(first.products.map(p=>[p.id,p]));
 for(let page=2;page<=first.pages;page++){
  const u=new URL('/main/exec.php',listing);u.search=new URLSearchParams({exec_file:'skin_module/skin_ajax.php',obj_id:'prd_basic',_tmp_file_name:'shop/big_section.php',single_module:'prd_basic',striplayout:'1',module_page:String(page),document_url:listing,cno1:'2375'}).toString();
  const response=JSON.parse(await read(u));if(typeof response.content!=='string')throw Error('더보기 목록 응답 확인 필요');for(const p of parseNewListing(response.content).products)products.set(p.id,p);
 }
 let old;try{old=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const seen=new Set(old?.seenIds||[]);const events=old?[...products.values()].filter(p=>!seen.has(p.id)).map(p=>({...p,type:'new',firstCheckedAt:now})):[];
 const state={mode:'new-list-only',intervalMinutes:25,checkedAt:now,nextCheckAt:new Date(Date.parse(now)+NEW_LIST_INTERVAL).toISOString(),baselineAt:old?.baselineAt||now,seenIds:[...new Set([...seen,...products.keys()])],batches:[...(old?.batches||[]),{checkedAt:now,events}].slice(-100),errors:0,metrics:{requests,bytes,transport}};
 await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(state));await rename(file+'.tmp',file);return state;
}
export function retryDelay(failures){return Math.min(NEW_LIST_INTERVAL,5*60*1000*2**Math.max(0,failures-1));}
export async function checkNewListingWithRecovery(options){
 try{return await checkNewListing(options);}catch(error){
  if(!/공식몰 목록|fetch failed|timeout|aborted/i.test(error.message))throw error;
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  try{
   const page=await browser.newPage();
   const fetchImpl=async url=>{
    const response=await page.goto(String(url),{waitUntil:'domcontentloaded',timeout:30000});
    if(!response)throw Error('공식몰 브라우저 응답 없음');
    const body=await response.body();
    return {ok:response.ok(),status:response.status(),body:[body]};
   };
   return await checkNewListing({...options,fetchImpl,transport:'browser'});
  }finally{await browser.close();}
 }
}
export function startNewListingMonitor(root,{check=checkNewListingWithRecovery,clock=()=>Date.now(),onSnapshot=()=>{}}={}){
 const state={status:'website-only',message:'홈페이지 신상품 목록 확인 · 소구점은 품번별 요청 시 조사',imageComplete:0,total:0};let stopped=false,busy=false,timer;
 const file=path.join(root,'data','official-benefit-catalog','new-list-check.json');
 let pending=null;
 async function run(force=false){if(stopped)return state;if(pending)return pending;pending=(async()=>{busy=true;try{
  if(!state.website)try{state.website=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(force||state.lastError||!state.website||clock()>=Date.parse(state.website.nextCheckAt)){
   state.lastAttemptAt=new Date(clock()).toISOString();
   state.website=await check({file});state.consecutiveErrors=0;state.lastError=null;
  }
  state.nextAttemptAt=state.website.nextCheckAt;
  onSnapshot(state.website);
  state.message='홈페이지 신상품 목록 25분 간격 확인 · 소구점은 품번별 요청 시 조사';
 }catch(e){state.consecutiveErrors=(state.consecutiveErrors||0)+1;state.lastError=e.message;state.nextAttemptAt=new Date(clock()+retryDelay(state.consecutiveErrors)).toISOString();const time=new Date(state.nextAttemptAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});state.message='홈페이지 신상품 확인 지연 · '+e.message+' · '+time+' 재확인 예정';}finally{busy=false;}
 return state;})();try{return await pending;}finally{pending=null;clearTimeout(timer);if(!stopped){timer=setTimeout(()=>run(),Math.min(NEW_LIST_INTERVAL,Math.max(1000,Date.parse(state.nextAttemptAt)-clock()))||NEW_LIST_INTERVAL);timer.unref();}}}
 const ready=run();return {state,ready,async refresh(){clearTimeout(timer);return run(true);},stop(){stopped=true;clearTimeout(timer);}};
}
