import {readFileSync,statSync} from 'node:fs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const RESEARCH_INDEX=path.join(path.dirname(fileURLToPath(import.meta.url)),'research/apparel-tags/index.json');
const legacyResearchIndex=path.join(path.dirname(fileURLToPath(import.meta.url)),'data/apparel-tag-research/index.json');
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
let cached=null,stamp='';const matches=new Map();

export async function importTagResearch(source,destination=RESEARCH_INDEX){
 const bytes=await readFile(source),d=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 if(d.schema_version!=='smartstore-apparel-tag-research/2.0.0'||!Array.isArray(d.observed_tags)||!Array.isArray(d.inferred_classifications)||!Array.isArray(d.evidence_rows))throw Error('지원하는 태그 조사 자료 형식이 아닙니다.');
 const observed=new Map(),pairs=new Set(),evidence=new Map(d.evidence_rows.map(e=>[e.evidence_id,e]));
 for(const t of d.observed_tags){
  if(!/^\d+$/.test(t.id)||typeof t.observed_name!=='string'||!t.observed_name.trim()||observed.has(t.tag_record_id)||pairs.has(t.id))throw Error('태그 ID·명칭 중복 또는 형식을 확인해 주세요.');
  if(!t.evidence_ids?.length||t.evidence_ids.some(id=>{const e=evidence.get(id);return !e||e.tag_record_id!==t.tag_record_id||e.id!==t.id||e.observed_name!==t.observed_name;}))throw Error('태그 관측 근거가 일치하지 않습니다.');
  observed.set(t.tag_record_id,t);pairs.add(t.id);
 }
 const tags=d.inferred_classifications.map(c=>{
  const t=observed.get(c.tag_record_id);if(!t||t.id!==c.id||t.observed_name!==c.observed_name)throw Error('태그 분류와 원본 명칭이 다릅니다.');
  return {id:t.id,name:t.observed_name,recordId:t.tag_record_id,evidenceIds:t.evidence_ids,decision:c.decision,reason:c.reason_code,kind:c.kind,conflict:!!t.conflict};
 });
 if(tags.length!==observed.size||new Set(tags.map(t=>t.id)).size!==tags.length)throw Error('태그 분류 수가 원본과 다릅니다.');
 const index={schema:'apparel-tag-local-index/1',sourceHash:createHash('sha256').update(bytes).digest('hex'),generatedAt:d.export_metadata?.generated_at,importedAt:new Date().toISOString(),observedCount:tags.length,tags};
 await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination+'.tmp',JSON.stringify(index));await rename(destination+'.tmp',destination);
 return {count:tags.length,sourceHash:index.sourceHash};
}

export function loadTagResearch(file=RESEARCH_INDEX){
 try{
  const stat=statSync(file),key=file+':'+stat.mtimeMs+':'+stat.size;
  if(key!==stamp){const d=JSON.parse(readFileSync(file,'utf8'));if(d.schema!=='apparel-tag-local-index/1'||!Array.isArray(d.tags))throw Error('태그 자료 형식을 확인해 주세요.');cached=d;stamp=key;matches.clear();}
  return cached;
 }catch(e){if(e.code==='ENOENT')return file===RESEARCH_INDEX?loadTagResearch(legacyResearchIndex):null;throw e;}
}

