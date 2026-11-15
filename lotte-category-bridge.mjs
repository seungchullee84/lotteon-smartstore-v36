// The first/common category is the source of truth. A missing fine-grained
// garment description must not prevent a second/channel category being filled.
import {readFileSync} from 'node:fs';
import {commonFor,loadCatalog,standardPaths} from './category-catalog.mjs';
import {categoryAlternatives,MENS_UNDERWEAR_CATEGORY} from './category.mjs';
import {sameCategoryLabel,validateLotteCategory,allLotteStandardPaths} from './lotte-category-validation.mjs';
import {readManualLotteCategory} from './lotte-category-choice.mjs';

const read=name=>JSON.parse(readFileSync(new URL('./data/'+name,import.meta.url),'utf8'));
const label=s=>String(s||'').replace(/^[A-Z0-9]+\s*[:：]\s*/i,'').replace(/\s/g,'');
const aliases=s=>new Set([...categoryAlternatives(String(s||'')),...(label(s)==='남성셔츠'?['남성남방셔츠']:[])].map(label));
function commonPath(product,common){
 const c=product.category||{},group=common.genders.find(g=>g.gender===product.gender);
 if(!group||c.commonMajor&&!sameCategoryLabel(c.commonMajor,group.major))return null;
 const exact=group.middles.flatMap(m=>sameCategoryLabel(c.commonMiddle,m.middle)?m.children.filter(s=>sameCategoryLabel(c.commonSmall,s)).map(s=>({major:group.major,middle:m.middle,small:s})):[]);
 if(exact.length===1)return exact[0];
 const middleAliases=aliases(c.commonMiddle),smallAliases=aliases(c.commonSmall);
 const found=group.middles.flatMap(m=>middleAliases.has(label(m.middle))?m.children.filter(s=>smallAliases.has(label(s))).map(s=>({major:group.major,middle:m.middle,small:s})):[]);
 return found.length===1?found[0]:null;
}
function withPath(category,path){
 return {...category,channelMajor:path.major.name,channelMiddle:path.middle.name,channelSmall:path.small.name,channelDetail:path.detail?.name||'',channelCodes:Object.fromEntries(['major','middle','small','detail'].map(k=>[k,path[k]?.code||'']))};
}
function rank(path,product){
 const text=[product.rawName||product.name,...(product.sourceCategory||[])].join(' '),c=product.category||{},leaf=path.small.name;
 let score=0;
 // Prefer the existing valid leaf, while explicit sleeve/type evidence wins.
 if(label(c.channelSmall)===label(leaf))score+=8;
 if(label(c.channelMiddle)===label(path.middle.name))score+=2;
 const cues=[[/반팔/,/반팔/],[/긴팔/,/긴팔/],[/민소매|나시|캐미솔/,/민소매/],[/카라|폴로|피케/,/카라/],[/브이|V\s*넥/i,/브이넥/],[/라운드|크루/,/라운드/],[/터틀|폴라/,/터틀|폴라/],[/프린트|프린팅/,/프린트/],[/후드|후디/,/후드/],[/집업|지퍼/,/집업/],[/맨투맨|스웨트셔츠/,/맨투맨/],[/패딩|푸퍼/,/패딩/],[/데님|청바지/,/데님|청바지|청반바지/],[/반바지|쇼츠/,/반바지/],[/체크/,/체크/],[/스트라이프/,/스트라이프/],[/솔리드|무지/,/솔리드/],[/롱|맥시/,/롱/],[/하프|숏|쇼트/,/하프/],[/트렌치/,/트렌치/],[/와이드|부츠컷|배럴/,/와이드/],[/슬림|스키니/,/슬림/],[/일자|스트레이트/,/스트레이트/],[/니트/,/니트/]];
 for(const [input,target] of cues)if(input.test(text)&&target.test(leaf+' '+path.middle.name))score+=30;
 for(const [input,target] of [[/지워머|발열/,/발열내의/],[/타이즈|레깅스/,/타이즈/],[/드로즈/,/드로즈/],[/브라탑/,/브라탑/],[/브라렛/,/브라렛/],[/세트/,/세트/],[/백팩|배낭/,/백팩/],[/볼캡|야구/,/야구모자/],[/비니/,/비니/],[/버킷|벙거지/,/버킷/]])if(input.test(text)&&target.test(leaf))score+=40;
 if(/^(내의|드로즈|민소매|런닝\/나시|노와이어|삼각팬티|상하세트잠옷|홈웨어세트)$/.test(leaf))score+=4;
 if(/타이즈|레깅스/.test(text)&&leaf==='타이즈')score+=15;
 if(/\(19\)/.test(leaf))score-=100;
 if(product.gender==='남성'&&/반팔/.test(text)&&/긴팔/.test(path.middle.name))score-=200;
 if(/조끼|베스트/.test(text)&&/점퍼/.test(leaf))score-=150;
 // Stable, editable defaults when a first category has several subtypes.
 if(/^(라운드넥가디건|라운드넥니트|라운드넥티셔츠|라운드넥반팔티|솔리드셔츠|캐쥬얼조끼|치노면바지|면바지\/밴딩팬츠|스트레이트핏|캐주얼자켓|하프코트|미디스커트|롱\/맥시원피스)$/.test(leaf))score+=5;
 return score;
}
function broaderCandidates(common,paths,gender){
 const leaf=label(common.small),pick=(middle,small)=>paths.filter(p=>p.middle.name===middle&&(!small||p.small.name===small));
 if(leaf==='남성스포츠속옷')return pick('남성팬티','기능성팬티');
 if(leaf==='여성스포츠속옷'||leaf==='여성임부속옷')return pick('브라','노와이어');
 if(/사파리/.test(leaf))return pick('점퍼/패딩/야상','야상/사파리점퍼');
 if(leaf==='여성스웨트셔츠/후드/집업')return pick('티셔츠/맨투맨').filter(p=>/맨투맨|후드/.test(p.small.name));
 if(leaf==='남성패션트레이닝복')return pick('바지','기모팬츠');
 if(leaf==='남성피혁의류')return pick('자켓/코트','가죽자켓');
 if(/밍크|기타모피/.test(leaf))return pick('가죽/모피','모피/퍼코트');
 if(/기타.*아우터/.test(leaf))return pick('점퍼/패딩/야상',gender==='남성'?'집업점퍼':'집업/야구/항공점퍼');
 if(/의류세트/.test(leaf))return pick(gender==='여성'?'트레이닝복':'정장',gender==='여성'?'트레이닝세트':'정장세트');
 // These are real selectable broader leaves, explicitly marked for review.
 // Never fabricate a specialised portal path or a category code.
 return pick('기타','기타').filter(p=>p.major.name==='브랜드'+gender+'의류');
}
export function bridgeLotteCategory(product,{standard=loadCatalog(),common=read('category-catalog-common.json')}={}){
 const before={...product.category},first=commonPath(product,common);
 if(before.manualSelection){
  try{
   const category=readManualLotteCategory(product,before.manualSelection,{standard,common});
   const validation=validateLotteCategory({...product,category},{standard,common});
   return {complete:true,manual:true,review:!validation.ready,category,message:'직접 선택한 1차·2차 분류를 유지합니다.'};
  }catch(error){return {complete:false,review:true,category:before,message:error.message};}
 }
 if(!before.commonMiddle?.trim()||!before.commonSmall?.trim())return {complete:false,review:true,category:before,message:'1차 공통분류를 먼저 채워 주세요.'};
 if(!first){
  const requested=label(before.commonSmall),allPaths=allLotteStandardPaths(standard);
  let accessory=[];
  if(/양말/.test(requested))accessory=allPaths.filter(p=>p.major.name==='브랜드잡화/넥타이'&&p.middle.name==='양말'&&p.small.name===product.gender+'양말');
  else if(/장갑/.test(requested))accessory=allPaths.filter(p=>p.major.name==='브랜드잡화/넥타이'&&p.middle.name==='패션장갑'&&p.small.name===product.gender+'장갑');
  else if(/모자|비니|볼캡|버킷/.test(requested))accessory=allPaths.filter(p=>p.major.name==='브랜드잡화/넥타이'&&p.middle.name==='모자');
  else if(/벨트/.test(requested))accessory=allPaths.filter(p=>p.major.name==='브랜드가방'&&p.middle.name==='벨트'&&p.small.name===product.gender+'벨트');
  else if(/가방|백팩|숄더|토트|크로스|배낭/.test(requested))accessory=allPaths.filter(p=>p.major.name==='브랜드가방'&&p.middle.name===product.gender+'가방');
  if(accessory.length){accessory.sort((a,b)=>rank(b,{...product,rawName:[requested,product.rawName||product.name].join(' ')})-rank(a,{...product,rawName:[requested,product.rawName||product.name].join(' ')})||a.small.code.localeCompare(b.small.code));return {complete:true,review:accessory.length>1,category:withPath(before,accessory[0]),message:'1차 잡화 분류 기준 2차 연결 · 세부 분류 수정 가능'};}
  if(/머플러$/.test(label(before.commonSmall))){
   const major=standard?.majors.find(m=>m.name==='브랜드잡화/넥타이'),middle=major?.middles.find(m=>m.name==='워머/목도리'),small=middle?.smalls.find(s=>s.name==='머플러');
   if(small)return {complete:true,review:false,category:withPath(before,{major,middle,small}),message:'1차 머플러 기준 2차 연결 완료'};
  }
  if(/^(남성|여성)벨트$/.test(label(before.commonSmall)))return {complete:true,review:product.gender==='여성',category:{...before,channelMajor:'브랜드가방',channelMiddle:'벨트',channelSmall:label(before.commonSmall),channelDetail:'',channelCodes:undefined},message:'1차 벨트 기준 2차 연결 · 세부 분류 수정 가능'};
  // Individually collected accessory paths remain outside the apparel tree.
  const verified=validateLotteCategory(product);
  if(verified.ready)return {complete:true,review:false,category:verified.category,message:'1차 기준 2차 분류 연결 완료'};
  if(before.channelMiddle&&before.channelSmall){
   const category={...before,channelMajor:before.channelMajor||'브랜드'+product.gender+'의류'};
   return {complete:true,review:true,category,message:'입력한 1차·2차 분류로 진행 · 세부 분류는 수정 가능'};
  }
  return {complete:false,review:true,category:before,message:'현재 1차 분류의 대응표를 찾지 못했습니다.'};
 }
 const category={...before,commonMajor:first.major,commonMiddle:first.middle,commonSmall:first.small};
 if(first.small===MENS_UNDERWEAR_CATEGORY.commonSmall&&!standard?.majors.some(m=>m.name==='브랜드언더웨어'))return {complete:true,review:false,category:{...category,...MENS_UNDERWEAR_CATEGORY,channelCodes:undefined},message:'1차 남성내의 기준으로 2차 연결 완료'};
 const paths=[...standardPaths(standard,product.gender),...allLotteStandardPaths(standard).filter(p=>p.major.name==='브랜드언더웨어')];
 let candidates=paths.filter(p=>{const mapped=commonFor(p,product.gender,common);return mapped&&sameCategoryLabel(first.small,mapped.small);});
 let broad=false;
 if(!candidates.length){candidates=broaderCandidates(first,paths,product.gender);broad=true;}
 if(!candidates.length)return {complete:false,review:true,category,message:'2차 분류표가 없습니다. 분류표를 다시 불러와 주세요.'};
 candidates.sort((a,b)=>rank(b,product)-rank(a,product)||String(a.small.code).localeCompare(String(b.small.code)));
 const path=candidates[0],result=withPath(category,path),review=broad||candidates.length>1&&!(sameCategoryLabel(before.channelMiddle,path.middle.name)&&sameCategoryLabel(before.channelSmall,path.small.name));
 return {complete:true,review,broad,category:result,message:broad?'1차 상품군의 기본 2차 분류 연결 · 세부 분류 수정 가능':review?'1차 기준 2차 분류 연결 · 세부 분류 수정 가능':'1차 기준 2차 분류 연결 완료'};
}
export function requireLotteCategoryBridge(product){
 const result=bridgeLotteCategory(product);
 if(!result.complete)throw Error(result.message);
 return result.category;
}
