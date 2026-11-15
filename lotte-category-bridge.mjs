// The first/common category is the source of truth. A missing fine-grained
// garment description must not prevent a second/channel category being filled.
import {readFileSync} from 'node:fs';
import {commonFor,loadCatalog,standardPaths} from './category-catalog.mjs';
import {categoryAlternatives,MENS_UNDERWEAR_CATEGORY} from './category.mjs';
import {sameCategoryLabel,validateLotteCategory} from './lotte-category-validation.mjs';

const read=name=>JSON.parse(readFileSync(new URL('./data/'+name,import.meta.url),'utf8'));
const label=s=>String(s||'').replace(/^[A-Z0-9]+\s*[:：]\s*/i,'').replace(/\s/g,'');
const aliases=s=>new Set(categoryAlternatives(String(s||'')).map(label));
function commonPath(product,common){
 const c=product.category||{},group=common.genders.find(g=>g.gender===product.gender);
 if(!group||c.commonMajor&&!sameCategoryLabel(c.commonMajor,group.major))return null;
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
 if(product.gender==='남성'&&/반팔/.test(text)&&/긴팔/.test(path.middle.name))score-=200;
 if(/조끼|베스트/.test(text)&&/점퍼/.test(leaf))score-=150;
 // Stable, editable defaults when a first category has several subtypes.
 if(/^(라운드넥가디건|라운드넥니트|라운드넥티셔츠|라운드넥반팔티|솔리드셔츠|캐쥬얼조끼|치노면바지|면바지\/밴딩팬츠|스트레이트핏|캐주얼자켓|하프코트|미디스커트|롱\/맥시원피스)$/.test(leaf))score+=5;
 return score;
}
function broaderCandidates(common,paths,gender){
 const leaf=label(common.small),pick=(middle,small)=>paths.filter(p=>p.middle.name===middle&&(!small||p.small.name===small));
 if(/사파리/.test(leaf))return pick('점퍼/패딩/야상','야상/사파리점퍼');
 if(leaf==='여성스웨트셔츠/후드/집업')return pick('티셔츠/맨투맨').filter(p=>/맨투맨|후드/.test(p.small.name));
 if(leaf==='남성패션트레이닝복')return pick('바지','기모팬츠');
 if(/밍크|기타모피/.test(leaf))return pick('가죽/모피','모피/퍼코트');
 if(/기타.*아우터/.test(leaf))return pick('점퍼/패딩/야상',gender==='남성'?'집업점퍼':'집업/야구/항공점퍼');
 if(/의류세트/.test(leaf))return pick(gender==='여성'?'트레이닝복':'정장',gender==='여성'?'트레이닝세트':'정장세트');
 // These are real selectable broader leaves, explicitly marked for review.
 // Never fabricate a specialised portal path or a category code.
 return pick('기타','기타');
}
export function bridgeLotteCategory(product,{standard=loadCatalog(),common=read('category-catalog-common.json')}={}){
 const before={...product.category},first=commonPath(product,common);
 if(!before.commonMiddle?.trim()||!before.commonSmall?.trim())return {complete:false,review:true,category:before,message:'1차 공통분류를 먼저 채워 주세요.'};
 if(!first){
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
 if(first.small===MENS_UNDERWEAR_CATEGORY.commonSmall)return {complete:true,review:false,category:{...category,...MENS_UNDERWEAR_CATEGORY,channelCodes:undefined},message:'1차 남성내의 기준으로 2차 연결 완료'};
 const paths=standardPaths(standard,product.gender);
 let candidates=paths.filter(p=>{const mapped=commonFor(p,product.gender,common);return mapped&&sameCategoryLabel(first.small,mapped.small);});
 let broad=false;
 if(!candidates.length){candidates=broaderCandidates(first,paths,product.gender);broad=true;}
 if(!candidates.length)return {complete:false,review:true,category,message:'2차 분류표가 없습니다. 분류표를 다시 불러와 주세요.'};
 candidates.sort((a,b)=>rank(b,product)-rank(a,product)||String(a.small.code).localeCompare(String(b.small.code)));
 const path=candidates[0],result=withPath(category,path),review=broad||candidates.length>1;
 return {complete:true,review,broad,category:result,message:broad?'1차 상품군의 기본 2차 분류 연결 · 세부 분류 수정 가능':review?'1차 기준 2차 분류 연결 · 세부 분류 수정 가능':'1차 기준 2차 분류 연결 완료'};
}
export function requireLotteCategoryBridge(product){
 const result=bridgeLotteCategory(product);
 if(!result.complete)throw Error(result.message);
 return result.category;
}
