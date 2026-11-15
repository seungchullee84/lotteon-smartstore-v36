import {isMensUnderwear,MENS_UNDERWEAR_CATEGORY,channelCategoryPath,mensTrainingCategory,isMensFleeceZipJacket} from './category.mjs';
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
// Specific garment evidence must win over the broad guesses made from TOP/PANTS.
// An empty list means this known garment has no supported exact leaf; do not
// silently substitute another garment or invent material, sleeve or length.
function explicitGarmentLeaves(p){
 const title=String(p.rawName||p.name||'').replace(/버튼\s*다운|button[-\s]*down/gi,'버튼셔츠').replace(/트리코트/g,'');
 const text=[title,...(p.sourceCategory||[])].join(' '),women=p.gender==='여성';
 if(/원피스|\bdress\b/i.test(title))return /니트/.test(title)?['니트원피스']:/트렌치/.test(title)?['트렌치원피스']:/레이스/.test(title)?['레이스원피스']:/프릴/.test(title)?['프릴원피스']:/플라워|프린트/.test(title)?['플라워/프린트원피스']:/나시|민소매/.test(title)?['나시원피스']:/롱|맥시/.test(title)?['롱/맥시원피스']:/미니/.test(title)?['미니원피스']:[];
 if(/스커트|치마/.test(title)&&!/치마바지/.test(title))return /롱|맥시/.test(title)?['롱스커트']:/미디/.test(title)?['미디스커트']:/미니/.test(title)?['미니스커트']:[];
 if(/점프수트|점프슈트|\bjumpsuit\b/i.test(title))return ['점프슈트'];
 if(/조끼|베스트|\bvest\b/i.test(title))return /패딩|다운|푸퍼/.test(title)?['패딩조끼']:/니트|스웨터/.test(title)?['니트조끼']:/테일러드|정장/.test(title)?['테일러드조끼']:/퍼|모피/.test(title)?['퍼베스트']:['캐쥬얼조끼'];
 if(/레깅스|\bleggings\b/i.test(title))return women&&!/INNERWEAR|내의|내복/i.test(text)?['레깅스']:[];
 if(/반바지|치마바지|쇼츠|하프\s*팬츠|\bshorts\b/i.test(title))return /데님|청반바지|\bdenim\b/i.test(text)?['청반바지']:women?['반바지/치마바지']:/코튼|린넨|(?:^|\s)면(?:\s|$)|\bcotton\b|\blinen\b/i.test(title)?['면/린넨반바지']:[];
 if(/코트/.test(title))return /트렌치/.test(title)?['트렌치코트']:/레인/.test(title)?['레인코트']:/패딩|다운/.test(title)?['패딩/다운코트']:/하프|숏|쇼트/.test(title)?['하프코트']:/롱/.test(title)?['롱코트']:[];
 if(/패딩|다운|푸퍼/.test(title))return ['패딩/다운점퍼'];
 if(/재킷|자켓|셔켓|블레이저/.test(title)){
  if(/바람막이|윈드브레이커/.test(text))return ['바람막이점퍼'];
  if(/데님|청자켓/.test(title)&&!/라이크/.test(title))return [women?'청자켓':'데님자켓'];
  if(/가죽|레더|무스탕/.test(title))return [women?'무스탕/가죽자켓':'가죽자켓'];
  if(/블레이저|테일러드/.test(title))return ['테일러드자켓'];
  if(/집업|풀\s*집/.test(title)&&!/하프|반\s*집/.test(title))return [women?'집업/야구/항공점퍼':'집업점퍼'];
  if(!women&&/울|모직/.test(title))return ['모직자켓'];
  return women?['캐주얼자켓']:[];
 }
 if(/가디건|카디건/.test(title))return /집업|풀\s*집/.test(title)?['집업가디건']:/브이|V\s*넥/i.test(title)?['브이넥가디건']:/라운드|크루/.test(title)?['라운드넥가디건']:[];
 if(/니트|스웨터/.test(title)&&!/머플러/.test(title))return /집업|풀\s*집|하프\s*집/.test(title)?['집업니트']:/터틀|폴라/.test(title)?['터틀넥/폴라니트']:/브이|V\s*넥/i.test(title)?['브이넥니트']:/라운드|크루/.test(title)?['라운드넥니트']:null;
 if(/셔츠|남방/.test(title)&&!/티셔츠|스웨트셔츠|스웻셔츠/.test(title)){
  const names=[];if(/데님|\bdenim\b/i.test(title))names.push('데님셔츠');if(/체크/.test(title))names.push('체크셔츠');if(/스트라이프/.test(title))names.push('스트라이프셔츠');if(/솔리드|무지/.test(title))names.push('솔리드셔츠');
  return names.length===1?names:[];
 }
 if(women&&/플리스|후리스/.test(title)&&/집업|풀\s*집/.test(title)&&!/후드|후디|하프|반\s*집|팬츠|바지|니트|가디건/.test(title))return ['집업/야구/항공점퍼'];
 if(/후드|후디/.test(title)&&!/패딩|다운|코트|니트|스웨터|가디건|카디건|재킷|자켓|점퍼|바람막이/.test(title))return women?['후드티/후드집업']:/집업|지퍼/.test(title)?['후드집업']:['후드티셔츠'];
 if(/티셔츠|긴팔티|반팔티|카라티|민소매|나시|탱크탑|머슬티/.test(title)&&!/니트|스웨터|후드|맨투맨|스웨트셔츠/.test(title)){
  const short=/반팔/.test(text)&&!women;
  if(/민소매|나시|탱크탑|머슬티/.test(title))return ['민소매티셔츠'];
  if(/카라|폴로|피케|피케이/.test(title))return [short?'카라반팔티':'카라넥티셔츠'];
  if(/폴라|터틀/.test(title))return short?[]:['폴라티셔츠'];
  if(/브이|V\s*넥/i.test(title))return [short?'브이넥반팔티':'브이넥티셔츠'];
  if(/라운드|크루/.test(title))return [short?'라운드넥반팔티':'라운드넥티셔츠'];
  if(/프린트|프린팅/.test(title))return [short?'프린트반팔티':'프린트티셔츠'];
 }
 return null;
}
export function resolveCatalogCategory(p,catalog=loadCatalog(),common=null){
 const trainingCategory=mensTrainingCategory(p);
 if(trainingCategory)return {category:trainingCategory,status:'사용자 확인 · 남성 트레이닝 바지 → 바지 / 기모팬츠',path:{major:{code:'BC31000000',name:'브랜드남성의류'},middle:{code:'BC31050000',name:'바지'},small:{code:'BC31050100',name:'기모팬츠'},detail:null}};
 if(/머플러/.test(p.rawName||p.name||'')&&(!p.category?.channelSmall?.trim()||['니트/스웨터','라운드넥니트'].includes(p.category.channelSmall))){
  const major=catalog?.majors.find(m=>m.code==='BC35000000'),middle=major?.middles.find(m=>m.code==='BC35100000'),small=middle?.smalls.find(s=>s.code==='BC35100100');
  if(small)return {category:channelCategoryPath({...p.category,commonMajor:'L0001 : 패션/장신',commonMiddle:'M0357 : 패션액세서리',commonSmall:'01068 : 머플러',channelMiddle:middle.name,channelSmall:small.name}),status:'실제 롯데 목록 확인 · 소재 제한 없는 머플러 분류',path:{major:{code:major.code,name:major.name},middle:{code:middle.code,name:middle.name},small:{code:small.code,name:small.name},detail:null}};
 }
 if(isMensUnderwear(p))return {category:{...p.category,...MENS_UNDERWEAR_CATEGORY,channelCodes:undefined},status:'사용자 확인 공통·채널 분류 · 남성의류 → 남성속옷 → 남성내의'};
 if(['잡화','브랜드잡화/넥타이','브랜드가방'].includes(p.category?.channelMajor))return {category:{...p.category},status:'개별 확인 잡화 경로 · 의류 목록 대조 제외'};
 if(/양말|장갑|벨트|머플러|볼캡|버킷햇|비니|백팩|숄더백|토트백|(?:^|\s)브라(?:렛|탑)?(?:$|\s)|드로즈|팬티/.test(p.rawName||p.name||''))return {category:{...p.category},status:'확인 필요 · 잡화·속옷은 의류 소재 분류로 대체하지 않음'};
 if(!catalog)return {category:{...p.category},status:'목록 미수집'};
 if(!common)try{common=JSON.parse(readFileSync(new URL('./data/category-catalog-common.json',import.meta.url),'utf8'));}catch{}
 const text=[p.rawName||p.name,...(p.sourceCategory||[])].join(' ').replace(/버튼\s*다운|button[-\s]*down/gi,'버튼셔츠').replace(/트리코트/g,'');
 const denim=/데님|청바지|\bDENIM\b/i.test(text)&&!/셔츠|재킷|자켓|셔켓|원피스|스커트|치마|조끼|베스트/.test(text);
 const training=!denim&&/바지|팬츠|PANTS/i.test(text)&&/트레이닝|스웻|스웨트|조거/.test(text);
 const denimFit=/와이드|부츠컷|배럴|벌룬/.test(text)?'부츠컷/와이드핏':/스키니|슬림/.test(text)?'스키니/슬림핏':'스트레이트핏';
 const paths=standardPaths(catalog,p.gender),wanted=denim?denimFit:training?(p.gender==='여성'?'트레이닝하의':'트레이닝바지'):strip(p.category?.channelSmall);
 const explicitLeaves=explicitGarmentLeaves(p);
 let found=explicitLeaves?paths.filter(x=>explicitLeaves.includes(x.small.name)):paths.filter(x=>strip(x.small.name)===wanted&&(denim||training||!p.category?.channelDetail||x.detail?.name===p.category.channelDetail));
 if(found.length!==1&&!explicitLeaves){
  const candidates=[];const prefer=(condition,...names)=>{if(condition)candidates.push(...names);};
  prefer(/무스탕|가죽/.test(text),'무스탕/가죽자켓','가죽자켓');
  prefer(/패딩|다운|푸퍼/.test(text),/조끼|베스트/.test(text)?'패딩조끼':'패딩/다운점퍼');
  prefer(/바람막이|윈드브레이커/.test(text),'바람막이점퍼');
  prefer(!wanted&&isMensFleeceZipJacket(p),'집업점퍼');
  prefer(/바지|팬츠|PANTS|슬랙스/.test(text),...(/데님|청바지/.test(text)?['청바지']:/슬랙스/.test(text)?['슬랙스']:/트레이닝|스웻|스웨트|조거/.test(text)?['트레이닝하의','트레이닝바지']:['면바지/밴딩팬츠','치노면바지','면바지']));
  prefer(/가디건|카디건/.test(text),/집업/.test(text)?'집업가디건':/브이|V넥/i.test(text)?'브이넥가디건':/라운드/.test(text)?'라운드넥가디건':'가디건');
  prefer(/데님|청바지/.test(text)&&/바지|팬츠|PANTS|청바지/.test(text),/와이드|부츠컷/.test(text)?'부츠컷/와이드핏':/스키니|슬림/.test(text)?'스키니/슬림핏':/스트레이트|일자/.test(text)?'스트레이트핏':'청바지');
  prefer(/셔츠|남방/.test(text)&&!/티셔츠|스웨트셔츠/.test(text),/데님|\bDENIM\b/i.test(text)?'데님셔츠':/체크/.test(text)?'체크셔츠':/스트라이프/.test(text)?'스트라이프셔츠':/솔리드/.test(text)?'솔리드셔츠':'셔츠');
  prefer(/재킷|자켓/.test(text)&&!/무스탕|가죽|패딩|다운/.test(text),'캐주얼자켓');
  prefer(/후드/.test(text)&&!/패딩|다운|코트|니트|스웨터/.test(text),...(/집업|지퍼/.test(text)?['후드집업','후드티/후드집업']:['후드티셔츠','후드티/후드집업']));
  prefer(/맨투맨|스웨트셔츠/.test(text)&&!/후드/.test(text),'맨투맨티셔츠','맨투맨');
  prefer(/니트|스웨터/.test(text)&&!/가디건|카디건|조끼|베스트/.test(text),...(/터틀|폴라/.test(text)?['터틀넥/폴라니트']:/집업/.test(text)?['집업니트']:/브이|V넥/i.test(text)?['브이넥니트']:/라운드|크루/.test(text)?['라운드넥니트']:[]));
  prefer(/티셔츠|긴팔티|반팔티/.test(text)&&!/후드|맨투맨|스웨트셔츠/.test(text),...(/폴라|터틀/.test(text)?['폴라티셔츠']:/브이|V넥/i.test(text)?['브이넥티셔츠','브이넥반팔티']:/라운드|크루/.test(text)?(/반팔/.test(text)?['라운드넥반팔티','라운드넥티셔츠']:['라운드넥티셔츠']):[]));
  for(const name of candidates){const matches=paths.filter(x=>x.small.name===name);if(matches.length===1){found=matches;break;}}
 }
 if(found.length!==1)return {category:{...p.category},status:'확인 필요 · 실제 목록에서 하나의 경로로 확정되지 않음'};
 const path=found[0],commonPath=common&&commonFor(path,p.gender,common);
 const category={...p.category,channelMajor:path.major.name,channelMiddle:path.middle.name,channelSmall:path.small.name,channelDetail:path.detail?.name||'',channelCodes:{major:path.major.code,middle:path.middle.code,small:path.small.code,detail:path.detail?.code||''}};
 if(commonPath){category.commonMajor=commonPath.major;category.commonMiddle=commonPath.middle;category.commonSmall=commonPath.small;}
 return {category,status:commonPath?'실제 공통·표준 목록 대조 완료 · 상품 적합성 검토':'표준 목록 대조 완료 · 공통분류 확인 필요',path,commonPath};
}
