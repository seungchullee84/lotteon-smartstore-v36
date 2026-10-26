// Display copy is brief; full official sentences remain in evidence only.
export function compactSellingPoint(point){
 return !!point?.title&&!!point?.description&&point.title.length<=18&&point.description.length<=42&&point.title!==point.description&&!/[.…]$/.test(point.title)&&!/[.…]$/.test(point.description.replace(/\.$/,''));
}
export function officialSellingPoints(description){
 const text=String(description||'').replace(/\s+/g,' ');const points=[],covered=new Set(),labels=new Map();
 const sections=[...String(description||'').matchAll(/POINT\s*0?[1-9]\s*[（(]([^）)]+)[）)]/gi)].map(m=>m[1].trim());
 const finish=()=>points.filter(compactSellingPoint).sort((a,b)=>{const rank=p=>{const i=sections.indexOf(labels.get(p));return i<0?99:i;};return rank(a)-rank(b);}).slice(0,3);
 // Shared apparel features: use only an affirmative, explicit source sentence.
 const sentences=text.replace(/\\n/g,' ').split(/(?<=[.!?])\s+/);
 for(const [pattern,title,copy,label] of [
  [/자연스럽게[^.]*어깨선[^.]*레귤러\s*핏[^.]*편안하게\s*착용/,'자연스러운 레귤러핏','자연스러운 어깨선과 편안한 착용감.','핏'],
  [/컴팩트\s*(?:코튼|면)[^.]*싱글\s*저지[^.]*부드러[^.]*탄탄/,'부드럽고, 탄탄하게','컴팩트 코튼 싱글 저지의 탄탄한 착용감.','원단'],
  [/어니언[^.]*퀼팅|퀼팅[^.]*어니언/,'입체적인 어니언 퀼팅','어니언 패턴으로 살린 입체감.','퀼팅'],
  [/PTT[^.]*보온성[^.]*복원력/,'따뜻하고, 탄탄하게','보온성과 복원력이 뛰어난 PTT 충전재.','충전재'],
  [/20D[^.]*고밀도[^.]*나일론/,'촘촘한 고밀도 원단','20D 고밀도 나일론으로 완성한 겉감.','겉감'],
  [/히든\s*밴딩[^.]*?(?:편안|유연|착용감)/,'히든밴딩, 편안하게','허리 안쪽 밴딩으로 편안하게.','디테일'],
  [/(?:사방\s*스판|가로\s*\/\s*세로\s*양방향)/,'사방으로, 유연하게','가로·세로로 늘어나는 사방 스판.','신축성'],
  [/(?:브러쉬드|브러시드|기모)[^.]*?(?:보온|따뜻)/,'부드럽고, 따뜻하게','브러쉬드 가공으로 더한 보온성.','보온'],
  [/테이퍼드[^.]*?(?:실루엣|라인)|밑단으로[^.]*?좁아지는/,'깔끔한 테이퍼드핏','밑단으로 갈수록 슬림한 라인.','핏'],
  [/와이드\s*(?:핏|실루엣)/,'여유로운 와이드핏','넉넉하게 떨어지는 와이드 실루엣.','핏'],
  [/(?:가먼트\s*워(?:싱|시))[^.]*?(?:수축[^.]*?최소)/,'워싱으로, 안정감 있게','가먼트 워싱으로 수축을 최소화.','가공'],
  [/캥거루\s*(?:포켓|주머니)/,'가볍게 챙기는 실용성','편리하게 사용하는 캥거루 포켓.','디테일'],
  [/(?:메리노\s*울)[^.]*?(?:부드러|소프트)/,'부드러운 메리노울','메리노울의 부드러운 촉감.','원단'],
  [/(?:가벼운|가볍고)[^.]*경량|경량[^.]*가벼/,'가볍게, 부담 없이','가벼운 원단의 경량 디자인.','원단'],
 ]){
  const evidence=sentences.find(s=>pattern.test(s)&&!/(?:아닌|없습니다|없음)/.test(s));if(!evidence)continue;
  const description=/^부드럽고, 따뜻하게$/.test(title)&&/기모/.test(evidence)&&!/브러쉬드|브러시드/.test(evidence)?'기모 가공으로 더한 보온성.':copy;
  points.push({title,description,evidence});labels.set(points.at(-1),label);covered.add(label);
  if(points.length>=3&&!sections.length)return finish();
 }
 const fabric=text.match(/\d+g\/(?:㎡|m2)의[^.\n]*?(?:실키한|실키)[^.\n]*(?:특징|제공합니다)/);
 if(fabric&&/저지/.test(fabric[0])&&/부드럽|소프트/.test(fabric[0])){
  const weight=fabric[0].match(/\d+g\/(?:㎡|m2)/)[0].replace('m2','㎡');
  points.push({title:/가볍/.test(fabric[0])?'가볍고, 실키하게':'부드럽고, 실키하게',description:weight+' 저지 원단의 부드러운 터치.',evidence:fabric[0]});
  covered.add('원단');
  labels.set(points.at(-1),'원단');
 }
 const rib=text.match(/\d+g\/(?:㎡|m2)의[^.\n]*?립 원단[^.\n]*?톡톡한 두께감[^.\n]*/);
 if(!covered.has('원단')&&rib&&/소프트|부드러/.test(rib[0])){
  const weight=rib[0].match(/\d+g\/(?:㎡|m2)/)[0].replace('m2','㎡');
  points.push({title:'톡톡하고, 부드럽게',description:weight+' 립 원단의 소프트한 두께감.',evidence:rib[0]});covered.add('원단');labels.set(points.at(-1),'원단');
 }
 const slim=text.match(/몸에 자연스럽게 밀착되는 슬림한 실루엣으로[^.\n]*(?:활용하기 좋습니다|적합)/);
 if(slim&&/레이어드/.test(slim[0])){points.push({title:'슬림하게, 레이어드',description:'몸에 자연스럽게 밀착되는 슬림 실루엣.',evidence:slim[0]});covered.add('실루엣');covered.add('핏');labels.set(points.at(-1),sections.includes('실루엣')?'실루엣':'핏');}
 const neck=text.match(/적당한 폭의 터틀넥[^.\n]*?(?:착용감[^.\n]*?(?:더했으며|제공)|착용감)/);
 if(neck){points.push({title:'부담 적은 터틀넥',description:'적당한 폭으로 편안한 착용감.',evidence:neck[0]});covered.add('디테일');covered.add('네크라인');labels.set(points.at(-1),sections.includes('디테일')?'디테일':'네크라인');}
 if(points.length>=3&&!sections.length)return finish();
 // Keep the official POINT headings and wording for other clothing categories.
 const original=String(description||'').replace(/\\n/g,'\n');
 const blocks=[...original.matchAll(/POINT\s*0?[1-9]\s*(?:[（(]([^）)]+)[）)])?\s*([\s\S]*?)(?=POINT\s*0?[1-9]|\n\s*\*|$)/gi)];
 for(const block of blocks){
  if(covered.has(block[1]?.trim()))continue;
  const lines=block[2].split(/\n+/).map(s=>s.trim()).filter(Boolean);if(!lines.length)continue;
  const first=lines[0],sentence=(lines.slice(1).join(' ')||first).split(/(?<=[.!?])\s+/)[0];
  const point={title:first,description:sentence,evidence:block[2].trim()};
  if(!compactSellingPoint(point))continue;points.push(point);
  labels.set(points.at(-1),block[1]?.trim());
 }
 if(points.length)return finish();
 // Unknown prose needs source review; never display a copied paragraph as a card.
 return [];
}
export function usableSellingPoints(points,source){
 const compact=s=>String(s).replace(/\s+/g,'');
 return Array.isArray(points)&&points.length>0&&points.every(p=>compactSellingPoint(p)&&p.evidence&&!/^혼용 소재$|^\d+ COLORS$|^SIZE$|^PRODUCT$/.test(p.title)&&!/혼용 여부는.*확인해/.test(p.description)&&(source===undefined||compact(source).includes(compact(p.evidence.split(/\s+\/\s+https?:\/\//)[0]))));
}
