import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('./data/category-itemscout-verified.json',import.meta.url),'utf8'));
const normalize=value=>String(value||'').trim().replace(/\s+/g,' ');
const byKeyword=new Map();
for(const row of data.rows){
 const key=normalize(row.keyword);
 if(!byKeyword.has(key))byKeyword.set(key,[]);
 byKeyword.get(key).push(row);
}
// Naver research paths are independent of Lotte category codes.
export function itemscoutProductPath(product){
 if(!['남성','여성'].includes(product.gender))return null;
 const text=[product.name,product.rawName].filter(Boolean).join(' ').replace(/트리코트|버튼\s*다운/g,'');
 const rules=[
  [/원피스/,'원피스'],[/스커트|치마/,'스커트'],[/레깅스/,'레깅스'],
  [/조끼|베스트/,'아우터 > 베스트'],[/청바지|데님.*(?:팬츠|바지)/,'청바지'],
  [/(?:트레이닝|스웨트|스웻).*?(?:팬츠|바지)/,'트레이닝복'],
  [/바지|팬츠|슬랙스|쇼츠/,'바지'],[/가디건|카디건/,'니트 > 카디건'],
  [/니트|스웨터|풀오버/,'니트 > 풀오버'],
  [/트렌치/,'아우터 > 트렌치코트'],[/롱코트/,'아우터 > 롱코트'],[/코트/,'아우터 > 기타코트'],
  [/패딩|다운|푸퍼/,'아우터 > 패딩'],[/후드.*집업/,'아우터 > 후드집업'],
  [/레더|가죽/,'아우터 > 레더재킷'],[/자켓|재킷/,'아우터 > 재킷'],
  [/점퍼|바람막이|윈드브레이커/,'점퍼'],[/티셔츠|긴팔\s*티|반팔\s*티|맨투맨|스웨트셔츠|스웻셔츠|후드티/,'티셔츠'],
  [/셔츠|남방|블라우스/,product.gender==='여성'?'블라우스/셔츠':'셔츠/남방']
 ];
 const leaf=rules.find(([pattern])=>pattern.test(text))?.[1];
 return leaf?`패션의류 > ${product.gender}의류 > ${leaf}`:null;
}
export function auditItemscoutKeywords(product,keywords){
 const expectedPath=itemscoutProductPath(product);
 const entries=keywords.map(keyword=>{
  const rows=byKeyword.get(normalize(keyword))||[];
  const match=rows.find(row=>row.category_path===expectedPath&&Number(row.category_percent)===100);
  const status=!rows.length?'unverified':!expectedPath?'product-review':rows.length===1&&match?'verified':'excluded';
  return {keyword,status,rows};
 });
 return {expectedPath,sourceFile:data.sourceFile,entries,note:'제공 CSV에서 성별·카테고리 경로·비중 100%가 일치하는 키워드만 검증 완료입니다. 미조사 키워드는 미검증 후보로 유지합니다. 검색수 집계 기간·표본은 미확인입니다. 상품 분류 코드를 자동 변경하지 않습니다.'};
}
export function eligibleItemscoutKeywords(audit){
 return audit.entries.filter(entry=>entry.status==='verified'||entry.status==='unverified').map(entry=>entry.keyword);
}
