import {load} from 'cheerio';

const officialHosts=new Set(['www.giordano.co.kr','giordano.co.kr']);
const compact=value=>String(value??'').replace(/\s+/g,'');
const hashPattern=/^[a-f0-9]{32}$/i;
const fail=(message,code='OFFICIAL_COLOR_SOURCE_MISMATCH')=>Object.assign(new Error(message),{code});

function officialUrl(value){
 let url;try{url=new URL(value);}catch{throw fail('공식 상품 주소를 확인해 주세요.');}
 if(url.protocol!=='https:'||!officialHosts.has(url.hostname)||url.port||url.username||url.password)throw fail('공식 상품 주소를 확인해 주세요.');
 return url;
}
function productUrl(product){
 const url=officialUrl(product?.sourceUrl);
 if(!/^\d{6}$/.test(product?.style||'')||url.pathname!=='/shop/detail.php'||!hashPattern.test(url.searchParams.get('pno')||'')||url.searchParams.getAll('pno').length!==1)throw fail('공식 상품의 품번과 상품 주소를 확인해 주세요.');
 url.hash='';return url;
}
function imageUrl(value){
 const url=officialUrl(value);
 if(!url.pathname.startsWith('/_data/attach/')||!/^\/_data\/attach\/(?:[^/]+\/)*[^/]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)||/%(?:2e|2f|5c)/i.test(url.pathname))throw fail('공식 색상 사진 원본 주소가 아닙니다.','OFFICIAL_COLOR_IMAGE_INVALID');
 url.hash='';return url.href;
}