// Parse the complete label using supported garment meanings and evidenced
// attributes. Family guesses and character substrings alone never qualify.
export function matchResearchTags(product,index,{limit=60}={}){
 if(!index)return [];
 const source=normalize(product.rawName||product.name),description=normalize(product.officialDescription);
 const verifiedFacts=product.researchFacts?.style===product.style&&product.researchFacts?.sourceUrl===product.sourceUrl?product.researchFacts:null;
 const facts=source+description+normalize([...(verifiedFacts?.features||[]),...(verifiedFacts?.visualFeatures||[])].join(' '));
 const verified=product.noticeVerified||product.fieldStatus?.material==='공식 이미지 대조 완료';
 const material=verified?normalize(product.material):'';
 const tokens=[];const add=(names,allowed,type='feature')=>{for(const name of names){const term=normalize(name),negative=new RegExp('(?:무|비|노)'+term+'|'+term+'(?:이|가|는|은)?(?:없|아님|아닌|미사용|불포함|제외)');tokens.push({name:term,allowed:!!allowed&&!negative.test(facts),type});}};
 const kinds=[['원피스',/원피스|드레스/,['원피스','드레스']],['스커트',/스커트|치마/,['스커트','치마']],['레깅스',/레깅스/,['레깅스','팬츠','바지']],['래쉬가드',/래쉬가드|래시가드/,['래쉬가드','래시가드','수영복']],['수영복',/수영복/,['수영복']],['잠옷',/잠옷|파자마/,['잠옷','파자마','홈웨어']],['블라우스',/블라우스/,['블라우스','셔츠','상의']],['바람막이',/바람막이|윈드브레이커/,['바람막이','윈드브레이커','자켓','재킷','점퍼','아우터']],['조거팬츠',/조거팬츠|조거바지/,['조거팬츠','조거바지','팬츠','바지']],['반바지',/반바지|쇼츠/,['반바지','쇼츠','팬츠','바지']],['슬랙스',/슬랙스/,['슬랙스','팬츠','바지']],['청바지',/청바지|데님팬츠|데님바지/,['청바지','데님팬츠','데님바지','팬츠','바지']],['맨투맨',/맨투맨|스웨트셔츠|스웻셔츠/,['맨투맨','스웨트셔츠','스웻셔츠','티셔츠','티']],['가디건',/가디건|카디건/,['가디건','카디건']],['조끼',/조끼|베스트/,['조끼','베스트']],['후드티',/후드티|후디/,['후드티','티셔츠','티']],['티셔츠',/티셔츠|긴팔티|반팔티/,['티셔츠','티']],['니트',/니트(?!릴)|스웨터|풀오버/,['니트','스웨터','풀오버']],['셔츠',/(?<!티)셔츠|남방/,['셔츠','남방']],['패딩',/패딩|푸퍼|다운자켓|다운점퍼/,['패딩','푸퍼']],['코트',/코트/,['코트']],['자켓',/자켓|재킷|점퍼/,['자켓','재킷','점퍼']],['바지',/팬츠|바지/,['바지','팬츠']]];
 const hoodPullover=/후드풀오버/.test(source)&&!/니트|스웨터/.test(source);
 const kind=hoodPullover?kinds.find(([name])=>name==='후드티'):kinds.find(([,re])=>re.test(source));if(!kind)return [];
 const garments=new Set(kind[2]);
 if(kind[0]==='가디건'&&/니트|스웨터/.test(source))garments.add('니트');
 if(['코트','자켓','가디건'].includes(kind[0]))garments.add('아우터');
 if(['맨투맨','티셔츠','니트','가디건','셔츠','블라우스','후드티'].includes(kind[0]))garments.add('상의');
 if(kind[0]==='패딩'&&!/조끼|베스트/.test(source))for(const word of ['점퍼','자켓','재킷','아우터'])garments.add(word);
 const allGarments=new Set(kinds.flatMap(k=>k[2]).concat(['아우터','원피스','스커트','레깅스','잠옷','수영복','수트','정장','세트','가디건']));
 for(const g of allGarments)add([g],garments.has(g),'garment');
 add(['남성','남자','남성용','남자용'],product.gender==='남성','gender');add(['여성','여자','여성용','여자용'],product.gender==='여성','gender');add(['남녀공용','공용','유니섹스'],/남녀공용|유니섹스/.test(facts),'gender');
 const rules=[
  [['트레이닝'],/트레이닝/.test(facts)],[['오버사이즈'],/오버핏|루즈핏|오버사이즈/.test(facts)],
  [['반집업','하프집업'],/반집업|하프집업/.test(facts)],[['크롭','크롭핏'],/크롭/.test(facts)],[['하이웨스트'],/하이웨스트/.test(facts)],[['부츠컷'],/부츠컷/.test(facts)],
  [['스키니','스키니핏'],/스키니/.test(facts)],[['배기','배기핏'],/배기/.test(facts)],[['스트레이트','스트레이트핏','일자'],/스트레이트|일자/.test(facts)],
  [['퀼팅','누빔'],/퀼팅|누빔/.test(facts)],[['나일론'],/나일론/.test(facts+material)],[['폴리에스터','폴리에스테르'],/폴리에스터|폴리에스테르/.test(facts+material)],
  [['아크릴'],/아크릴/.test(facts+material)],[['레이온','인견'],/레이온|인견/.test(facts+material)],[['모달'],/모달/.test(facts+material)],
  [['실크'],/실크/.test(facts+material)],[['시폰'],/시폰/.test(facts)],[['새틴'],/새틴/.test(facts)],
  [['인조가죽','합성피혁','합성가죽'],/인조가죽|합성피혁|합성가죽/.test(facts+material)],[['가죽','레더'],/가죽|레더/.test(facts+material)&&!/인조가죽|합성피혁|합성가죽|페이크레더/.test(facts+material)],
  [['구스','구스다운','거위털'],/구스|거위털/.test(facts+material)],[['덕다운','오리털'],/덕다운|오리털/.test(facts+material)],[['코듀로이','골덴'],/코듀로이|골덴/.test(facts)],
  [['쭈리'],/쭈리|프렌치테리|frenchterry/.test(facts)],[['기모'],/기모|브러시드/.test(facts)],[['양기모'],/양기모/.test(facts)],[['히든밴딩'],/히든밴딩/.test(facts)],[['밴딩'],/밴딩/.test(facts)],
  [['테이퍼드','테이퍼드핏'],/테이퍼드/.test(facts)],[['레귤러핏','스탠다드핏'],/레귤러핏|스탠다드핏/.test(facts)],[['와이드','와이드핏'],/와이드/.test(facts)],[['세미와이드'],/세미와이드/.test(facts)],[['슬림','슬림핏'],/슬림/.test(facts)],[['오버핏','루즈핏'],/오버핏|루즈핏|오버사이즈/.test(facts)],
  [['긴팔','긴소매'],/긴팔|긴소매/.test(facts)],[['반팔','반소매'],/반팔|반소매/.test(facts)],[['민소매','슬리브리스'],/민소매|슬리브리스/.test(facts)],
  [['후드','후디'],/후드|후디/.test(facts)],[['집업','지퍼'],/집업|지퍼|풀집/.test(facts)],[['풀집업'],/풀집업|풀집|fullzip/.test(facts)],[['카라','칼라','폴로'],/카라|칼라|폴로/.test(facts)],
  [['라운드','라운드넥','크루넥'],/라운드|크루넥/.test(facts)],[['브이넥','v넥'],/브이넥|v넥/.test(facts)],[['터틀넥','목폴라'],/터틀넥|목폴라/.test(facts)],
  [['꽈배기','케이블'],/꽈배기|케이블/.test(facts)],[['골지','리브드'],/골지|리브드/.test(facts)],[['체크'],/체크/.test(facts)],[['스트라이프','단가라'],/스트라이프|단가라/.test(facts)],
  [['숏','쇼트'],/숏|쇼트/.test(facts)],[['롱'],/롱/.test(facts)],[['경량'],/경량/.test(facts)],[['단추','버튼'],/단추|버튼/.test(facts)],[['빅사이즈'],/빅사이즈/.test(facts)],
  [['면','코튼'],/코튼|면\d/.test(facts+material)],[['울','모직'],/(?<!겨)울|모직/.test(facts)||/(?:^|,)모\d/.test(material)],[['캐시미어'],/캐시미어/.test(facts+material)],[['린넨','리넨'],/린넨|리넨/.test(facts+material)],
  [['스판','스트레치'],/스판|스트레치/.test(facts)||/폴리우레탄[1-9]/.test(material)],[['데님'],/데님|청바지/.test(facts)],[['플리스','후리스'],/플리스|후리스/.test(facts)],
  [['봄'],/봄(?!버)/.test(facts)],[['여름','썸머'],/여름|썸머/.test(facts)],[['가을'],/가을/.test(facts)],[['겨울'],/겨울/.test(facts)]
 ];
 for(const [names,allowed] of rules)add(names,allowed);
 tokens.sort((a,b)=>b.name.length-a.name.length);
 const result=[];
 for(const tag of index.tags){
  const scopeException=tag.reason==='explicit_skirt_dress'&&['원피스','스커트'].includes(kind[0]);
  if((tag.decision!=='include'&&!scopeException)||tag.conflict||!/^\d+$/.test(tag.id)||(!scopeException&&!['garment','conditional_attribute'].includes(tag.kind)))continue;
  let rest=normalize(tag.name),parts=[],valid=true;
  while(rest){const token=tokens.find(t=>rest.startsWith(t.name));if(!token||!token.allowed){valid=false;break;}parts.push(token);rest=rest.slice(token.name.length);}
  const garment=parts.some(t=>t.type==='garment');
  if(!valid||!parts.length||((tag.kind==='garment'||scopeException)&&!garment)||(tag.kind==='conditional_attribute'&&(garment||!parts.some(t=>t.type==='feature'))))continue;
  const features=parts.filter(t=>t.type==='feature').map(t=>t.name);
  result.push({id:tag.id,name:tag.name,recordId:tag.recordId,features,parent:parts.some(t=>t.type==='garment'&&t.name!==normalize(kind[0])),gender:parts.some(t=>t.type==='gender'),score:features.length*10+(normalize(tag.name).endsWith(normalize(kind[0]))?20:0)+parts.filter(t=>t.type==='gender').length*8-Math.max(0,parts.filter(t=>t.type==='garment').length-1)*3});
 }
 result.sort((a,b)=>b.score-a.score||a.name.length-b.name.length||Number(a.id)-Number(b.id));
 const genderParent=result.filter(t=>t.parent&&t.gender&&!t.features.length).sort((a,b)=>Number(b.name.startsWith(product.gender||' '))-Number(a.name.startsWith(product.gender||' '))||Number(b.name.endsWith('티셔츠'))-Number(a.name.endsWith('티셔츠')))[0];
 const sleeveParent=result.filter(t=>t.parent&&t.gender&&t.features.length===1&&t.features.some(f=>['긴팔','긴소매','반팔','반소매','민소매'].includes(f))).sort((a,b)=>Number(b.name.startsWith(product.gender||' '))-Number(a.name.startsWith(product.gender||' '))||Number(b.name.endsWith('티셔츠'))-Number(a.name.endsWith('티셔츠')))[0];
 return [...new Map([result[0],genderParent,sleeveParent,...result].filter(Boolean).map(t=>[t.id,t])).values()].slice(0,limit);
}

export function researchForProduct(product){
 const index=loadTagResearch();if(!index)return {configured:false,count:0,candidates:[],titleTerms:[]};
 const key=JSON.stringify([stamp,product.rawName,product.name,product.gender,product.material,product.noticeVerified,product.fieldStatus?.material,product.officialDescription,product.researchFacts]);
 if(matches.has(key))return matches.get(key);
 const candidates=matchResearchTags(product,index),result={configured:true,count:index.observedCount,sourceHash:index.sourceHash,candidates,titleTerms:candidates.filter(t=>t.features.length&&t.name.length<=16).slice(0,8).map(t=>t.name)};
 if(matches.size>=100)matches.clear();matches.set(key,result);return result;
}
