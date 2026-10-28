// Shared by the live view and regression tests. Each day's counts are products,
// not the number of scans or OCR completions.
globalThis.websiteDailySummary=function(website,now=new Date()){
 const dayKey=value=>{
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
 };
 const day=dayKey(now),allowed=['공식 상세페이지 추가','공식 상세이미지 변경'];
 const batches=(website?.batches||[]).filter(batch=>dayKey(batch.checkedAt)).slice().sort((a,b)=>Date.parse(a.checkedAt)-Date.parse(b.checkedAt)).map(batch=>({...batch,day:dayKey(batch.checkedAt),events:(batch.events||[]).flatMap(event=>{
  if(!['new','changed'].includes(event.type))return [];
  const changes=event.type==='new'?['새로 발견한 성인 상품']:(event.changes||[]).filter(change=>allowed.includes(change));
  return changes.length?[{...event,changes,checkedAt:batch.checkedAt,day:dayKey(batch.checkedAt)}]:[];
 })}));
 function uniqueEvents(selected){
  const found=new Map();
  for(const batch of selected)for(const event of batch.events){
   const key=event.day+'|'+event.type+'|'+(event.style||event.sourceUrl),previous=found.get(key);
   found.set(key,{...event,firstCheckedAt:previous?.firstCheckedAt||event.checkedAt,changes:[...new Set([...(previous?.changes||[]),...event.changes])]});
  }
  return [...found.values()];
 }
 const events=uniqueEvents(batches.filter(batch=>batch.day===day));
 return {day,events,newCount:events.filter(event=>event.type==='new').length,changedCount:events.filter(event=>event.type==='changed').length,hasTodayCheck:batches.some(batch=>batch.day===day),history:uniqueEvents(batches.filter(batch=>batch.day<day)).reverse().slice(0,30)};
};
