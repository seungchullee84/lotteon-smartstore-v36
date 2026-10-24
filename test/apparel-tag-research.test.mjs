import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {matchResearchTags,importTagResearch} from '../apparel-tag-research.mjs';
import {expandedTitleCandidates,createExpandedTitleOptimizer} from '../naver-smart-title.mjs';

const tag=(name,id,decision='include',kind='garment')=>({name,id:String(id),decision,kind});
const index={tags:['기모슬랙스','테이퍼드슬랙스','밴딩슬랙스','남성슬랙스','여성슬랙스','와이드슬랙스','겨울슬랙스','울슬랙스','기모슬랙스코디','빅사이즈슬랙스','스판슬랙스','티셔츠','셔츠','데님팬츠'].map((name,i)=>tag(name,i+1)).concat(tag('테이퍼드핏',99,'include','conditional_attribute'),tag('슬랙스',100,'review'),tag('남자슬랙스',101,'exclude'))};
const p={style:'115915',name:'남성 테이퍼드 히든밴딩 기모 슬랙스 115915',rawName:'테이퍼드 히든밴딩 브러시드 슬랙스',gender:'남성',material:'폴리에스터64,레이온33,폴리우레탄3',noticeVerified:true};

test('품목·성별·핏·소재를 대조하고 미확인 계절·울·와이드·홍보 표현을 제외한다',()=>{
 const names=matchResearchTags(p,index).map(t=>t.name);
 for(const name of ['기모슬랙스','테이퍼드슬랙스','밴딩슬랙스','남성슬랙스','스판슬랙스','테이퍼드핏'])assert(names.includes(name),name);
 for(const name of ['여성슬랙스','겨울슬랙스','울슬랙스','와이드슬랙스','기모슬랙스코디','빅사이즈슬랙스','슬랙스','남자슬랙스'])assert(!names.includes(name),name);
 assert(!matchResearchTags({...p,name:'겨울 슬랙스',rawName:'겨울 슬랙스'},index).some(t=>t.name==='울슬랙스'));
 assert(!matchResearchTags({...p,rawName:'데님 자켓',name:'남성 데님 자켓'},index).some(t=>t.name==='데님팬츠'));
 assert(!matchResearchTags({...p,rawName:'반팔 티셔츠',name:'남성 반팔 티셔츠'},index).some(t=>t.name==='셔츠'));
 assert(!matchResearchTags({...p,noticeVerified:false},index).some(t=>t.name==='스판슬랙스'));
 assert(!matchResearchTags({...p,rawName:'기모 없는 슬랙스'},index).some(t=>t.name==='기모슬랙스'));
 assert(!matchResearchTags({...p,rawName:'니트릴장갑'}, {tags:[tag('니트',1)]}).length);
 assert.equal(matchResearchTags(p,index,{limit:2}).length,2);
});

test('조사자료는 원본 ID·명칭·근거를 검사해 로컬 인덱스로 가져온다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tag-research-'));
 try{
  const source=path.join(root,'source.json'),destination=path.join(root,'index.json');
  const data={schema_version:'smartstore-apparel-tag-research/2.0.0',observed_tags:[{id:'1445',observed_name:'슬랙스',tag_record_id:'r1',evidence_ids:['e1']}],inferred_classifications:[{id:'1445',observed_name:'슬랙스',tag_record_id:'r1',decision:'include',kind:'garment'}],evidence_rows:[{id:'1445',observed_name:'슬랙스',tag_record_id:'r1',evidence_id:'e1'}]};
  await writeFile(source,JSON.stringify(data));assert.equal((await importTagResearch(source,destination)).count,1);
  assert.equal(JSON.parse(await readFile(destination,'utf8')).tags[0].name,'슬랙스');
  data.inferred_classifications[0].observed_name='다른 이름';await writeFile(source,JSON.stringify(data));
  await assert.rejects(importTagResearch(source,destination),/원본 명칭/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('API 키가 없어도 조사 근거로 상품명을 정리하며 인기도를 만들지 않는다',async()=>{
 const before=structuredClone(p),research={count:4804,candidates:matchResearchTags(p,index),titleTerms:['기모슬랙스','테이퍼드슬랙스','밴딩슬랙스']};
 const optimize=createExpandedTitleOptimizer({researchProvider:()=>research,fetchImpl:()=>assert.fail('로컬 정리에 원격 호출 없음')});
 const result=await optimize(p,{});
 assert.equal(result.hasData,false);assert.equal(result.researchUsed,true);assert.equal(result.period,null);
 assert.match(result.title,/테이퍼드/);assert.match(result.title,/히든밴딩/);assert.match(result.title,/슬랙스/);assert(result.title.endsWith('115915'));assert([...result.title].length<=39);
 assert.doesNotMatch(result.title,/겨울|와이드|울/);assert.deepEqual(p,before);assert.deepEqual(result.referenceTerms,research.titleTerms);
 assert(expandedTitleCandidates(p).includes('슬랙스'));
});
