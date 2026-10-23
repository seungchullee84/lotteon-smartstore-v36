import {smartstoreTitle,assertSmartstoreTitleLength} from './smartstore-title.mjs';
import {titleCandidates} from './naver-title.mjs';
import {keywordCandidates,createKeywordOptimizer} from './naver-keywords.mjs';

const synonyms={니트:['니트','스웨터','풀오버'],가디건:['가디건','카디건'],자켓:['자켓','재킷'],바지:['바지','팬츠'],티셔츠:['티셔츠','티'],패딩:['패딩','푸퍼']};
const featureWords=['브이넥','터틀넥','라운드','아가일','기모','경량','스트라이프','와이드','밴딩','체크','후드','집업','긴팔','반팔','숏','롱','데님','트레이닝','퀼팅'];
export function expandedTitleCandidates(product){
 const normalized=smartstoreTitle({...product,smartstoreName:''});
 const p={...product,name:normalized,smartstoreName:''},basic=titleCandidates(p),words=keywordCandidates(p);
 const aliases=synonyms[basic.kind]||[basic.kind];
 const sexes=product.gender==='남성'?['남성','남자']:product.gender==='여성'?['여성','여자']:[];
 for(const alias of aliases){
  words.push(alias,...sexes.map(sex=>sex+alias));
  for(const feature of featureWords)if(normalized.includes(feature)&&!alias.includes(feature))words.push(feature+alias);
 }
 return [...new Set(words)].slice(0,21);
}

export function composePopularTitle(product,ranking){
 let base=smartstoreTitle({...product,smartstoreName:''});
 const kind=titleCandidates({...product,smartstoreName:''}).kind;
 const scores=new Map(ranking.map(e=>[e.keyword,e.score]));
 const aliases=synonyms[kind]||[kind];
 const currentSex=product.gender,otherSex=({남성:'남자',여성:'여자'})[currentSex];
 let sex=currentSex;
 if(otherSex&&(scores.get(otherSex+kind)||0)>(scores.get(currentSex+kind)||0))sex=otherSex;
 if(sex)base=base.replace(/^(지오다노) (남성|남자|여성|여자)(?= )/,'$1 '+sex);
 const primary=[...aliases].sort((a,b)=>(scores.get(b)||0)-(scores.get(a)||0))[0];
 const words=base.split(' '),style=words.pop(),prefix=words.splice(0,sex?2:1);
 // Replace an exact category synonym without changing fabric, fit or model facts.
 for(let i=0;i<words.length;i++)if(aliases.includes(words[i]))words[i]=primary;
 const scoreWord=word=>Math.max(0,...ranking.filter(e=>e.keyword.includes(word)).map(e=>e.score));
 const featureSlots=words.map((w,i)=>i).filter(i=>featureWords.includes(words[i]));
 const ordered=featureSlots.map(i=>words[i]).sort((a,b)=>scoreWord(b)-scoreWord(a));
 featureSlots.forEach((position,i)=>{words[position]=ordered[i];});
 const render=extra=>smartstoreTitle({...product,smartstoreName:[...prefix,...words,...extra,style].join(' ')});
 // Long source names may omit low-interest descriptive words, never cut tokens
 // or numeric/material specifications to fit the limit.
 while([...render([])].length>39){
  const removable=words.map((word,i)=>({word,i})).filter(({word})=>!aliases.includes(word)&&!/\d|%|울|면|캐시미어|나일론|폴리에스터|오리털|거위털|구스|덕/.test(word)).sort((a,b)=>scoreWord(a.word)-scoreWord(b.word));
  if(!removable.length)throw Error('상품의 필수 정보를 보존하며 39자 이내로 작성할 수 없습니다. 스마트스토어 상품명을 직접 검토해 주세요.');
  words.splice(removable[0].i,1);
 }
 const compact=render([]).replace(/\s/g,'');
 const otherGender=sex===currentSex?otherSex:currentSex;
 const candidates=ranking.filter(e=>e.score>0&&!compact.includes(e.keyword)&&!(otherGender&&e.keyword.startsWith(otherGender))&&render([e.keyword])!==render([])).slice(0,18);
 let best=null;
 function visit(start,selected,utility){
  const title=render(selected.map(e=>e.keyword)),length=[...title].length;
  if(length>=32&&length<=39){
   const value=utility-Math.abs(length-36)*0.001;
   if(!best||value>best.value)best={title,length,value,selectedTerms:selected.map(e=>e.keyword)};
  }
  if(length>=39||selected.length>=2)return;
  for(let i=start;i<candidates.length;i++){
   const entry=candidates[i];
   if(selected.some(e=>e.keyword.includes(entry.keyword)||entry.keyword.includes(e.keyword)))continue;
   if([...render([...selected,entry].map(e=>e.keyword))].length>39)continue;
   visit(i+1,[...selected,entry],utility+Math.log1p(entry.score));
  }
 }
 visit(0,[],0);
 if(!best)throw Error('상품에 맞는 검색 자료만으로 품번·공백 포함 32~39자를 구성하지 못했습니다. 상품 특성을 확인하거나 상품명을 직접 작성해 주세요.');
 assertSmartstoreTitleLength(best.title);
 return {title:best.title,length:best.length,selectedTerms:best.selectedTerms};
}

export function createExpandedTitleOptimizer(options={}){
 const optimize=createKeywordOptimizer({...options,candidateFactory:expandedTitleCandidates});
 return async(product,credentials)=>{
  const normalized={...product,name:smartstoreTitle({...product,smartstoreName:''}),smartstoreName:''};
  const result=await optimize(normalized,credentials);
  const proposal=composePopularTitle(product,result.ranking);
  return {...proposal,originalTitle:smartstoreTitle(product),hasData:true,period:result.period,fromCache:result.fromCache,source:'네이버 데이터랩 통합검색어 트렌드 API',metric:'검색 상대지수',expanded:true,candidates:result.ranking,note:'상품 종류·동의어·성별·실제 특성의 검색 관심도를 공통 기준으로 비교했습니다. 품번·공백 포함 32~39자입니다. 월간 절대 검색량이나 노출 순위를 뜻하지 않습니다.'};
 };
}
