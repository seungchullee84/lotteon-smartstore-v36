// Extract short, complete source clauses locally; never invent a benefit from a noun.
export function officialProsePoints(source,existing=[]){
 const rules=[
  {kind:'원단',feature:/(?:원단|소재|조직|짜임|니트|저지|코튼|면|울|캐시미어|린넨|리넨|모달|레이온|나일론|폴리에스터|충전재)/,claim:/(?:부드|탄탄|촉감|보온|신축|통기|흡습|흡한|속건|가벼|경량|쾌적|유연|소프트|시원|따뜻|포근|입체|텍스처)/},
  {kind:'핏과 실루엣',feature:/(?:핏|실루엣|라인|기장|길이|어깨선|허리선)/,claim:/(?:여유|슬림|와이드|레귤러|오버|넉넉|좁아|넓어|떨어|덮|밀착|편안|조절|크롭|롱|숏|스트레이트|테이퍼드|플레어|A라인)/},
  {kind:'여밈 디테일',feature:/(?:단추|버튼|여밈|지퍼|스트링|비조|벨트|밴딩|밴드)/,claim:/(?:조절|탈부착|분리|오픈|투웨이|양방향|편안|적용|더했|더해|갖추|구성|디테일)/},
  {kind:'디자인 포인트',feature:/(?:포켓|주머니|슬릿|트임|턱|플리츠|셔링|자수|프린트|패턴|스티치|절개|배색|카라|칼라|넥|후드|소매|커프스|케이블|립)/,claim:/(?:디자인|디테일|적용|더했|더해|갖추|구성|연출|조절|활동|수납|포인트|짜임|탈부착|분리)/},
  {kind:'가공 포인트',feature:/(?:가공|워싱|워시|브러시|브러쉬|기모|코팅)/,claim:/(?:수축|최소|방지|촉감|부드|보온|따뜻|입체|자연|적용)/},
  {kind:'스타일링',feature:/(?:레이어드|스타일링|매치|코디)/,claim:/(?:활용|연출|어울|좋|편안|가능|쉽|자연)/},
 ];
 const norm=x=>String(x).replace(/[\s.!?]+/g,'');
 const used=new Set(),points=[];
 const sentences=String(source||'').replace(/\\n/g,'\n').split(/(?:[•●]|\n+|(?<=[.!?])\s+)/).map(s=>s.trim()).filter(Boolean);
 for(const sentence of sentences){
  if(/(?:없(?:는|습니다|음)|아닌|아닙니다|미확인|확인\s*필요|추정|검토가?\s*필요)/.test(sentence)||/^POINT\s*\d|^STYLE[.:]|^SIZE|^COLOR|^소재[ :]|^혼용률[ :]/i.test(sentence))continue;
  // A long sentence may contain multiple independent clauses, but never cut at a character limit.
  const clauses=sentence.split(/[,，]|(?:으며|으며서|으며도|으며,|하고|하며|되며|이며|으로서)\s+/).map(c=>c.trim()).filter(Boolean);
  for(const rule of rules){
   if(used.has(rule.kind)||!rule.feature.test(sentence)||!rule.claim.test(sentence))continue;
   const candidates=[sentence,...clauses];
   const clause=candidates.find(c=>c.length>=8&&c.length<=40&&rule.feature.test(c)&&rule.claim.test(c)&&!/(?:및|와|과|으로|하고|하며|위한|통해|보다|또는|또한|\d)$/.test(c));
   if(!clause)continue;
   let description=clause.replace(/[.!?]+$/,'');
   // Keep the source phrase intact rather than appending an inferred performance claim.
   description=description.trim()+'.';
   if(existing.some(p=>(norm(p.evidence).includes(norm(clause))||norm(clause).includes(norm(p.evidence)))||norm(p.description)===norm(description))||points.some(p=>norm(p.description)===norm(description)))continue;
   const point={title:rule.kind,description,evidence:sentence};
   if(compactSellingPoint(point)){points.push(point);used.add(rule.kind);}
   if(points.length+existing.length>=4)return points;
  }
 }
 return points;
}
// Display copy is brief; full official sentences remain in evidence only.
export function compactSellingPoint(point){
 return !!point?.title&&!!point?.description&&point.title.length<=18&&point.description.length<=42&&point.title!==point.description&&!/[.…]$/.test(point.title)&&!/[.…]$/.test(point.description.replace(/\.$/,''));
}
export function officialSellingPoints(description){
 const text=String(description||'').replace(/\s+/g,' ');const points=[],covered=new Set(),labels=new Map();
 const sections=[...String(description||'').matchAll(/POINT\s*0?[1-9]\s*[（(]([^）)]+)[）)]/gi)].map(m=>m[1].trim());
 const finish=()=>[...points,...officialProsePoints(description,points)].filter(compactSellingPoint).sort((a,b)=>{const rank=p=>{const i=sections.indexOf(labels.get(p));return i<0?99:i;};return rank(a)-rank(b);}).slice(0,4);
 // Shared apparel features: use only an affirmative, explicit source sentence.
 const sentences=text.replace(/\\n/g,' ').split(/\s*[•●]\s*|(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);
 for(const [pattern,title,copy,label] of [
  [/(?:부드러[^.]*페이크\s*스웨이드|페이크\s*스웨이드[^.]*부드러)/,'부드러운 스웨이드 결감','부드러운 결감의 페이크 스웨이드 외피.','원단'],
  [/마이크로\s*볼\s*타입[^.]*(?:충전재|패딩)[^.]*(?:보온|포근)/,'보온성을 담은 충전재','마이크로 볼타입 패딩 충전재의 보온성.','충전재'],
  [/(?:여유[^.]*릴렉스\s*핏|릴렉스\s*핏[^.]*여유)/,'여유로운 릴렉스핏','여유 있게 떨어지는 릴렉스 실루엣.','핏'],
  [/(?:목을?[^.]*감싸[^.]*스탠드\s*넥|스탠드\s*넥[^.]*목을?[^.]*감싸)/,'목을 감싸는 스탠드넥','목을 감싸주는 스탠드 넥 디자인.','네크라인'],
  [/YKK[^.]*지퍼/i,'YKK 지퍼 디테일','YKK 지퍼로 완성한 여밈 디테일.','여밈'],
  [/밑단[^.]*스트링[^.]*핏\s*조절/,'조절 가능한 밑단','밑단 스트링으로 핏 조절.','핏 조절'],
  [/울\s*\d+(?:\.\d+)?%[^.]*캐시미어\s*\d+(?:\.\d+)?%[^.]*혼방[^.]*부드러운\s*촉감[^.]*보온/,'부드럽고, 따뜻하게','울·캐시미어 혼방의 부드러운 촉감과 보온성.','원단'],
  [/밑단으로[^.]*넓어지는\s*A라인[^.]*여유로운\s*핏/,'여유롭게 흐르는 A라인','밑단으로 자연스럽게 넓어지는 실루엣.','핏'],
  [/히든\s*버튼\s*여밈[^.]*탈부착\s*가능한\s*(?:카라|칼라)\s*비조/,'깔끔하고, 실용적으로','히든 버튼과 탈부착 가능한 카라 비조.','디테일'],
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
  if(covered.has(label))continue;
  const evidence=sentences.find(s=>pattern.test(s)&&!/(?:아닌|없습니다|없음)/.test(s));if(!evidence)continue;
  const description=/^부드럽고, 따뜻하게$/.test(title)&&/기모/.test(evidence)&&!/브러쉬드|브러시드/.test(evidence)?'기모 가공으로 더한 보온성.':copy;
  points.push({title,description,evidence});labels.set(points.at(-1),label);covered.add(label);
  if(points.length>=4&&!sections.length)return finish();
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
 if(points.length>=4&&!sections.length)return finish();
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
 return officialProsePoints(description);
}
export function usableSellingPoints(points,source){
 const compact=s=>String(s).replace(/\s+/g,'');
 return Array.isArray(points)&&points.length>0&&points.every(p=>compactSellingPoint(p)&&p.evidence&&!/^혼용 소재$|^\d+ COLORS$|^SIZE$|^PRODUCT$/.test(p.title)&&!/혼용 여부는.*확인해/.test(p.description)&&(source===undefined||compact(source).includes(compact(p.evidence.split(/\s+\/\s+https?:\/\//)[0]))));
}
