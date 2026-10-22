import {readFileSync} from 'node:fs';
const strip=s=>String(s||'').replace(/^[^:：]*[:：]\s*/,'').replace(/\s/g,'');
export function loadCatalog(){
 try{const c=JSON.parse(readFileSync(new URL('./data/category-catalog-standard.json',import.meta.url),'utf8'));return c.complete?c:null;}catch{return null;}
}
export function standardPaths(catalog,gender){
 const major=catalog?.majors.find(g=>g.name==='브랜드'+gender+'의류');
 if(!major)return [];
 return major.middles.flatMap(m=>m.smalls.flatMap(s=>s.details.length?s.details.map(d=>({major:{code:major.code,name:major.name},middle:{code:m.code,name:m.name},small:{code:s.code,name:s.name},detail:d})): [{major:{code:major.code,name:major.name},middle:{code:m.code,name:m.name},small:{code:s.code,name:s.name},detail:null}]));
}
export function commonNameFor(path,gender){
 const middle=path.middle.name,leaf=path.small.name,all=middle+' '+leaf;
 if(middle==='정장'){
  if(/세트/.test(leaf))return gender+'정장세트';
  if(/원피스/.test(leaf))return gender+'원피스';
  if(/치마/.test(leaf))return gender+'스커트';
  if(/바지/.test(leaf))return gender+(gender==='남성'?'정장바지':'바지');
  if(/조끼/.test(leaf))return gender+'베스트';
  if(/와이셔츠/.test(leaf))return gender+'정장셔츠';
  if(/재킷|자켓/.test(leaf))return gender+(gender==='남성'?'정장재킷':'재킷');
 }
 if(/가죽|모피/.test(middle))return gender+(/밍크/.test(leaf)?'밍크의류':/모피|퍼/.test(leaf)?'기타모피의류':'피혁의류');
 if(/청바지/.test(middle)||/청반바지|데님반바지/.test(leaf))return gender+'청바지';
 if(/레깅스/.test(leaf))return gender+'레깅스';
 if(/바지/.test(middle))return gender+(gender==='남성'?(/슬랙스|정장/.test(leaf)?'정장바지':'캐주얼바지'):'바지');
 if(/가디건\/조끼/.test(middle))return gender+(/조끼|베스트/.test(leaf)?'베스트':'가디건');
 if(/니트\/스웨터/.test(middle))return gender+'스웨터/풀오버';
 if(/셔츠|블라우스/.test(middle)&&!/티셔츠/.test(middle))return gender+(/블라우스/.test(leaf)?'블라우스':'남방셔츠');
 if(/티셔츠|맨투맨/.test(middle))return gender+(gender==='여성'?'티셔츠/탑':/맨투맨|후드|스웨트/.test(leaf)?'스웨트셔츠/후드/집업':'티셔츠');
 if(/점퍼|패딩|야상/.test(middle))return gender+(/패딩|다운/.test(leaf)?'패딩':'점퍼');
 if(/자켓|코트/.test(middle))return gender+(/트렌치/.test(leaf)?'트렌치코트':/코트/.test(leaf)?'코트':gender==='여성'?'재킷':/테일러드|정장/.test(leaf)?'정장재킷':'캐주얼재킷');
 if(/트레이닝복/.test(middle))return gender+'패션트레이닝복';
 if(/스커트/.test(middle))return gender+'스커트';
 if(/원피스/.test(middle))return gender+(/점프/.test(leaf)?'점프수트/오버롤':'원피스');
 if(/한복/.test(leaf))return gender+'한복';
 return null;
}
export function commonFor(path,gender,common){
 const desired=commonNameFor(path,gender);if(!desired)return null;
 const group=common.genders.find(g=>g.gender===gender);
 for(const m of group?.middles||[])for(const child of m.children)if(strip(child)===desired)return {major:group.major,middle:m.middle,small:child};
 return null;
}
export function resolveCatalogCategory(p,catalog=loadCatalog(),common=null){
 if(!catalog)return {category:{...p.category},status:'목록 미수집'};
 if(!common)try{common=JSON.parse(readFileSync(new URL('./data/category-catalog-common.json',import.meta.url),'utf8'));}catch{}
 const text=[p.rawName,p.name,...(p.sourceCategory||[])].join(' ');
 const denim=/데님|청바지|\bDENIM\b/i.test(text)&&/바지|팬츠|PANTS|청바지/i.test(text);
 const denimFit=/와이드|부츠컷|배럴|벌룬/.test(text)?'부츠컷/와이드핏':/스키니|슬림/.test(text)?'스키니/슬림핏':'스트레이트핏';
 const paths=standardPaths(catalog,p.gender),wanted=denim?denimFit:strip(p.category?.channelSmall);
 let found=paths.filter(x=>strip(x.small.name)===wanted&&(denim||!p.category.channelDetail||x.detail?.name===p.category.channelDetail));
 if(found.length!==1){
  const candidates=[];const prefer=(condition,...names)=>{if(condition)candidates.push(...names);};
  prefer(/무스탕|가죽/.test(text),'무스탕/가죽자켓','가죽자켓');
  prefer(/패딩|다운|푸퍼/.test(text),/조끼|베스트/.test(text)?'패딩조끼':'패딩/다운점퍼');
  prefer(/바람막이|윈드브레이커/.test(text),'바람막이점퍼');
  prefer(/바지|팬츠|PANTS|슬랙스/.test(text),...(/데님|청바지/.test(text)?['청바지']:/슬랙스/.test(text)?['슬랙스']:/트레이닝|스웻|스웨트/.test(text)?['트레이닝바지']:['면바지/밴딩팬츠','치노면바지','면바지']));
  prefer(/가디건|카디건/.test(text),/집업/.test(text)?'집업가디건':/브이|V넥/i.test(text)?'브이넥가디건':/라운드/.test(text)?'라운드넥가디건':'가디건');
  prefer(/데님|청바지/.test(text)&&/바지|팬츠|PANTS|청바지/.test(text),/와이드|부츠컷/.test(text)?'부츠컷/와이드핏':/스키니|슬림/.test(text)?'스키니/슬림핏':/스트레이트|일자/.test(text)?'스트레이트핏':'청바지');
  prefer(/셔츠|남방/.test(text)&&!/티셔츠|스웨트셔츠/.test(text),/체크/.test(text)?'체크셔츠':/스트라이프/.test(text)?'스트라이프셔츠':/솔리드/.test(text)?'솔리드셔츠':'셔츠');
  prefer(/재킷|자켓/.test(text)&&!/무스탕|가죽|패딩|다운/.test(text),'캐주얼자켓');
  for(const name of candidates){const matches=paths.filter(x=>x.small.name===name);if(matches.length===1){found=matches;break;}}
 }
 if(found.length!==1)return {category:{...p.category},status:'확인 필요 · 실제 목록에서 하나의 경로로 확정되지 않음'};
 const path=found[0],commonPath=common&&commonFor(path,p.gender,common);
 const category={...p.category,channelMiddle:path.middle.name,channelSmall:path.small.name,channelDetail:path.detail?.name||'',channelCodes:{major:path.major.code,middle:path.middle.code,small:path.small.code,detail:path.detail?.code||''}};
 if(commonPath){category.commonMiddle=commonPath.middle;category.commonSmall=commonPath.small;}
 return {category,status:commonPath?'실제 공통·표준 목록 대조 완료 · 상품 적합성 검토':'표준 목록 대조 완료 · 공통분류 확인 필요',path,commonPath};
}
