import {smartstoreTitle,assertSmartstoreTitleLength} from './smartstore-title.mjs';
import {titleCandidates} from './naver-title.mjs';
import {keywordCandidates,createKeywordOptimizer} from './naver-keywords.mjs';

const synonyms={니트:['니트','스웨터','풀오버'],가디건:['가디건','카디건'],자켓:['자켓','재킷'],바지:['바지','팬츠'],티셔츠:['티셔츠','티'],패딩:['패딩','푸퍼']};
const featureWords=['브이넥','터틀넥','라운드','아가일','기모','경량','스트라이프','와이드','밴딩','체크','후드','집업','긴팔','반팔','숏','롱','데님','트레이닝','퀼팅'];
const neckAliases=['라운드넥','크루넥'];
const hasRoundNeck=product=>/크루넥|라운드(?:넥)?/.test(product.name+' '+product.rawName);
// Official naming is evidence of product facts, never evidence of popularity.
const factualWord=/^(?:브이넥|터틀넥|아가일|기모|경량|스트라이프|와이드|밴딩|체크|후드|집업|긴팔|반팔|숏|숏기장|롱|데님|트레이닝|퀼팅|슬림|레귤러|오버핏|코튼|면|울|캐시미어|나일론|폴리에스터|오리털|거위털|구스|덕|스판|린넨|\d+%)+$/;
function categoryAliases(product,kind){
 if(kind==='패딩'&&!/베스트|조끼/.test(String(product.name||'')+' '+String(product.rawName||'')))return ['패딩','푸퍼','패딩점퍼','패딩자켓','점퍼'];
 return synonyms[kind]||[kind];
}
// Compound search phrases are decomposed before comparing meanings. A gender
// or garment repeated inside 여성패딩/후드패딩 still counts as repetition.
function semanticAtoms(text,kind){
 const groups=[['brand',['지오다노','GIORDANO']],['female',['여성','여자']],['male',['남성','남자']],['short',['숏기장','쇼트','숏']],['hood',['후디','후드']],['line-cloud',['CLOUD','클라우드']],['line-light',['LIGHT','라이트']]];
 if(kind==='패딩')groups.push(['insulation',['패딩','푸퍼']]);
 groups.push(['garment',kind==='패딩'?['재킷','자켓','점퍼','아우터']:kind==='자켓'?['재킷','자켓','아우터']:kind==='코트'?['코트','아우터']:[...(synonyms[kind]||[kind]),'의류']]);
 const terms=groups.flatMap(([atom,names])=>names.map(name=>({name:name.toLowerCase(),atom}))).sort((a,b)=>b.name.length-a.name.length);
 const result=[];
 for(const token of text.toLowerCase().split(/\s+/).filter(Boolean)){
  let rest=token;
  while(rest){
   const term=terms.find(t=>rest.startsWith(t.name));
   if(term){result.push(term.atom);rest=rest.slice(term.name.length);continue;}
   let end=1;while(end<rest.length&&!terms.some(t=>rest.slice(end).startsWith(t.name)))end++;
   result.push('word:'+rest.slice(0,end));rest=rest.slice(end);
  }
 }
 return result;
}
export function hasDuplicateTitleMeaning(product,title){
 const kind=titleCandidates({...product,smartstoreName:''}).kind;
 const atoms=semanticAtoms(title,kind);
 return new Set(atoms).size!==atoms.length;
}
export function expandedTitleCandidates(product){
 const normalized=smartstoreTitle({...product,smartstoreName:''});
 const p={...product,name:normalized,smartstoreName:''},basic=titleCandidates(p),words=keywordCandidates(p);
 const aliases=categoryAliases(product,basic.kind);
 const necks=hasRoundNeck(product)?[...neckAliases.flatMap(neck=>[neck,neck+basic.kind]),'라운드'+basic.kind]:[];
 const sexes=product.gender==='남성'?['남성','남자']:product.gender==='여성'?['여성','여자']:[];
 for(const alias of aliases){
  words.push(alias,...sexes.map(sex=>sex+alias));
  for(const feature of featureWords)if(normalized.includes(feature)&&!alias.includes(feature))words.push(feature+alias);
 }
 return [...new Set([words[0],...aliases,...necks,...words])].slice(0,21);
}

