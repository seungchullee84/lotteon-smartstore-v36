import {resolveCatalogCategory} from './category-catalog.mjs';
import {isMensUnderwear,MENS_UNDERWEAR_CATEGORY,brushedTrainingCategory} from './category.mjs';
import {officialColorChips,collectColorChips} from './color-chips.mjs';
import {prepareMainImage} from './main-image.mjs';
import {normalizeCountry} from './country.mjs';
export {normalizeCountry} from './country.mjs';
import * as cheerio from 'cheerio';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import {analyzeNotice} from './notice.mjs';
import {analyzeNoticeCached} from './notice-cache.mjs';
import {enrichOfficialProductFacts} from './apparel-product-facts.mjs';
import {readSourceImage,inspectDetailSource,sourceImageCandidates} from './source-image.mjs';
import {extractEmbeddedNotice} from './embedded-notice.mjs';

export const OFFICIAL = 'https://www.giordano.co.kr';
const juniorPattern=/주니어|쥬니어|키즈|아동|어린이|유아|(?:^|[^a-z])(?:junior|juniors|kids|kid|children|boys|girls)(?:$|[^a-z])/i;
export function assertAdultProduct(product){
  const evidence=[product.rawName,product.name,...(product.sourceCategory||[])];
  if(product.sourceUrl){try{const brand=new URL(product.sourceUrl).searchParams.get('brand');if(brand)evidence.push(brand.replaceAll('_',' '));}catch{}}
  if(evidence.some(value=>juniorPattern.test(String(value||'')))){
    const error=Error('주니어 상품으로 확인되어 적용하지 않았습니다. 성인 상품의 품번 또는 공식몰 상품 URL을 확인해 주세요.');
    error.code='JUNIOR_PRODUCT';throw error;
  }
}
export function assertAdultProductPage(html,sourceUrl){
  const $=cheerio.load(html);
  // Read this product's title and breadcrumb, never the shared site menu.
  const nav=$('.navi').filter((_,el)=>$(el).find('a.prdpath1').length>0).first();
  const rawName=$('title').text().split(' - ')[0].trim();
  assertAdultProduct({sourceUrl,rawName,name:rawName?'':$('h3').first().clone().children('a').remove().end().text(),sourceCategory:nav.find('a').map((_,el)=>$(el).text().trim()).get()});
}
export async function findAdultProductUrl(links,style,readCandidate,cancelled=()=>false){
  let juniorFound=false;
  for(const candidate of links){
    if(cancelled())throw Error('사용자가 중단했습니다.');
    if(new URL(candidate).origin!==OFFICIAL)continue;
    const html=await readCandidate(candidate);if(!html)continue;
    let actual;try{actual=styleFromDetail(html);}catch{continue;}
    if(actual!==style)continue;
    try{assertAdultProductPage(html,candidate);}catch(error){if(error.code!=='JUNIOR_PRODUCT')throw error;juniorFound=true;continue;}
    return candidate;
  }
  if(juniorFound)assertAdultProduct({sourceCategory:['JUNIOR']});
  throw Error('검색 결과에서 실제 품번 '+style+' 상품을 찾지 못했습니다. 공식몰 상품 URL을 확인해 주세요.');
}
export function productClassification(html) {
  const $=cheerio.load(html);
  // Only the product breadcrumb is authoritative. Global menus contain both sexes.
  const majors=$('.navi a.prdpath1').map((_,e)=>$(e).text().trim().toUpperCase()).get();
  const unique=[...new Set(majors)];
  const gender=unique.length===1?({WOMEN:'여성',MEN:'남성'}[unique[0]]||''):'';
  const nav=$('.navi').filter((_,el)=>$(el).find('a.prdpath1').length>0).first();
  const sourceCategory=nav.find('a').map((_,e)=>$(e).text().trim()).get().slice(1,-1);
  const category={commonMiddle:'',commonSmall:'',channelMiddle:'',channelSmall:''};
  const itemTitle=(nav.find('a').last().text()||$('title').text()).replace(/트리코트/g,'');
  if(gender&&/벨트/.test(itemTitle))Object.assign(category,{commonMajor:'L0022 : 가방/피혁잡화',commonMiddle:'M0307 : 벨트',commonSmall:gender==='남성'?'01033 : 남성벨트':'01032 : 여성벨트',channelMajor:'브랜드가방',channelMiddle:'벨트',channelSmall:gender+'벨트'});
  if(gender&&sourceCategory.includes('PANTS')){
    const kind=sourceCategory.join(' ')+' '+nav.find('a').last().text();
    Object.assign(category,{commonMiddle:gender+'의류하의',commonSmall:gender+'바지',channelMiddle:/데님|진/.test(kind)?'청바지':/트레이닝|스웻|스웨트|조거/.test(kind)?'트레이닝복':'바지',channelSmall:/데님|청바지|진/.test(kind)?(/와이드|부츠컷|배럴|벌룬/.test(kind)?'부츠컷/와이드핏':/스키니|슬림/.test(kind)?'스키니/슬림핏':'스트레이트핏'):/트레이닝|스웻|스웨트|조거/.test(kind)?'트레이닝하의':/기모|브러시드|브러쉬드/.test(kind)?'기모팬츠':/슬랙스/.test(kind)?'슬랙스':'면바지'});
  }
  if(gender&&sourceCategory.includes('OUTER')){const title=itemTitle;const small=/코트/.test(title)?'코트':/패딩|다운/.test(title)?'패딩':/무스탕/.test(title)?'무스탕':sourceCategory.some(x=>/캐주얼(?:자켓|재킷)/.test(x))?'캐주얼자켓':'재킷';Object.assign(category,{commonMiddle:gender+'의류아우터',commonSmall:gender+(/코트/.test(title)?'코트':'자켓'),channelMiddle:/코트|무스탕/.test(title)?'코트':/패딩|다운|점퍼|푸퍼/.test(title)?'점퍼/패딩/야상':'자켓/코트',channelSmall:small});}
  if(gender&&sourceCategory.includes('TOP')){
    if(sourceCategory.includes('맨투맨/후드'))Object.assign(category,{commonMiddle:gender+'의류상의',commonSmall:gender==='남성'?'00681 : 남성스웨트셔츠/후드/집업':gender+'티셔츠/탑',channelMiddle:'티셔츠/맨투맨',channelSmall:/후드/.test(nav.find('a').last().text())?'후드티셔츠':'맨투맨'});
    else if(sourceCategory.includes('긴팔티'))Object.assign(category,{commonMiddle:gender+'의류상의',commonSmall:gender==='남성'?'00675 : 남성티셔츠':gender+'티셔츠/탑',channelMiddle:'티셔츠/맨투맨',channelSmall:'라운드넥티셔츠'});
  }
  if(gender&&sourceCategory.includes('TOP')&&sourceCategory.some(x=>/니트|가디건|스웨터/.test(x))){
    const title=itemTitle;
    const cardigan=/가디건|카디건/.test(title);
    Object.assign(category,{commonMiddle:gender+'의류상의',commonSmall:gender+(cardigan?'가디건':'니트/스웨터'),channelMiddle:'니트/가디건',channelSmall:cardigan?'가디건':/브이넥|V넥/i.test(title)?'브이넥니트':/터틀|폴라|목폴라/.test(title)?'터틀넥/폴라니트':/집업/.test(title)?'집업니트':'라운드넥니트'});
  }
  if(gender){
    const title=itemTitle;
    if(/코트/.test(title)&&sourceCategory.includes('OUTER')){
      const small=/트렌치/.test(title)?'트렌치코트':/패딩|다운/.test(title)?'패딩/다운코트':/하프|숏|쇼트/.test(title)?'하프코트':'롱코트';
      Object.assign(category,{commonMiddle:gender+'의류아우터',commonSmall:gender+'코트',channelMiddle:'자켓/코트',channelSmall:small});
    }
  }
  if(gender&&sourceCategory.includes('OUTER')){
    const title=itemTitle;
    if(/패딩|푸퍼|다운/.test(title)&&!/코트/.test(title))Object.assign(category,{commonMiddle:gender+'의류아우터',commonSmall:gender+'점퍼',channelMiddle:'점퍼/패딩/야상',channelSmall:'패딩/다운점퍼'});
  }
  if(gender&&sourceCategory.includes('OUTER')&&/윈드브레이커|바람막이/.test(sourceCategory.join(' ')+' '+itemTitle))Object.assign(category,{commonMiddle:gender+'의류아우터',commonSmall:gender+'점퍼',channelMiddle:'점퍼/패딩/야상',channelSmall:'바람막이점퍼'});
  // Only mappings verified against the partner portal are prefilled.
  if(gender==='여성'&&sourceCategory.includes('TOP')&&sourceCategory.includes('긴팔티'))Object.assign(category,{commonMiddle:'M0210 : 여성의류상의',commonSmall:'00843 : 여성티셔츠/탑',channelMiddle:'티셔츠/맨투맨',channelSmall:'라운드넥티셔츠'});
  // Fall back to the product name when the official breadcrumb has no mapping.
  if(isMensUnderwear({gender,sourceCategory,rawName:itemTitle}))Object.assign(category,MENS_UNDERWEAR_CATEGORY);
  if(gender&&!category.commonMiddle){
    const title=itemTitle;
    const upper=(small,middle,channel)=>Object.assign(category,{commonMiddle:gender+'의류상의',commonSmall:gender+small,channelMiddle:middle,channelSmall:channel});
    if(/가디건|카디건/.test(title))upper('가디건','니트/가디건','가디건');
    else if(/니트|스웨터|풀오버/.test(title))upper('니트/스웨터','니트/가디건','니트/스웨터');
    else if(/후드|맨투맨|스웨트셔츠/.test(title))upper('스웨트셔츠/후드/집업','티셔츠/맨투맨',/후드/.test(title)?'후드티셔츠':'맨투맨');
    else if(/티셔츠|반팔티|긴팔티/.test(title))upper(gender==='여성'?'티셔츠/탑':'티셔츠','티셔츠/맨투맨','라운드넥티셔츠');
    else if(/블라우스/.test(title))upper('블라우스','셔츠/블라우스','블라우스');
    else if(/셔츠|남방/.test(title))upper('셔츠','셔츠/남방','셔츠');
    else if(/팬츠|바지|슬랙스|데님/.test(title))Object.assign(category,{commonMiddle:gender+'의류하의',commonSmall:gender+'바지',channelMiddle:/데님|청바지/.test(title)?'청바지':/트레이닝|스웨트|스웻/.test(title)?'트레이닝복':'바지',channelSmall:/데님|청바지/.test(title)?'청바지':/슬랙스/.test(title)?'슬랙스':/트레이닝|스웨트|스웻/.test(title)?'트레이닝바지':'면바지'});
  }
  // 2026-10-26 partner portal popup: filtered lookup returns 2076 머플러 / N.
  // This is the common classification, not the separate LotteON display tree.
  if(/머플러|\bMUFFLER\b/i.test(itemTitle))Object.assign(category,{commonMajor:'L0001 : 패션/장신',commonMiddle:'M0357 : 패션액세서리',commonSmall:'01068 : 머플러'});
  const brushed=brushedTrainingCategory({gender,sourceCategory,rawName:itemTitle,category});if(brushed)Object.assign(category,brushed);
  return {gender,sourceCategory,category};
}
export function validateStyle(value) {
  if (!/^\d{6}$/.test(String(value))) throw Error('품번은 숫자 6자리로 입력해 주세요.');
  return String(value);
}
export function repairCategoryFields(product){
  if(!product.category||!product.sourceCategory?.length)return;
  const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const links=product.sourceCategory.map((s,i)=>'<a'+(i===0?' class="prdpath1"':'')+'>'+escape(s)+'</a>').join('');
  const suggested=productClassification('<div class="navi"><a>Home</a>'+links+'<a>'+escape(product.rawName||product.name)+'</a></div>').category;
  if(suggested.commonMajor&&/벨트/.test(product.rawName||product.name)){
    for(const field of ['commonMajor','commonMiddle','commonSmall'])product.category[field]=suggested[field];
    Object.assign(product.category,{channelMajor:'브랜드가방',channelMiddle:'벨트',channelSmall:product.gender+'벨트'});
  }
  for(const field of ['channelMiddle','channelSmall']){
    if(/^(남성|여성)/.test(product.category[field])&&suggested[field])product.category[field]=suggested[field];
  }
  if(/트리코트/.test(product.rawName||product.name)&&/^(남성|여성)코트$/.test(product.category.commonSmall)&&suggested.commonSmall)product.category.commonSmall=suggested.commonSmall;
  const matched=resolveCatalogCategory(product);
  if(matched.path){product.category=matched.category;product.categoryMatch={status:matched.status,path:matched.path};}
  if(suggested.commonSmall==='01068 : 머플러'){
    for(const field of ['commonMajor','commonMiddle','commonSmall'])product.category[field]=suggested[field];
  }
  if(suggested.commonSmall==='00715 : 남성내의'){
    Object.assign(product.category,MENS_UNDERWEAR_CATEGORY);delete product.category.channelCodes;
  }
}
export function koreanTitle(raw, gender, style) {
  const sex=String(gender||'').trim(),code=String(style||'').trim();
  let name=easyProductName(raw).replace(/\bNEW\b/gi,'').replace(/[A-Za-z]+/g,'');
  // Remove only the supplied gender and exact style token; keep other numbers and qualifiers.
  if(sex==='남성'||sex==='여성')name=name.replace(new RegExp(sex+'(?=[^가-힣]|$|니트|가디건|카디건|맨투맨|패딩|티셔츠|긴팔티|반팔티|바지|슬랙스|셔츠|코트|자켓|재킷|후드|벨트)','g'),' ');
  const words=name.split(/\s+/).filter(w=>w&&w!==code);
  return uniqueTitleWords([sex,...words,code].filter(Boolean).join(' '));
}
function uniqueTitleWords(value){
  return [...new Set(value.split(/\s+/).filter(Boolean))].join(' ');
}
export function easyProductName(value){
  return uniqueTitleWords(cleanMarketingText(value).replace(/브러[시쉬]드|\bBRUSHED\b/gi,'기모').replace(/크루\s*넥|\bCREW\s*NECK\b/gi,'라운드').replace(/\bV[\s-]*NECK\b|\bV[\s-]*넥/gi,'브이넥').replace(/팬츠|\bPANTS\b/gi,'바지').replace(/스웨터/g,'니트'));
}
export function cleanMarketingText(value) {
  return String(value).replace(/\[[^\]]*\]/g,'').replace(/변우석|문가영|박현지/g,'').replace(/[\[\]]/g,'').replace(/\s+/g,' ').trim();
}
export const SEARCH_KEYWORDS_MAX_LENGTH=40;
export function buildKeywords(p,maxLength=37) {
  const name=easyProductName(String(p.name||'').trim()||p.rawName||'');
  const sex=['남성','여성'].includes(p.gender)?p.gender:'';
  const words=['지오다노'];
  const add=s=>{s=s.replace(/\s+/g,'');if(s&&!words.includes(s)&&[...words,s].join(',').length<=maxLength)words.push(s);};
  // Product types precede fabrics/details: e.g. 니트 배색 패딩 and 스웨트 바지.
  // Rules use only supplied text, never search-volume or sales-effect assumptions.
  const rules=[
    [/벨트/,'벨트',[[/정장/,'정장벨트'],[/가죽/,'가죽벨트'],[/자동/,'자동벨트']]],
    [/바지|슬랙스/,'바지',[[/데님|청바지/,'데님팬츠'],[/슬랙스/,'슬랙스'],[/트레이닝|스웨트|스웻/,'트레이닝바지'],[/와이드/,'와이드바지'],[/밴딩/,'밴딩바지'],[/기모/,'기모바지']]],
    [/(?<!트리)코트/,'코트',[[/트렌치/,'트렌치코트'],[/하프/,'하프코트'],[/롱/,'롱코트'],[/패딩|다운/,'패딩코트']]],
    [/패딩|푸퍼|다운/,'패딩',[[/경량/,'경량패딩'],[/베스트|조끼/,'패딩조끼'],[/후드/,'후드패딩'],[/숏|쇼트/,'숏패딩'],[/롱/,'롱패딩']]],
    [/바람막이|윈드브레이커/,'바람막이',[[/후드/,'후드바람막이'],[/경량/,'경량바람막이']]],
    [/자켓|재킷/,'자켓',[[/퀼팅/,'퀼팅자켓'],[/후드/,'후드자켓'],[/집업/,'집업자켓']]],
    [/점퍼/,'점퍼',[[/후드/,'후드점퍼'],[/집업/,'집업점퍼']]],
    [/가디건|카디건/,'가디건',[[/브이넥/,'브이넥가디건'],[/라운드/,'라운드가디건'],[/집업/,'집업가디건'],[/스트라이프/,'스트라이프가디건']]],
    [/니트|풀오버/,'니트',[[/브이넥/,'브이넥니트'],[/터틀|폴라/,'터틀넥니트'],[/라운드/,'라운드니트'],[/집업/,'집업니트'],[/베스트|조끼/,'니트조끼'],[/아가일/,'아가일니트'],[/스트라이프/,'스트라이프니트']]],
    [/후드/,'후드티',[[/집업/,'후드집업'],[/기모/,'기모후드티']]],
    [/맨투맨|스웨트셔츠|스웻셔츠/,'맨투맨',[[/기모/,'기모맨투맨'],[/그래픽/,'그래픽맨투맨']]],
    [/티셔츠|긴팔\s*티|반팔\s*티/,'티셔츠',[[/긴팔/,'긴팔티셔츠'],[/반팔/,'반팔티셔츠'],[/라운드/,'라운드티'],[/기모/,'기모티셔츠'],[/하프넥/,'하프넥티셔츠'],[/터틀|폴라/,'터틀넥티셔츠']]],
    [/블라우스/,'블라우스',[]],
    [/셔츠|남방/,'셔츠',[[/체크/,'체크셔츠'],[/옥스포드/,'옥스포드셔츠']]]
  ];
  // 버튼다운 is a shirt detail, not down insulation.
  const typeName=name.replace(/버튼\s*다운/g,'');
  const rule=rules.find(([pattern])=>pattern.test(typeName));
  if(rule){
    const [,kind,features]=rule;
    add(sex+kind);
    for(const [pattern,keyword] of features)if(pattern.test(name))add(keyword);
    if(kind==='티셔츠'&&/^면\s*100\s*%$/.test(p.material||''))add('면티셔츠');
  }else{
    add(sex+'의류');
    for(const word of name.split(/\s+/)){
      if(/^[가-힣]+$/.test(word)&&!['남성','여성','지오다노'].includes(word))add(word);
    }
  }
  return words.join(',');
}
export function applyVerifiedNotice(product, bytes) {
  const hash=createHash('sha256').update(bytes).digest('hex');
  const verified={
    '6d97de4a64dacd1bd624414e77c02c38137de2b32db2feafe995d3db807064d8':{material:'면 100%',country:'방글라데시'},
    '323124b9e1d354c217dc789aa459137a4b1d1bd0d465499589503e29799446a2':{material:'면 60%, 폴리에스터 40%',country:'미얀마'},
    '6f3409cbfa1942d5a19b85004ea0686ae276f64105173bd806da5e94ac16542c':{material:'면 100%',country:'베트남'}
  }[hash];
  if(verified){Object.assign(product,{material:verified.material,country:verified.country});product.noticeVerified=true;}
  return product;
}
export function matchCategoryLabel(choice, labels) {
  const normalized=s=>s.replace(/^[^:：]*[:：]\s*/,'').replace(/\s+/g,'');
  const exact=labels.filter(s=>normalized(s)===normalized(choice));
  if(exact.length===1)return exact[0];
  if(exact.length>1)throw Error('동일 분류명이 여러 개입니다: '+choice);
  return null;
}
export function baseColor(value) {
  return value.replace(/\d+/g,'').split(/[+＋/]/)[0].replace(/\s+/g,'').replace(/(?:STR|ST)$/gi,'');
}
export function matchColor(raw, choices) {
  const families=[
    ['블랙','검정','검정색','검은색','BLACK'],['화이트','흰색','백색','WHITE'],
    ['그레이','그레イ','회색','GREY','GRAY','차콜','챠콜'],['아이보리','오프화이트','크림','IVORY'],
    ['베이지','오트밀','샌드','BEIGE'],['브라운','갈색','카멜','토프','타우프','TAUPE','BROWN'],
    ['네이비','남색','NAVY'],['블루','파랑','파란색','청색','BLUE'],
    ['핑크','분홍','분홍색','PINK'],['퍼플','보라','보라색','자주','바이올렛','라벤더','PURPLE'],
    ['그린','초록','초록색','녹색','카키','올리브','GREEN'],['옐로우','노랑','노란색','YELLOW'],
    ['레드','빨강','빨간색','적색','버건디','와인','RED'],['오렌지','주황','주황색','ORANGE']
  ];
  const norm=s=>baseColor(s).toUpperCase().replace(/[()（）_-]/g,'');
  const base=norm(raw);
  // User-confirmed LotteON integrated color; do not substitute purple/pink.
  if(/^(라즈베리|RASPBERRY)$/.test(base))return choices.find(c=>norm(c)==='루비')||null;
  if(/^(린스|RINSE)$/.test(base))return choices.find(c=>norm(c)==='블루')||null;
  const exact=choices.find(c=>norm(c)===base);if(exact)return exact;
  if(/인디고|INDIGO/.test(base)){
    for(const preferred of ['인디고블루','네이비','블루','데님']){const match=choices.find(c=>norm(c)===preferred);if(match)return match;}
    return null;
  }
  if(/^(스톤|STONE|에크루|ECRU)$/.test(base))return choices.find(c=>norm(c)==='아이보리')||null;
  if(/세이지|SAGE/.test(base)){
    for(const preferred of ['연두','올리브']){const match=choices.find(c=>norm(c)===preferred);if(match)return match;}
  }
  const family=s=>families.find(g=>g.some(a=>s.includes(a.toUpperCase())));
  const group=family(base);if(!group)return null;
  const same=choices.find(c=>family(norm(c))===group);if(same)return same;
  const nearby={블랙:['그레이'],그레이:['블랙','화이트'],화이트:['아이보리','베이지'],아이보리:['화이트','베이지'],베이지:['아이보리','브라운'],브라운:['베이지'],네이비:['블루','블랙'],블루:['네이비'],핑크:['퍼플','레드'],퍼플:['핑크','블루'],그린:['블루'],옐로우:['오렌지','베이지'],레드:['핑크','오렌지'],오렌지:['레드','옐로우']};
  for(const key of nearby[group[0]]||[]){const match=choices.find(c=>family(norm(c))?.[0]===key);if(match)return match;}
  return null;
}
async function download(url) {
  const u=new URL(url); if(u.origin!==OFFICIAL) throw Error('공식몰 이외 이미지 주소입니다.');
  const r=await fetch(u,{signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw Error(`공식몰 요청 실패 (${r.status})`);
  return r;
}
export function officialConsumerPrice(html) {
  const $=cheerio.load(html);
  const values=[];
  const add=value=>{
    const text=String(value??'').replace(/\s/g,'');
    if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:원)?$/.test(text))return;
    const price=Number(text.replace(/[,원]/g,''));
    if(Number.isSafeInteger(price)&&price>=1000)values.push(price);
  };
  // Explicit normal price only; selling/coupon prices must never be substituted.
  $('.info[data-normal_prc]').each((_,el)=>add($(el).attr('data-normal_prc')));
  $('th').each((_,el)=>{
    if(!/^소비자(?:가|가격)$/.test($(el).text().replace(/\s/g,'')))return;
    add($(el).next('td').text());
  });
  const unique=[...new Set(values)];
  return unique.length===1?unique[0]:null;
}
export function parseProduct(html, detailUrl, style) {
  assertAdultProductPage(html,detailUrl);
  const $=cheerio.load(html);
  const raw=$('title').text().split(' - ')[0].trim()||$('h3').first().clone().children('a').remove().end().text().trim();
  const text=$('body').text();
  const {gender,sourceCategory,category}=productClassification(html);
  const images=$('img').map((_,e)=>({src:new URL($(e).attr('src')||'/',detailUrl).href.split('#')[0],alt:$(e).attr('alt')||''})).get();
  // Older accessories include the actual notice as <style>_info.jpg alongside
  // a legacy <style>info.jpg placeholder that can return an HTML page.
  const info=images.find(x=>new RegExp(style+'_info\\.(?:jpe?g|png|webp)(?:$|\\?)','i').test(x.src))?.src
    ||images.find(x=>new RegExp(style+'info\\.(?:jpe?g|png|webp)(?:$|\\?)','i').test(x.src))?.src;
  const size=images.find(x=>new RegExp(style+'size_?\\.(?:jpg|jpeg|png)(?:$|\\?)','i').test(x.src))?.src;
  const check=images.find(x=>x.src.includes(style+'ch.'))?.src;
  const detail=images.find(x=>new RegExp(style+'(?:_\\d+|_)?\\.jpg(?:$|\\?)','i').test(x.src))?.src;
  const main=images.find(x=>x.src.includes('/_data/attach/'))?.src;
  const gallery=[...new Set($('img.product_image_tooltip_image_gio[data-image_no]').map((_,e)=>new URL($(e).attr('src')||'/',detailUrl).href.split('#')[0]).get())].filter(src=>src!==main&&new URL(src).origin===OFFICIAL).slice(0,2);
  if(!main||(!info&&!detail)) throw Error('공식몰 상품의 고시 또는 대표이미지를 찾지 못했습니다.');
  const colors=[...new Set(images.map(x=>x.alt).filter(x=>/^\d{2}\s*\S+/.test(x)))].map(x=>x.replace(/\s+/g,'')).sort();
  const sizes=[...new Set($('a').map((_,e)=>$(e).text().trim()).get().filter(x=>/^(?:XXS|XS|S|M|L|XL|XXL|2XL|3XL|FREE|\d{2,3})$/.test(x)))];
  const consumerPrice=officialConsumerPrice(html);
  const warnings=[];
  if(!consumerPrice)warnings.push('공식몰 소비자가를 직접 확인해 주세요.');
  if(!gender)warnings.push('상품 경로에서 성별을 확정하지 못했습니다. 성별을 직접 선택해야 등록할 수 있습니다.');
  if(!category.commonMiddle)warnings.push('롯데 상품분류 대응이 검증되지 않아 공란으로 두었습니다. 아래 공식몰 상품 경로를 참고해 선택해 주세요.');
  return {style,sourceUrl:detailUrl,officialDescription:$('.prd_detail_content_gio').first().text().replace(/\s+/g,' ').trim().slice(0,12000),originalDetailUrl:detail||null,rawName:raw,gender,sourceCategory,name:koreanTitle(raw,gender,style).trim(),consumerPrice,colors,sizes,material:'',country:'',washing:'',manufactured:'',images:{main,...(detail?{detail}:{}),...(size?{size}:{}),...(check?{check}:{}),info,...Object.fromEntries(gallery.map((src,i)=>["extra"+(i+1),src]))},category,ocrText:'',warnings};
}
export function applyOCR(product, text) {
  const clean=text.replace(/\r/g,'');
  const material=clean.match(/(?:제품\s*소재|제품소재)[\s:：]*([\s\S]*?)(?=색\s*상|치\s*수|제조자)/)?.[1]?.trim();
  const country=clean.match(/제조국[\s:：]*([\s\S]*?)(?=세탁|제조연월|품질)/)?.[1]?.trim();
  const date=clean.match(/(20\d{2})\s*[.\-/]\s*(0?[1-9]|1[0-2])\b/);
  product.ocrText=clean;
  if(material) {
    // OCR may place the first color line before the 색상 label.
    const isolated=material.split(/\n\s*\n|\b\d{2}(?=[가-힣])/)[0].replace(/\s+/g,' ').trim();
    const percentages=[...isolated.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1]));
    if(!percentages.length||/\d{4,}/.test(isolated)||/\d+(?![\d.])\s*(?:,|$)/.test(isolated)||percentages.some(n=>n>100)||percentages.reduce((a,b)=>a+b,0)>100.1){
      product.material='';
      product.warnings.push('소재 혼용률 숫자·% 인식이 불확실해 자동 입력하지 않았습니다. 원본을 확인해 주세요.');
    }else product.material=isolated;
  }
  product.country=normalizeCountry(country);
  if(date) product.manufactured=`${date[1]}-${date[2].padStart(2,'0')}`;
  // Washing symbols need visual review; do not infer instructions from OCR icons.
  product.warnings.push('소재·제조국·제조연월 OCR과 세탁기호를 고시 이미지와 대조해 주세요.');
  return product;
}
export function parseProductInput(value) {
  const input=String(value||'').trim();
  if(/^\d{6}$/.test(input))return {style:input,url:null};
  let url;try{url=new URL(input);}catch{throw Error('품번 6자리 또는 지오다노 공식몰 상품 URL을 입력해 주세요.');}
  if(url.protocol!=='https:'||!['www.giordano.co.kr','giordano.co.kr'].includes(url.hostname)||url.port||url.username||url.password||url.pathname!=='/shop/detail.php'||!url.searchParams.get('pno'))throw Error('지오다노 공식몰 상품 상세페이지 URL만 사용할 수 있습니다.');
  url.hostname='www.giordano.co.kr';url.hash='';return {style:null,url:url.href};
}
export function styleFromDetail(html){
  const $=cheerio.load(html),text=$('body').text();
  const named=text.match(/STYLE\s*[.:]\s*(?:\d{2})?(\d{6})(?!\d)/i)?.[1];
  if(named)return named;
  const styles=[...new Set($('img').map((_,e)=>($(e).attr('src')||'').match(/(?:^|\/)(\d{6})info\./i)?.[1]).get().filter(Boolean))];
  if(styles.length===1)return styles[0];
  throw Error('상품 URL에서 품번을 확인하지 못했습니다. 품번 6자리로 입력해 주세요.');
}
export async function collect(style, folder, log, cancelled=()=>false,signal,options={}) {
  const input=parseProductInput(style);style=input.style;await mkdir(folder,{recursive:true});
  log('공식몰 품번 검색');
  const searchUrl=`${OFFICIAL}/shop/search_result.php?search_str=${style}`;
  const browser=await chromium.launch({headless:true});
  const abort=()=>{void browser.close().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){await browser.close();throw Error('사용자가 중단했습니다.');}
  try {
  const context=await browser.newContext();
  // DOM supplies product data; validated originals are fetched separately below.
  await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
  const page=await context.newPage();
  let url=input.url;
  if(!url&&options.sourceUrlHint){url=parseProductInput(options.sourceUrlHint).url;log('확인된 공식 상품 주소로 바로 연결 · 품번 재검증');}
  if(!url){
  await page.goto(searchUrl,{waitUntil:'domcontentloaded'});
  await page.locator('a[href*="detail.php?pno="]').first().waitFor({timeout:20000}).catch(()=>{});
  const $=cheerio.load(await page.content());
  const links=[...new Set($('a[href*="detail.php?pno="]').map((_,el)=>new URL($(el).attr('href'),searchUrl).href).get())];
  if(!links.length)throw Error('공식몰에서 해당 품번을 찾지 못했습니다.');
  url=await findAdultProductUrl(links,style,async candidate=>{
    const response=await context.request.get(candidate,{timeout:20000});
    return response.ok()?await response.text():null;
  },()=>signal?.aborted||cancelled());
  }
  await page.goto(url,{waitUntil:'domcontentloaded'});
  if(new URL(page.url()).origin!==OFFICIAL)throw Error('공식몰 이외 페이지로 이동했습니다.');
  if(!style){await page.waitForLoadState('load');style=styleFromDetail(await page.content());log('URL에서 확인한 품번: '+style);}
  validateStyle(style);
  const actualStyle=styleFromDetail(await page.content());
  if(actualStyle!==style)throw Error('입력 품번 '+style+'와 공식몰 상품 품번 '+actualStyle+'가 다릅니다.');
  assertAdultProductPage(await page.content(),page.url());
  await page.locator('img[src*="'+style+'info."]').first().waitFor({state:'attached',timeout:20000});

  await page.waitForLoadState('load');
  const detailHtml=await page.content();
  const product=parseProduct(detailHtml,url,style);
  if(options.saveSmartstoreSource===true)await writeFile(path.join(folder,'smartstore-official.html'),detailHtml);
  product.colorChips=officialColorChips(detailHtml,url,product.colors);
  let originalDetailBytes;
  if(product.images.detail&&options.allowMissingDetail===true){
    originalDetailBytes=await inspectDetailSource(product,src=>context.request.get(src,{headers:{Referer:product.sourceUrl},timeout:20000}),true);
    if(product.detailFallbackApproved)log('상세 원본 누락 확인 · 승인된 대표·색상별 사진 구성으로 진행');
  }
  if(!product.images.detail){
    const {collectColorImages}=await import('./color-images.mjs');
    await collectColorImages(page,product,log);
  }
  if(cancelled()) throw Error('사용자가 중단했습니다.');
  let infoFailure;
  const downloads=Object.entries(product.images).filter(([,src])=>!!src);
  for(let offset=0;offset<downloads.length;offset+=3){
  const completed=await Promise.allSettled(downloads.slice(offset,offset+3).map(async([key,url])=>{
    if(new URL(url).origin!==OFFICIAL)throw Error('공식몰 이미지 주소를 확인해 주세요.');
    let bytes=key==='detail'?originalDetailBytes:null,issue;
    for(const candidate of sourceImageCandidates(url,product)){
    for(let attempt=0;!bytes&&attempt<2;attempt++){
      try{
        const response=await context.request.get(candidate,{headers:{Referer:product.sourceUrl},timeout:20000});
        bytes=await readSourceImage(response);
        if(candidate!==url){product.images[key]=candidate;product.imageSourceRepairs||=[];product.imageSourceRepairs.push({key,original:url,resolved:candidate,basis:'같은 품번의 공식 이미지 주소에 표시된 단일 연도 폴더'});log('공식몰 '+key+' 이미지 주소 보정 · 같은 품번의 공식 연도 폴더 확인');}
        break;
      }catch(e){issue=e;if(cancelled())throw Error('사용자가 중단했습니다.');}
    }
    if(bytes)break;
    }
    if(!bytes){
      if(key==='detail'){const error=Error('기존 상세 원본을 가져오지 못해 수집을 중단했습니다. '+issue?.message+' / 원본 주소: '+url+' / 대표컷·추가컷으로 대체하지 않습니다.');if(/HTML 페이지|HTTP (404|410)\b/.test(issue?.message||''))error.code='DETAIL_SOURCE_MISSING';throw error;}
      if(key==='info'){infoFailure=issue;delete product.images.info;log('별도 정보고시 이미지 수집 실패 · 같은 상품의 상세 하단 대비책 확인');return;}
      if(key==='main')throw Error('공식몰 필수 이미지 수집 실패: '+key+' — '+issue?.message);
      product.warnings.push('공식몰 '+({size:'사이즈',check:'체크업',detail:'상세'}[key]||key)+' 이미지를 받지 못했습니다.');
      delete product.images[key];log('수집 불가 이미지를 제외하고 진행: '+key);return;
    }
    await writeFile(path.join(folder,`${key}.jpg`),bytes);
  }));
  const failed=completed.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  }
  if(!product.images.info){
    if(!product.images.detail)throw Error('공식몰 필수 이미지 수집 실패: info — '+(infoFailure?.message||'별도 정보고시와 상세 원본이 없습니다.'));
    try{const recovered=await extractEmbeddedNotice(product,await readFile(path.join(folder,'detail.jpg')),{signal});await writeFile(path.join(folder,'info.jpg'),recovered.bytes);product.noticeSource=recovered.source;product.images.info=product.images.detail;log('별도 고시 누락 대비책 적용 · 같은 품번의 상세 하단 INFORMATION 확인');}
    catch(error){throw Error('공식몰 필수 이미지 수집 실패: info — '+error.message);}
  }
  if(product.colorImages){const available=new Set(Object.values(product.images));for(const color of Object.keys(product.colorImages))product.colorImages[color]=product.colorImages[color].filter(src=>available.has(src));}
  log('공식 고시 이미지에서 글자 인식 중 (첫 실행은 한국어 모델 다운로드)');
  try {
    const notice=options.noticeCacheRoot?await analyzeNoticeCached(path.join(folder,'info.jpg'),{cacheRoot:options.noticeCacheRoot,log,signal}):await analyzeNotice(path.join(folder,'info.jpg'),log,signal);
    applyOCR(product,notice.ocrText);
    Object.assign(product,{country:notice.country||product.country,material:notice.material,washing:notice.washing,fieldStatus:notice.fieldStatus,noticeAnalysis:notice});
    if(notice.material)product.warnings=product.warnings.filter(w=>!w.startsWith('소재 혼용률')); 
  }
  catch(e){ signal?.throwIfAborted();product.warnings.push(`OCR 미완료: ${e.message}. 고시 이미지를 보고 입력해 주세요.`); }
  applyVerifiedNotice(product,await readFile(path.join(folder,'info.jpg')));
  if(product.noticeVerified){product.fieldStatus||={};product.fieldStatus.material='공식 이미지 대조 완료';}
  product.fieldStatus||={material:'확인 필요',washing:'확인 필요'};
  repairCategoryFields(product);
  product.fieldStatus.category=product.categoryMatch?.status||categoryStatus(product.category);
  product.keywords=buildKeywords(product);
  if(cancelled())throw Error('사용자가 중단했습니다.');
  await writeFile(path.join(folder,'product.json'),JSON.stringify(product,null,2));
  await collectColorChips(folder,product,src=>context.request.get(src,{headers:{Referer:product.sourceUrl},timeout:8000}),log);
  if(cancelled()||signal?.aborted)throw Error('사용자가 중단했습니다.');
  if(options.prepareMain!==false)try{
    await prepareMainImage(folder);
    let chipStatus;try{chipStatus=JSON.parse(await readFile(path.join(folder,'colorchip-status.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(chipStatus)log(chipStatus.position?'대표이미지 색상칩 자동 배치: '+(chipStatus.position==='bottom-right'?'오른쪽 하단':'오른쪽 중단'):chipStatus.reason);
  }catch(e){log('대표이미지 색상칩 자동 처리 생략: '+e.message);}
  return product;
  } finally {signal?.removeEventListener('abort',abort);await browser.close().catch(()=>{});}
}
export function categoryStatus(category){return ['commonMiddle','commonSmall','channelMiddle','channelSmall'].every(key=>category[key])?'추천 분류 · 포털 목록 대조 필요':'확인 필요';}
