import {readFileSync,statSync} from 'node:fs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const RESEARCH_INDEX=path.join(path.dirname(fileURLToPath(import.meta.url)),'data/apparel-tag-research/index.json');
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
  return {id:t.id,name:t.observed_name,recordId:t.tag_record_id,evidenceIds:t.evidence_ids,decision:c.decision,kind:c.kind,conflict:!!t.conflict};
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
 }catch(e){if(e.code==='ENOENT')return null;throw e;}
}

// Parse the complete label using supported garment meanings and evidenced
// attributes. Family guesses and character substrings alone never qualify.
export function matchResearchTags(product,index,{limit=30}={}){
 if(!index)return [];
 const source=normalize(product.rawName||product.name),description=normalize(product.officialDescription),facts=source+description;
 const verified=product.noticeVerified||product.fieldStatus?.material==='공식 이미지 대조 완료';
 const material=verified?normalize(product.material):'';
 const tokens=[];const add=(names,allowed,type='feature')=>{for(const name of names)tokens.push({name:normalize(name),allowed:!!allowed,type});};
 const kinds=[['슬랙스',/슬랙스/,['슬랙스','팬츠','바지']],['청바지',/청바지|데님팬츠|데님바지/,['청바지','데님팬츠','데님바지','팬츠','바지']],['맨투맨',/맨투맨|스웨트셔츠/,['맨투맨','스웨트셔츠']],['가디건',/가디건|카디건/,['가디건','카디건']],['조끼',/조끼|베스트/,['조끼','베스트']],['티셔츠',/티셔츠|긴팔티|반팔티/,['티셔츠','티']],['니트',/니트|스웨터|풀오버/,['니트','스웨터','풀오버']],['셔츠',/(?<!티)셔츠/,['셔츠']],['패딩',/패딩|푸퍼|다운자켓|다운점퍼/,['패딩','푸퍼']],['코트',/코트/,['코트']],['자켓',/자켓|재킷|점퍼/,['자켓','재킷','점퍼']],['바지',/팬츠|바지/,['바지','팬츠']]];
 const kind=kinds.find(([,re])=>re.test(source));if(!kind)return [];
 const garments=new Set(kind[2]);
 if(kind[0]==='가디건'&&/니트|스웨터/.test(source))garments.add('니트');
 if(kind[0]==='패딩'&&!/조끼|베스트/.test(source))for(const word of ['점퍼','자켓','재킷','아우터'])garments.add(word);
 const allGarments=new Set(kinds.flatMap(k=>k[2]).concat(['아우터','원피스','스커트','레깅스','잠옷','수영복','수트','정장','세트','가디건']));
 for(const g of allGarments)add([g],garments.has(g),'garment');
 add(['남성','남자','남성용','남자용'],product.gender==='남성','gender');add(['여성','여자','여성용','여자용'],product.gender==='여성','gender');add(['남녀공용','공용','유니섹스'],/남녀공용|유니섹스/.test(facts),'gender');
 const rules=[
  [['기모'],/기모|브러시드/.test(facts)],[['양기모'],/양기모/.test(facts)],[['히든밴딩'],/히든밴딩/.test(facts)],[['밴딩'],/밴딩/.test(facts)],
  [['테이퍼드','테이퍼드핏'],/테이퍼드/.test(facts)],[['레귤러핏','스탠다드핏'],/레귤러핏|스탠다드핏/.test(facts)],[['와이드','와이드핏'],/와이드/.test(facts)],[['세미와이드'],/세미와이드/.test(facts)],[['슬림','슬림핏'],/슬림/.test(facts)],[['오버핏','루즈핏'],/오버핏|루즈핏|오버사이즈/.test(facts)],
  [['긴팔','긴소매'],/긴팔|긴소매/.test(facts)],[['반팔','반소매'],/반팔|반소매/.test(facts)],[['민소매','슬리브리스'],/민소매|슬리브리스/.test(facts)],
  [['후드','후디'],/후드|후디/.test(facts)],[['집업','지퍼'],/집업|지퍼|풀집/.test(facts)],[['풀집업'],/풀집업|풀집|fullzip/.test(facts)],[['카라','칼라','폴로'],/카라|칼라|폴로/.test(facts)],
  [['라운드','라운드넥','크루넥'],/라운드|크루넥/.test(facts)],[['브이넥','v넥'],/브이넥|v넥/.test(facts)],[['터틀넥','목폴라'],/터틀넥|목폴라/.test(facts)],
  [['꽈배기','케이블'],/꽈배기|케이블/.test(facts)],[['골지','리브드'],/골지|리브드/.test(facts)],[['체크'],/체크/.test(facts)],[['스트라이프','단가라'],/스트라이프|단가라/.test(facts)],
  [['숏','쇼트'],/숏|쇼트/.test(facts)],[['롱'],/롱/.test(facts)],[['경량'],/경량/.test(facts)],[['단추','버튼'],/단추|버튼/.test(facts)],[['빅사이즈'],/빅사이즈/.test(facts)],
  [['면','코튼'],/코튼|면\d/.test(facts+material)],[['울','모직'],/울|모직/.test(facts)||/(?:^|,)모\d/.test(material)],[['캐시미어'],/캐시미어/.test(facts+material)],[['린넨','리넨'],/린넨|리넨/.test(facts+material)],
  [['스판','스트레치'],/스판|스트레치/.test(facts)||/폴리우레탄[1-9]/.test(material)],[['데님'],/데님|청바지/.test(facts)],[['플리스','후리스'],/플리스|후리스/.test(facts)],
  [['봄'],/봄(?!버)/.test(facts)],[['여름','썸머'],/여름|썸머/.test(facts)],[['가을'],/가을/.test(facts)],[['겨울'],/겨울/.test(facts)]
 ];
 for(const [names,allowed] of rules)add(names,allowed);
 tokens.sort((a,b)=>b.name.length-a.name.length);
 const result=[];
 for(const tag of index.tags){
  if(tag.decision!=='include'||tag.conflict||!/^\d+$/.test(tag.id)||!['garment','conditional_attribute'].includes(tag.kind))continue;
  let rest=normalize(tag.name),parts=[],valid=true;
  while(rest){const token=tokens.find(t=>rest.startsWith(t.name));if(!token||!token.allowed){valid=false;break;}parts.push(token);rest=rest.slice(token.name.length);}
  const garment=parts.some(t=>t.type==='garment');
  if(!valid||!parts.length||(tag.kind==='garment'&&!garment)||(tag.kind==='conditional_attribute'&&(garment||!parts.some(t=>t.type==='feature'))))continue;
  const features=parts.filter(t=>t.type==='feature').map(t=>t.name);
  result.push({id:tag.id,name:tag.name,recordId:tag.recordId,features,score:features.length*12+(normalize(tag.name).endsWith(normalize(kind[0]))?8:0)+parts.filter(t=>t.type==='gender').length*3});
 }
 return result.sort((a,b)=>b.score-a.score||a.name.length-b.name.length||Number(a.id)-Number(b.id)).slice(0,limit);
}

export function researchForProduct(product){
 const index=loadTagResearch();if(!index)return {configured:false,count:0,candidates:[],titleTerms:[]};
 const key=JSON.stringify([stamp,product.rawName,product.name,product.gender,product.material,product.noticeVerified,product.fieldStatus?.material,product.officialDescription]);
 if(matches.has(key))return matches.get(key);
 const candidates=matchResearchTags(product,index),result={configured:true,count:index.observedCount,sourceHash:index.sourceHash,candidates,titleTerms:candidates.filter(t=>t.features.length&&t.name.length<=16).slice(0,8).map(t=>t.name)};
 if(matches.size>=100)matches.clear();matches.set(key,result);return result;
}