export function composePopularTitle(product,ranking){
 let base=smartstoreTitle({...product,smartstoreName:''});
 const kind=titleCandidates({...product,smartstoreName:''}).kind;
 const scores=new Map(ranking.map(e=>[e.keyword,e.score]));
 const aliases=categoryAliases(product,kind);
 const currentSex=product.gender,otherSex=({남성:'남자',여성:'여자'})[currentSex];
 let sex=currentSex;
 if(otherSex&&(scores.get(otherSex+kind)||0)>(scores.get(currentSex+kind)||0))sex=otherSex;
 if(sex)base=base.replace(/^(지오다노) (남성|남자|여성|여자)(?= )/,'$1 '+sex);
 const mainAliases=kind==='패딩'?['패딩','푸퍼']:aliases;
 const primary=[...mainAliases].sort((a,b)=>(scores.get(b)||0)-(scores.get(a)||0))[0];
 let words=base.split(' ');const style=words.pop(),prefix=words.splice(0,sex?2:1);
 const positive=keyword=>(scores.get(keyword)||0)>0;
 // Compare garment-specific phrases; bare neckline searches have other intents.
 const neckScore=word=>Math.max(scores.get(word+kind)||0,word==='라운드넥'?(scores.get('라운드'+kind)||0):0);
 const neck=hasRoundNeck(product)?neckAliases.filter(word=>neckScore(word)>0).sort((a,b)=>neckScore(b)-neckScore(a))[0]:undefined;
 words=words.filter(word=>!/(?:크루넥|라운드(?:넥)?)/.test(word));
 if(neck)words.unshift(neck);
 words=words.filter(word=>word===neck||aliases.includes(word)||['자켓','재킷','점퍼'].includes(word)||factualWord.test(word)||/^(긴팔|반팔)티(?:셔츠)?$/.test(word));
 if(kind==='티셔츠')words=words.flatMap(word=>/^(긴팔|반팔)티(?:셔츠)?$/.test(word)?[word.slice(0,2),primary]:[word]);
 const verifiedMaterial=product.noticeVerified||product.fieldStatus?.material==='공식 이미지 대조 완료';
 if(kind==='티셔츠'&&verifiedMaterial&&/^면\s*100\s*%$/.test(product.material||'')&&positive('면티셔츠'))words.push('면100%');
 // Replace an exact category synonym without changing fabric, fit or model facts.
 for(let i=0;i<words.length;i++)if(mainAliases.includes(words[i]))words[i]=primary;
 if(kind==='패딩'&&!/조끼|베스트/.test(base)&&words.some(word=>['자켓','재킷','점퍼'].includes(word))){
  const garment=['점퍼','자켓','재킷'].sort((a,b)=>(scores.get(b)||0)-(scores.get(a)||0))[0];
  words=words.filter(word=>!['자켓','재킷','점퍼'].includes(word));words.unshift(garment);
 }
 const seen=new Set(semanticAtoms(prefix.join(' '),kind));
 const unique=word=>{
  const atoms=semanticAtoms(word,kind);
  if(atoms.some(atom=>seen.has(atom))||new Set(atoms).size!==atoms.length)return false;
  atoms.forEach(atom=>seen.add(atom));return true;
 };
 words=words.filter(unique);
 const initialLength=[...smartstoreTitle({...product,smartstoreName:[...prefix,...words,style].join(' ')})].length;
 if(initialLength<27&&words.includes('숏'))words=words.map(word=>word==='숏'?'숏기장':word);
 const extras=[]; // Never pad a short title with unverified product-line words.
 const scoreWord=word=>Math.max(0,...ranking.filter(e=>e.keyword.includes(word.replace(/기장$/,''))).map(e=>e.score));
 const featureSlots=words.map((w,i)=>i).filter(i=>featureWords.includes(words[i].replace(/기장$/,'')));
 const ordered=featureSlots.map(i=>words[i]).sort((a,b)=>scoreWord(b)-scoreWord(a));
 featureSlots.forEach((position,i)=>{words[position]=ordered[i];});
 const render=()=>smartstoreTitle({...product,smartstoreName:[...prefix,...extras,...words,style].join(' ')});
 // Long source names may omit low-interest descriptive words, never cut tokens
 // or numeric/material specifications to fit the limit.
 while([...render()].length>39){
  if(extras.length){extras.pop();continue;}
  const removable=words.map((word,i)=>({word,i})).filter(({word})=>!aliases.includes(word)&&!/\d|%|울|면|캐시미어|나일론|폴리에스터|오리털|거위털|구스|덕/.test(word)).sort((a,b)=>scoreWord(a.word)-scoreWord(b.word));
  if(!removable.length)throw Error('상품의 필수 정보를 보존하며 39자 이내로 작성할 수 없습니다. 스마트스토어 상품명을 직접 검토해 주세요.');
  words.splice(removable[0].i,1);
 }
 const title=render(),length=[...title].length;
 if(length<27)throw Error('중복 없는 상품명은 '+length+'자입니다: '+title+' — 공식 상품 정보만으로 27~39자를 채울 수 없어 검토가 필요합니다.');
 assertSmartstoreTitleLength(title);
 if(hasDuplicateTitleMeaning(product,title))throw Error('상품명에 의미가 중복된 표현이 있습니다. 직접 검토해 주세요.');
 const titleAtoms=new Set(semanticAtoms(title,kind));
 const selectedTerms=ranking.filter(entry=>entry.score>0&&semanticAtoms(entry.keyword,kind).every(atom=>titleAtoms.has(atom))).map(entry=>entry.keyword);
 return {title,length,selectedTerms,sourceTerms:extras};
}

export function createExpandedTitleOptimizer(options={}){
 const optimize=createKeywordOptimizer({...options,candidateFactory:expandedTitleCandidates});
 return async(product,credentials)=>{
  const normalized={...product,name:smartstoreTitle({...product,smartstoreName:''}),smartstoreName:''};
  const result=await optimize(normalized,credentials);
  const proposal=composePopularTitle(product,result.ranking);
  return {...proposal,originalTitle:smartstoreTitle(product),hasData:true,period:result.period,fromCache:result.fromCache,source:'네이버 데이터랩 통합검색어 트렌드 API',metric:'검색 상대지수',expanded:true,candidates:result.ranking,note:'상품 종류·동의어·성별·실제 특성의 검색 관심도를 공통 기준으로 비교했습니다. 품번·공백 포함 27~39자입니다. 월간 절대 검색량이나 노출 순위를 뜻하지 않습니다.'};
 };
}