// Match explicit page identity and chip option values, never filename guesses.
export function parseOfficialColorOptions(product,html){
 const url=productUrl(product),$=load(html),form=$('form[name="prdFrm"]');
 if(form.length!==1)throw fail('공식 상품 선택 정보를 확인하지 못했습니다.');
 const oneValue=name=>{const fields=form.find('input[name="'+name+'"]');if(fields.length>1)throw fail('공식 상품 선택 정보가 중복되었습니다.');return String(fields.val()||'').trim();};
 const sourceProductHash=oneValue('pno'),parentHash=oneValue('ppno');
 if(!hashPattern.test(sourceProductHash)||sourceProductHash.toLowerCase()!==url.searchParams.get('pno').toLowerCase()||(parentHash&&!hashPattern.test(parentHash)))throw fail('현재 상품과 공식 페이지의 상품 번호가 다릅니다.');
 const named=$('.style_code_gio[data-clipboard-text]').map((_,node)=>$(node).attr('data-clipboard-text')).get();
 const body=$('body').clone();body.find('script,style').remove();
 const displayed=body.find('*').addBack().contents().filter((_,node)=>node.type==='text').map((_,node)=>$(node).text()).get().join(' ');
 const declared=[...displayed.matchAll(/\bSTYLE\s*[.:]\s*((?:\d{2})?\d{6})(?!\d)/gi)].map(match=>match[1]);
 const styles=[...named,...declared].map(value=>/^(?:\d{2})?\d{6}$/.test(value)?value.slice(-6):null);
 if(!styles.length||styles.some(style=>style!==product.style))throw fail('현재 품번과 공식 페이지의 STYLE 번호가 다릅니다.');
 const colorMap=new Map();
 for(const color of product.colors||[]){const key=compact(color);if(!key||colorMap.has(key))throw fail('공식 상품 색상 목록을 확인해 주세요.');colorMap.set(key,color);}
 const options=[],failures=[];
 for(const node of $('a.gio_opt_img_list').toArray()){
  const chip=$(node),label=String(chip.find('img[alt]').first().attr('alt')||'').trim(),color=colorMap.get(compact(label));
  if(!color)continue;
  const match=String(chip.attr('onclick')||'').match(/^\s*selectOptionChip\(\s*(\d+)\s*,\s*(['"])(.*?)\2\s*,\s*this\s*,\s*(['"])\4\s*\)\s*;?\s*(?:return\s+false\s*;?)?\s*$/);
  const parts=match?.[3].split('::'),optionId=String(chip.attr('data')||'');
  if(!match||!/^[1-9]\d*$/.test(match[1])||!/^\d+$/.test(optionId)||parts[3]!==optionId||compact(parts[0])!==compact(label)||(chip.find('.value').length&&compact(chip.find('.value').text())!==compact(label))){failures.push({color,message:'공식 색상명과 선택 번호가 일치하지 않습니다.'});continue;}
  const option={color,label,optionNo:match[1],optionId};
  const previous=options.find(entry=>entry.color===color);
  if(previous&&(previous.optionNo!==option.optionNo||previous.optionId!==option.optionId)){failures.push({color,message:'공식 색상 선택 번호가 중복되어 확인이 필요합니다.'});continue;}
  if(!previous)options.push(option);
 }
 for(const option of options){if(options.some(other=>other.color!==option.color&&other.optionNo===option.optionNo&&other.optionId===option.optionId))failures.push({color:option.color,message:'서로 다른 색상이 같은 공식 선택 번호를 사용합니다.'});}
 return {style:product.style,sourceUrl:url.href,sourceProductHash,productHash:parentHash||sourceProductHash,options:options.filter(option=>!failures.some(failure=>failure.color===option.color)),failures};
}

// The API identifies a color's gallery; it does not certify a front-facing pose.
export function parseOfficialColorResponse(option,payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.html!=='string'||!Array.isArray(payload.files)||!payload.files.length)throw fail('공식 색상 사진 응답을 확인하지 못했습니다.','OFFICIAL_COLOR_RESPONSE_INVALID');
 const mainImageUrl=imageUrl(payload.main_img),files=payload.files.map(imageUrl),$=load(payload.html);
 const images=[];
 for(const node of $('img.product_image_tooltip_image_gio[data-image_no]').toArray()){
  const image=$(node),url=imageUrl(image.attr('src'));
  if(!files.includes(url))throw fail('공식 색상 사진 목록과 썸네일이 일치하지 않습니다.','OFFICIAL_COLOR_RESPONSE_INVALID');
  if(!images.some(entry=>entry.url===url))images.push({url,imageId:String(image.attr('data-image_no')||''),productCut:image.attr('data-is_product_cut')||''});
 }
 if(!images.length||!files.includes(mainImageUrl)||!images.some(image=>image.url===mainImageUrl))throw fail('공식 색상 대표사진이 해당 색상 목록에 없습니다.','OFFICIAL_COLOR_RESPONSE_INVALID');
 return {...option,mainImageUrl,images};
}

async function fetchText(url,{fetchImpl,signal,timeoutMs,sourceUrl}){
 signal?.throwIfAborted();
 const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(new DOMException('공식 색상 조회 시간 초과','TimeoutError')),timeoutMs);
 const requestSignal=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal;
 let onAbort;
 const aborted=new Promise((_,reject)=>{onAbort=()=>reject(requestSignal.reason);requestSignal.addEventListener('abort',onAbort,{once:true});});
 try{
  return await Promise.race([aborted,(async()=>{
   const response=await fetchImpl(url,{signal:requestSignal,redirect:'error',headers:{Referer:sourceUrl}});
   requestSignal.throwIfAborted();
   if(!response.ok)throw fail('공식 색상 조회 HTTP '+response.status,'OFFICIAL_COLOR_FETCH_FAILED');
   if(response.redirected||(response.url&&response.url!==url))throw fail('공식 색상 조회 주소가 변경되어 중단했습니다.');
   const text=await response.text();requestSignal.throwIfAborted();
   if(text.length>4_000_000)throw fail('공식 색상 조회 응답이 너무 큽니다.','OFFICIAL_COLOR_RESPONSE_INVALID');
   return text;
  })()]);
 }finally{clearTimeout(timer);requestSignal.removeEventListener('abort',onAbort);}
}

export async function collectOfficialColorSources(product,{html,colors=product.colors,fetchImpl=fetch,signal,timeoutMs=15000}={}){
 const sourceUrl=productUrl(product).href;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new TypeError('공식 색상 조회 제한 시간을 확인해 주세요.');
 signal?.throwIfAborted();
 const source=parseOfficialColorOptions(product,html??await fetchText(sourceUrl,{fetchImpl,signal,timeoutMs,sourceUrl}));
 const requested=[...new Set(colors||[])];
 if(requested.some(color=>!product.colors.includes(color)))throw fail('현재 상품에 없는 색상은 공식 사진을 조회하지 않습니다.');
 const result={style:source.style,sourceUrl:source.sourceUrl,productHash:source.productHash,sourceProductHash:source.sourceProductHash,colors:[],failures:[]};
 let next=0;const outcomes=new Array(requested.length);
 await Promise.all(Array.from({length:Math.min(2,requested.length)},async()=>{
  while(next<requested.length){
   signal?.throwIfAborted();const index=next++,color=requested[index];
   try{
    const option=source.options.find(entry=>entry.color===color);
    if(!option)throw fail(source.failures.find(entry=>entry.color===color)?.message||'공식 페이지에서 해당 색상 선택을 찾지 못했습니다.');
    const request=new URL('/main/exec.php',sourceUrl);
    request.search=new URLSearchParams({exec_file:'shop/getAjaxData.php',exec:'getAddImgList',hash:source.productHash,opt_no:option.optionNo,ino:option.optionId,product_cut:'',custom_head_img_gio:''});
    const requestUrl=request.href,text=await fetchText(requestUrl,{fetchImpl,signal,timeoutMs,sourceUrl});
    let payload;try{payload=JSON.parse(text);}catch{throw fail('공식 색상 조회 응답이 JSON이 아닙니다.','OFFICIAL_COLOR_RESPONSE_INVALID');}
    outcomes[index]={entry:{...parseOfficialColorResponse(option,payload),requestUrl}};
   }catch(error){signal?.throwIfAborted();outcomes[index]={failure:{color,message:error.name==='TimeoutError'?'공식 색상 사진 조회 시간이 초과되었습니다.':error.message}};}
  }
 }));
 for(const outcome of outcomes){
  if(outcome.failure){result.failures.push(outcome.failure);continue;}
  const entry=outcome.entry;
  if(outcomes.some(other=>other.entry&&other.entry.color!==entry.color&&other.entry.mainImageUrl===entry.mainImageUrl))result.failures.push({color:entry.color,message:'서로 다른 색상에 같은 공식 대표사진이 반환되어 사용하지 않았습니다.'});
  else result.colors.push(entry);
 }
 signal?.throwIfAborted();return result;
}
