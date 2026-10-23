import {smartstoreTitle} from './smartstore-title.mjs';
export const NAVER_TREND_URL='https://naverapihub.apigw.ntruss.com/search-trend/v1/search';
export function trendPeriod(now=new Date()){
  const korea=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end=new Date(korea+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-1);
  const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
  return {startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),timeUnit:'date'};
}
export function titleCandidates(product){
  const title=smartstoreTitle(product),name=title.replace(/^지오다노\s*/,'');
  const types=[[/원피스/,'원피스'],[/스커트|치마/,'스커트'],[/반바지|쇼츠/,'반바지'],[/바지|팬츠|슬랙스/,'바지'],[/벨트/,'벨트'],[/(?<!트리)코트/,'코트'],[/패딩|푸퍼|(?<!버튼)다운/,'패딩'],[/바람막이|윈드브레이커/,'바람막이'],[/자켓|재킷/,'자켓'],[/점퍼/,'점퍼'],[/가디건|카디건/,'가디건'],[/니트|스웨터|풀오버/,'니트'],[/후드/,'후드티'],[/맨투맨|스웨트셔츠|스웻셔츠/,'맨투맨'],[/티셔츠|긴팔\s*티|반팔\s*티/,'티셔츠'],[/블라우스/,'블라우스'],[/셔츠|남방/,'셔츠']];
  const kind=types.find(([pattern])=>pattern.test(name.replace(/버튼\s*다운/g,'')))?.[1];
  if(!kind)throw Error('상품 종류를 확인할 수 없습니다. 스마트스토어 상품명에 실제 의류 종류를 입력해 주세요.');
  const sex=product.gender==='남성'?['남성','남자']:product.gender==='여성'?['여성','여자']:[];
  const candidates=sex.map(word=>({keyword:word+kind,genderWord:word}));
  if(!sex.length)candidates.push({keyword:kind});
  const features=['브이넥','터틀넥','라운드','아가일','기모','경량','스트라이프','와이드','밴딩','체크','후드','집업','긴팔','반팔'];
  for(const word of features){
    if(name.includes(word)&&!kind.includes(word)&&candidates.length<5)candidates.push({keyword:word+kind,feature:word});
  }
  return {title,kind,candidates};
}
export function interpretTrend(payload,request,candidates){
  if(payload?.startDate!==request.startDate||payload?.endDate!==request.endDate||payload?.timeUnit!=='date'||!Array.isArray(payload.results))throw Error('네이버 응답 기간 또는 형식이 예상과 다릅니다.');
  return candidates.map(candidate=>{
    const group=payload.results.find(r=>r.title===candidate.keyword);
    if(!group||!Array.isArray(group.data))throw Error('네이버 응답에 요청한 키워드가 없습니다.');
    const seen=new Set();
    const points=group.data.map(point=>{
      if(typeof point.period!=='string'||point.period<request.startDate||point.period>request.endDate||seen.has(point.period)||typeof point.ratio!=='number'||!Number.isFinite(point.ratio)||point.ratio<0||point.ratio>100)throw Error('네이버 검색 상대지수 형식을 확인할 수 없습니다.');
      seen.add(point.period);return {date:point.period,ratio:point.ratio};
    });
    return {...candidate,points,mean:points.length?points.reduce((sum,p)=>sum+p.ratio,0)/points.length:null,pointCount:points.length};
  });
}
function comparableMean(entries){
  const dates=entries.reduce((common,e)=>common.filter(d=>e.points.some(p=>p.date===d)),entries[0]?.points.map(p=>p.date)||[]);
  if(!dates.length)return null;
  return entries.map(e=>({entry:e,mean:e.points.filter(p=>dates.includes(p.date)).reduce((sum,p)=>sum+p.ratio,0)/dates.length,days:dates.length}));
}
export function proposeTitle(product,analysis){
  let title=smartstoreTitle(product);
  const sexEntries=analysis.filter(e=>e.genderWord),compared=comparableMean(sexEntries);
  let comparedDays=0;
  if(compared?.length===2){
    comparedDays=compared[0].days;
    // Ties and missing dates do not justify replacing a user's wording.
    if(compared[0].mean!==compared[1].mean){
      const best=compared.reduce((a,b)=>a.mean>b.mean?a:b).entry.genderWord;
      title=title.replace(/^(지오다노) (남성|남자|여성|여자)(?= )/,'$1 '+best);
    }
  }
  const featureEntries=analysis.filter(e=>e.feature&&e.pointCount>0);
  const featureComparison=comparableMean(featureEntries);
  let featureComparedDays=0;
  if(featureComparison?.length>1){
    featureComparedDays=featureComparison[0].days;
    const words=title.split(' '),positions=[];
    for(let i=0;i<words.length;i++)if(featureEntries.some(e=>e.feature===words[i]))positions.push(i);
    const score=word=>featureComparison.find(e=>e.entry.feature===word)?.mean??-1;
    const ordered=positions.map(i=>words[i]).sort((a,b)=>score(b)-score(a));
    positions.forEach((position,i)=>{words[position]=ordered[i];});
    title=words.join(' ');
  }
  return {title,comparedDays,featureComparedDays};
}
export function createNaverTitleOptimizer({fetchImpl=fetch,clock=()=>new Date()}={}){
  const cache=new Map();
  return async(product,credentials)=>{
    const {title,candidates}=titleCandidates(product),period=trendPeriod(clock());
    const {clientId,clientSecret}=credentials||{};
    if(!clientId||!clientSecret)throw Error('네이버 API 연결 설정에서 NAVER API HUB의 Client ID와 Client Secret을 입력해 주세요.');
    const request={...period,keywordGroups:candidates.map(c=>({groupName:c.keyword,keywords:[c.keyword]}))};
    const key=JSON.stringify([clientId,clientSecret,request]);
    let saved=cache.get(key),fromCache=!!saved&&clock().getTime()-saved.time<3600000;
    if(!fromCache){
      let response;
      try{response=await fetchImpl(NAVER_TREND_URL,{method:'POST',headers:{'Content-Type':'application/json','X-NCP-APIGW-API-KEY-ID':clientId,'X-NCP-APIGW-API-KEY':clientSecret},body:JSON.stringify(request),signal:AbortSignal.timeout(15000),redirect:'error'});}
      catch{throw Error('네이버 API에 연결하지 못했습니다. 기존 상품명을 유지합니다.');}
      if(!response.ok){const messages={401:'NAVER API HUB의 인증 정보와 검색어 트렌드 사용 권한을 확인해 주세요.',403:'NAVER API HUB에서 검색어 트렌드 사용 권한을 확인해 주세요.',429:'네이버 API 호출 한도를 초과했습니다. 나중에 다시 시도해 주세요.'};throw Error(messages[response.status]||'네이버 API 조회 실패 (HTTP '+response.status+'). 기존 상품명을 유지합니다.');}
      let payload;try{payload=await response.json();}catch{throw Error('네이버 API 응답을 읽지 못했습니다. 기존 상품명을 유지합니다.');}
      const entries=interpretTrend(payload,request,candidates);
      saved={time:clock().getTime(),entries,queriedAt:clock().toISOString()};
      if(cache.size>=100)cache.delete(cache.keys().next().value);
      cache.set(key,saved);
    }
    const entries=saved.entries.map((e,i)=>({...e,...candidates[i]}));
    const proposal=proposeTitle(product,entries);
    return {...proposal,originalTitle:title,period,metric:'검색 상대지수',source:'네이버 데이터랩 통합검색어 트렌드 API',queriedAt:saved.queriedAt,fromCache,hasData:entries.some(e=>e.pointCount>0),candidates:entries.map(({points,...entry})=>entry),note:'같은 요청·기간의 상대지수입니다. 월간 검색횟수·판매량·전체 키워드 순위가 아닙니다. 자료가 없으면 수치를 추정하지 않습니다. 성별 표현과 기존 특성 단어의 순서만 제안하며 상품 특성은 추가하지 않습니다.'};
  };
}
