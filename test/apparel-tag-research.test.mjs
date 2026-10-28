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

test('테리 후드 풀오버는 후드티로 분류하고 실제 니트 후드 풀오버와 구분한다',()=>{
 const i={tags:['기모후드티','여성후드티','여성티셔츠','여성니트','후드니트','면니트','여성스웨터'].map((name,n)=>tag(name,n+1))};
 const hoodie={rawName:'NEW 브러시드 테리 후드 풀오버',gender:'여성',officialDescription:'안쪽 기모 처리'};
 const names=matchResearchTags(hoodie,i).map(t=>t.name);assert(names.includes('여성후드티'));assert(names.includes('기모후드티'));assert(names.includes('여성티셔츠'));assert(!names.some(n=>/니트|스웨터/.test(n)));
 const knit=matchResearchTags({...hoodie,rawName:'울 니트 후드 풀오버'},i).map(t=>t.name);assert(knit.includes('여성니트'));assert(!knit.includes('여성후드티'));
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

test('조사자료는 상품명 후보를 보강하고 API 비교가 없으면 인기어 상품명을 확정하지 않는다',async()=>{
 const before=structuredClone(p),research={count:4804,candidates:matchResearchTags(p,index),titleTerms:['기모슬랙스','테이퍼드슬랙스','밴딩슬랙스']};
 const optimize=createExpandedTitleOptimizer({researchProvider:()=>research,fetchImpl:()=>assert.fail('로컬 정리에 원격 호출 없음')});
 await assert.rejects(optimize(p,{}),/Client ID.*Client Secret/);
 assert.deepEqual(p,before);
 assert(expandedTitleCandidates(p).includes('슬랙스'));
});

test('기모 후드 집업은 후드티·니트·남성·무지·여름 태그와 구분해 추천한다',()=>{
 const i={tags:['후드집업','기모후드집업','여성후드집업','여자후드집업','집업후드','후드티','기모후드티','니트집업','남성후드집업','여름후드집업','무지후드집업','여성아우터'].map((name,n)=>tag(name,n+1))};
 const hoodie={rawName:'NEW [박현지] 브러시드 테리 후드 집업',gender:'여성',officialDescription:'안쪽에 기모 처리로 보온성 높임'};const names=matchResearchTags(hoodie,i).map(t=>t.name);
 for(const name of ['후드집업','기모후드집업','여성후드집업','여자후드집업','집업후드','여성아우터'])assert(names.includes(name),name);
 for(const name of ['후드티','기모후드티','니트집업','남성후드집업','여름후드집업','무지후드집업'])assert(!names.includes(name),name);
 assert(!matchResearchTags({...hoodie,rawName:'기모 후드 풀오버'},i).some(t=>t.name==='후드집업'));
 assert(!matchResearchTags({...hoodie,rawName:'니트 집업 가디건'},i).some(t=>t.name==='후드집업'));
});

test('공식몰 데님·탱크탑·블레이저·카라티 표기를 인식하고 잡화에 의류 태그를 강제하지 않는다',()=>{
 const i={tags:['청바지','여성청바지','캐미솔','나시티','여성나시티','블레이저','여성블레이저','자켓','티셔츠','폴로티셔츠','브리프'].map((name,n)=>tag(name,n+1))};
 for(const [rawName,wanted] of [['NEW 브러시드 와이드 데님','청바지'],['부츠컷 데님 (롱버전 +5cm)','청바지'],['헨리넥 탱크탑','나시티'],['울 블레이저','블레이저'],['피케 폴로 반팔 카라티','폴로티셔츠'],['아웃밴드 브리프','브리프']])assert(matchResearchTags({rawName,gender:'여성'},i).some(t=>t.name===wanted),rawName);
 assert(!matchResearchTags({rawName:'데님 자켓',gender:'여성'},i).some(t=>t.name==='청바지'));
 assert.equal(matchResearchTags({rawName:'울캐시 머플러',gender:'여성'},i).length,0);
});
