import {smartstoreTitle,assertSmartstoreTitleLength} from './smartstore-title.mjs';
import {titleCandidates} from './naver-title.mjs';
import {keywordCandidates,createKeywordOptimizer} from './naver-keywords.mjs';
import {researchForProduct} from './apparel-tag-research.mjs';
import {garmentSynonyms,featureSynonyms,titleFeatureGroups,titleCategoryAliases,featureQueryForms,mentionedFeatureVariant} from './apparel-title-synonyms.mjs';

const synonyms=garmentSynonyms;
const featureWords=['브이넥','터틀넥','라운드','아가일','기모','경량','스트라이프','와이드','밴딩','체크','후드','집업','긴팔','반팔','숏','롱','데님','트레이닝','퀼팅'];
const neckAliases=['라운드넥','크루넥'];
function officialTitleFacts(product){
 const facts=product.researchFacts;
 const matched=facts&&facts.style===product.style&&product.sourceUrl&&facts.sourceUrl===product.sourceUrl;
 // Styling examples describe other garments; negative clauses do not prove a
 // positive attribute of this garment.
 const mixedPattern=/(?:솔리드|무지).*(?:스트라이프|단가라|줄무늬)|(?:스트라이프|단가라|줄무늬).*(?:솔리드|무지)/.test(product.officialDescription||'');
 const description=String(product.officialDescription||'').split(/[.!?。\n]+/).filter(text=>!/코디|매치|어울리|없|아닌|않|미사용/.test(text)&&!(mixedPattern&&/스트라이프|단가라|줄무늬/.test(text))).join(' ');
 return [product.name,product.rawName,description,...(matched?[...(facts.features||[]),...(facts.visualFeatures||[])]:[])].filter(Boolean).join(' ');
}
const hasRoundNeck=product=>/크루\s*넥|라운드\s*넥/.test(officialTitleFacts(product))||/라운드/.test(product.name+' '+product.rawName);
// Use official descriptions and same-product reviewed image facts as well as
// names. Material OCR still requires verification; seasons are not inferred.
function productFeatures(product){
 return titleFeatureGroups(officialTitleFacts(product),product);
}
// Official naming is evidence of product facts, never evidence of popularity.
const factualWord=/^(?:브이넥|터틀넥|아가일|기모|경량|스트라이프|와이드|테이퍼드|히든밴딩|밴딩|브러시드|체크|후드|집업|긴팔|반팔|숏|숏기장|롱|데님|트레이닝|퀼팅|슬림|레귤러|오버핏|코튼|면|울|캐시미어|나일론|폴리에스터|오리털|거위털|구스|덕|스판|린넨|\d+%)+$/;
const categoryAliases=titleCategoryAliases;
// Compound search phrases are decomposed before comparing meanings. A gender
// or garment repeated inside 여성패딩/후드패딩 still counts as repetition.
function semanticAtoms(text,kind){
 const groups=[['brand',['지오다노','GIORDANO']],['female',['여성용','여자용','여성','여자']],['male',['남성용','남자용','남성','남자']],['short',['숏기장','쇼트','숏']],['hood',['후디','후드']],['collar',['폴로카라','카라넥','폴로','카라']],['zip',['풀집업','집업']],['fleece',['플리스','후리스']],['brushed',['브러시드','기모']],['long-sleeve',['긴소매','긴팔']],['short-sleeve',['반소매','반팔']],['cotton',['면','코튼']],['fit',['오버사이즈','오버핏','레귤러핏','슬림핏','테이퍼드']],['banding',['히든밴딩','밴딩']],['cable',['케이블','꽈배기']],['rib',['골지','리브드']],['linen',['린넨','리넨']],['line-cloud',['CLOUD','클라우드']],['line-light',['LIGHT','라이트']]];
 for(const group of featureSynonyms){
  const id=group.id==='short-length'?'short':group.id;
  const existing=groups.find(([atom])=>atom===id),variants=[...group.variants,...(group.extend?.('폴로')||[])];
  if(existing)existing[1]=[...new Set([...existing[1],...variants])];else groups.push([id,variants]);
 }
 if(kind==='패딩')groups.push(['insulation',['패딩','푸퍼']]);
 groups.push(['garment',kind==='패딩'?['재킷','자켓','점퍼','아우터']:kind==='자켓'?['재킷','자켓','아우터']:kind==='코트'?['코트','아우터']:[...(synonyms[kind]||[kind]),...(kind==='바지'?['슬랙스','청바지']:[]),'의류']]);
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
 const features=productFeatures(product);
 const queries=features.flatMap(f=>f.variants.flatMap(v=>featureQueryForms(v).flatMap(term=>
  [...new Set([basic.kind,...aliases])].flatMap(kind=>[term+kind,...sexes.map(sex=>sex+term+kind)])
 )));
 const combined=features.flatMap((f,i)=>features.slice(i+1).map(g=>f.variants[0].replace(/100%$/,'')+g.variants[0].replace(/100%$/,'')+basic.kind));
 for(const alias of aliases){
  words.push(alias,...sexes.map(sex=>sex+alias));
  for(const feature of featureWords)if(normalized.includes(feature)&&!alias.includes(feature))words.push(feature+alias);
 }
 const variantPairs=features.filter(f=>f.variants.length>1).flatMap(f=>f.variants.flatMap(v=>featureQueryForms(v).flatMap(form=>{
  const term=form+(aliases[0]||basic.kind);
  return sexes.length?[sexes[0]+term,term]:[term];
 })));
 const mandatory=[...new Set([words[0],...aliases.flatMap(alias=>[alias,...sexes.map(sex=>sex+alias)]),...variantPairs])];
 const excludedAliases=(synonyms[basic.kind]||[]).filter(alias=>!aliases.includes(alias));
 const researchTerms=researchForProduct(product).titleTerms.filter(term=>
  !(excludedAliases.some(alias=>term.includes(alias))&&!aliases.some(alias=>term.includes(alias)))&&
  !featureSynonyms.some(group=>group.variants.some(word=>word.length>1&&term.includes(word))&&!features.some(f=>f.id===group.id))
 );
 const optional=[...new Set([...researchTerms,...necks,...queries,...words,...combined])].filter(term=>!mandatory.includes(term));
 return [...mandatory,...optional.slice(0,Math.max(0,49-mandatory.length))];
}

export function composePopularTitle(product,ranking){
 let base=smartstoreTitle({...product,smartstoreName:''});
 const kind=titleCandidates({...product,smartstoreName:''}).kind;
 const scores=new Map(ranking.map(e=>[e.keyword,e.score]));
 const aliases=categoryAliases(product,kind);
 const sex=product.gender;
 if(sex)base=base.replace(/^(지오다노) (남성|남자|여성|여자)(?= )/,'$1 '+sex);
 const mainAliases=kind==='패딩'?['패딩','푸퍼']:aliases;
 const aliasScore=alias=>Math.max(0,...ranking.filter(entry=>entry.keyword.endsWith(alias)).map(entry=>entry.score));
 const primary=[...mainAliases].sort((a,b)=>aliasScore(b)-aliasScore(a))[0];
 let words=base.split(' ');const style=words.pop(),prefix=words.splice(0,sex?2:1);
 const genderVariants=sex==='남성'?['남성','남자']:sex==='여성'?['여성','여자']:[];
 const genderScore=word=>Math.max(0,...ranking.filter(entry=>entry.keyword.startsWith(word)&&aliases.some(alias=>entry.keyword.endsWith(alias))).map(entry=>entry.score));
 if(sex)prefix[1]=[...genderVariants].sort((a,b)=>genderScore(b)-genderScore(a))[0];
 // Compare garment-specific phrases; bare neckline searches have other intents.
 const neckScore=word=>Math.max(scores.get(word+kind)||0,word==='라운드넥'?(scores.get('라운드'+kind)||0):0);
 const neck=hasRoundNeck(product)?[...neckAliases].sort((a,b)=>neckScore(b)-neckScore(a))[0]:undefined;
 words=words.filter(word=>!/(?:크루넥|라운드(?:넥)?)/.test(word));
 if(neck)words.unshift(neck);
 const features=productFeatures(product);
 const featureScore=word=>{
  const group=features.find(feature=>feature.variants.includes(word));
  return Math.max(0,...ranking.filter(e=>[kind,...aliases].some(alias=>e.keyword.endsWith(alias))&&(group?mentionedFeatureVariant(e.keyword,group)===word:e.keyword.includes(word))).map(e=>e.score));
 };
 const choices=features.map(f=>({...f,ranked:f.variants.filter(v=>featureScore(v)>0).sort((a,b)=>featureScore(b)-featureScore(a))})).filter(f=>f.ranked.length);
 // Remove compound source spellings before adding their measured equivalent.
 words=words.join(' ').replace(/풀\s*(?:집업|집|지퍼)/g,'풀집업').split(' ');
 words=words.filter(word=>!choices.some(f=>f.variants.includes(word))&&word!=='폴로');
 words=words.filter(word=>word===neck||aliases.includes(word)||['자켓','재킷','점퍼'].includes(word)||factualWord.test(word)||/^(긴팔|반팔)티(?:셔츠)?$/.test(word));
 if(kind==='티셔츠')words=words.flatMap(word=>/^(긴팔|반팔)티(?:셔츠)?$/.test(word)?[word.slice(0,2),primary]:[word]);
 const materialIds=['wool','cotton','cashmere','linen'];
 words.unshift(...[...choices].sort((a,b)=>Number(materialIds.includes(b.id))-Number(materialIds.includes(a.id))).map(f=>f.ranked[0]));
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
 const extras=[];
 const scoreWord=word=>Math.max(0,...ranking.filter(e=>e.keyword.includes(word.replace(/기장$/,''))).map(e=>e.score));
 const featureSlots=words.map((w,i)=>i).filter(i=>featureWords.includes(words[i].replace(/기장$/,'')));
 const ordered=featureSlots.map(i=>words[i]).sort((a,b)=>scoreWord(b)-scoreWord(a));
 featureSlots.forEach((position,i)=>{words[position]=ordered[i];});
 const render=()=>smartstoreTitle({...product,smartstoreName:[...prefix,...extras,...words,style].join(' ')});
 // Meet the minimum with distinct evidenced facts, preserving the API winner
 // of each synonym group rather than substituting a less popular long word.
 const tryWords=candidate=>{
  const proposed=smartstoreTitle({...product,smartstoreName:[...prefix,...extras,...candidate,style].join(' ')});
  if([...proposed].length>39||hasDuplicateTitleMeaning(product,proposed))return false;
  words=candidate;return true;
 };
 for(const feature of [...features].sort((a,b)=>Math.max(...b.variants.map(featureScore))-Math.max(...a.variants.map(featureScore)))){
  if([...render()].length>=27)break;
  const variants=[...feature.variants].sort((a,b)=>featureScore(b)-featureScore(a));
  if(variants.some(word=>words.includes(word)))continue;
  for(const word of variants)if(tryWords([word,...words]))break;
 }
 if([...render()].length<27&&/\bCLOUD\s+LIGHT\b/i.test(product.rawName||'')){
  extras.push('CLOUD LIGHT');
  if([...render()].length>39)extras.pop();
 }
 // Long source names may omit low-interest descriptive words, never cut tokens
 // or numeric/material specifications to fit the limit.
 while([...render()].length>39){
  if(extras.length){extras.pop();continue;}
  const removable=words.map((word,i)=>({word,i})).filter(({word})=>!aliases.includes(word)&&!/\d|%|울|면|캐시미어|나일론|폴리에스터|오리털|거위털|구스|덕/.test(word)).sort((a,b)=>scoreWord(a.word)-scoreWord(b.word));
  if(!removable.length)throw Error('상품의 필수 정보를 보존하며 39자 이내로 작성할 수 없습니다. 스마트스토어 상품명을 직접 검토해 주세요.');
  words.splice(removable[0].i,1);
 }
 const title=render(),length=[...title].length;
 assertSmartstoreTitleLength(title);
 if(hasDuplicateTitleMeaning(product,title))throw Error('상품명에 의미가 중복된 표현이 있습니다. 직접 검토해 주세요.');
 const titleAtoms=new Set(semanticAtoms(title,kind));
 const selectedTerms=ranking.filter(entry=>entry.score>0&&semanticAtoms(entry.keyword,kind).every(atom=>titleAtoms.has(atom))&&
  (!genderVariants.some(word=>entry.keyword.startsWith(word))||entry.keyword.startsWith(prefix[1]))&&
  !mainAliases.some(alias=>alias!==primary&&entry.keyword.endsWith(alias)&&!entry.keyword.endsWith(primary))&&features.every(feature=>{
  const mentioned=mentionedFeatureVariant(entry.keyword,feature);
  return !mentioned||mentioned===mentionedFeatureVariant(title,feature);
 })).map(entry=>entry.keyword);
 return {title,length,selectedTerms,sourceTerms:extras};
}

export function createExpandedTitleOptimizer(options={}){
 const researchProvider=options.researchProvider||researchForProduct;
 const optimize=createKeywordOptimizer({...options,candidateFactory:expandedTitleCandidates});
 return async(product,credentials)=>{
  const research=researchProvider(product);
  const normalized={...product,name:smartstoreTitle({...product,smartstoreName:''}),smartstoreName:''};
  const result=await optimize(normalized,credentials);
  const proposal=composePopularTitle(product,result.ranking);
  return {...proposal,originalTitle:smartstoreTitle(product),hasData:true,researchUsed:research.candidates.length>0,referenceTerms:research.titleTerms,period:result.period,fromCache:result.fromCache,source:'네이버 데이터랩 통합검색어 트렌드 API',metric:'검색 상대지수',expanded:true,categoryAudit:result.categoryAudit,candidates:result.ranking,note:result.categoryAudit.note+' 상품 종류·동의어·성별·실제 특성의 검색 관심도를 공통 기준으로 비교했습니다. 품번·공백 포함 27~39자를 충족하는 상품명만 제안합니다. 길이 보강에도 공식 상품 근거만 사용합니다. 월간 절대 검색량이나 노출 순위를 뜻하지 않습니다.'};
 };
}
