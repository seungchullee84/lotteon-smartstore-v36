// Reusable wording recipes. Each requires matching evidence in THIS product.
export const BENEFIT_RECIPE_VERSION='official-benefit-recipes-1';
export function sourceBenefitRecipes(source){
 const text=String(source||'').replace(/\s+/g,' '),points=[];
 const rules=[
  {id:'soft-wool-touch',pattern:/포근하고\s*부드러운\s*터치의\s*(?:\d+\s*GG\s*)?울\s*혼방\s*소재를\s*사용하여\s*편안한\s*착용감을\s*제공/i,title:'포근한 울혼방 터치',description:'포근하고 부드러운 울혼방 소재로 편안하게.',covered:/울혼방|울.*터치|포근|부드러/},
  {id:'regular-layering',pattern:/적당한\s*여유감의\s*레귤러\s*실루엣으로\s*몸에\s*자연스럽게\s*안착되어\s*편안한\s*착용감\s*제공/,title:'여유로운 레귤러핏',description:'적당한 여유감으로 자연스럽고 편안하게.',covered:/레귤러|여유|편안한.*착용감/},
  {id:'highneck-fullzip',pattern:/목을\s*감싸는\s*하이넥과\s*전면\s*풀집업\s*여밈으로\s*다채로운\s*스타일링\s*연출/,title:'다양하게 연출하는 풀집업',description:'목을 감싸는 하이넥과 풀집업으로 다양한 연출.',covered:/풀집업|하이넥.*연출|지퍼.*연출/},
  {id:'relaxed-clean',pattern:/릴렉스\s*핏과\s*목넥\s*디자인으로\s*편안하면서도\s*깔끔한\s*실루엣을\s*연출/,title:'편안하고 깔끔한 실루엣',description:'릴렉스 핏과 목넥으로 편안하고 깔끔하게.',covered:/릴렉스|깔끔한.*실루엣/},
  {id:'light-warm-filling',pattern:/가벼운\s*착용감과\s*풍성한\s*볼륨감\s*[,，]?\s*뛰어난\s*보온성을\s*제공/,title:'가볍고 따뜻한 착용감',description:'가벼운 착용감에 풍성한 볼륨과 보온성을 더했어요.',covered:/가벼|가볍|경량|보온/},
  {id:'wind-entry',pattern:/내부\s*인\s*플라켓과\s*소매\s*안쪽\s*이밴드로\s*찬바람\s*유입을\s*차단/,title:'찬바람 유입을 줄여 따뜻하게',description:'내부 플라켓과 소매 안쪽 밴드로 찬바람을 차단해요.',covered:/찬바람|바람.*차단/},

  {id:'soft-touch',pattern:/(?:부드러운\s*(?:촉감|터치감)|부드럽고\s*(?:실키한|쾌적한)\s*(?:촉감|터치감)|소프트한\s*(?:촉감|터치감|텍스처))[^.]{0,60}?(?:제공|선사|특징|느껴|우수합니다|우수하며|더했|살렸)/,title:'부드럽게 닿는 촉감',description:'부드러운 촉감이 느껴지는 원단.',covered:/부드|소프트|실키/},
  {id:'breathable',pattern:/통기성(?:이|을)?\s*(?:뛰어나|우수|좋|높)[^.]{0,45}?(?:착용감|쾌적|시원)|통기성이\s*뛰어나/,title:'통기성을 살린 쾌적함',description:'우수한 통기성으로 쾌적하게 입어요.',covered:/통기|쾌적|흡습|속건/},
  {id:'wash-shape',pattern:/세탁\s*후(?:에도)?[^.]{0,80}?(?:변형|수축)[^.]{0,25}?(?:최소화|최소|방지|줄였|거의\s*없)/,title:'세탁 후에도 깔끔하게',description:'세탁 후 변형 부담을 줄여 깔끔하게.',covered:/세탁|수축|변형|워싱으로.*안정/},
  {id:'flexible',pattern:/신축성(?:이|을|과)?\s*(?:뛰어나|우수|좋|더해|더한)[^.]{0,45}?(?:편안|활동성|착용감)|신축성이\s*뛰어나/,title:'움직일 때도 유연하게',description:'뛰어난 신축성으로 편안하게 움직여요.',covered:/신축|유연|움직임|활동성|사방.*스판/},
  {id:'easy-care',pattern:/구김(?:이)?[^.]{0,30}?(?:덜\s*가|적고)[^.]{0,30}?(?:관리(?:가)?\s*용이|관리하기\s*편)/,title:'구김 부담 줄인 관리',description:'구김이 덜 가고 관리하기 편안해요.',covered:/구김|관리/},
  {id:'versatile',pattern:/(?:다양한|어떠한)\s*(?:상의|하의|아이템)[^.]{0,35}?(?:매치(?:하기)?\s*(?:좋|가능)|매치\s*가능|코디(?:하기)?\s*좋|활용)/,title:'다양한 코디에 두루',description:'다양한 아이템과 매치하기 좋아요.',covered:/코디|매치|스타일링|활용/},
  {id:'relaxed-comfort',pattern:/(?:여유로운|넉넉한)\s*(?:핏|실루엣)[^.]{0,70}?(?:편안한\s*착용감|편안하게\s*착용|부담\s*없이\s*착용)/,title:'여유롭게 편안한 착용감',description:'여유 있는 실루엣으로 편안하게 입어요.',covered:/여유|넉넉|편안한.*착용감|체형.*커버/},
  {id:'thermal',pattern:/(?:보온성|보온력)(?:이|을|도)?\s*(?:우수|뛰어나|좋|높)[^.]{0,45}?(?:따뜻|착용)|우수한\s*보온성[^.]{0,35}?(?:제공|선사|유지|구현|완성)/,title:'쌀쌀할 때도 따뜻하게',description:'보온성을 더해 따뜻하게 입어요.',covered:/보온|따뜻|포근/},
  {id:'practical-pocket',pattern:/(?:포켓|주머니)[^.]{0,45}?(?:간편한\s*수납|수납이?\s*(?:가능|편리)|실용성|편리한\s*수납)/,title:'소지품을 간편하게',description:'편리한 포켓으로 간편하게 수납해요.',covered:/포켓|주머니|수납/},
  {id:'two-way-layering',pattern:/(?:풀\s*집업\s*및\s*)?투웨이\s*지퍼[^.]{0,95}?(?:레이어드\s*(?:연출이?\s*)?(?:가능|가능합니다)|레이어드\s*연출)/i,title:'지퍼 하나로 다양한 연출',description:'투웨이 지퍼로 다양한 레이어드 코디.',covered:/투웨이|하이넥.*카라|지퍼.*연출/},
  {id:'shape-retention',pattern:/(?:\d+게이지\s*\d+합\s*편직으로\s*)?흐물거림\s*없이\s*탄탄한?\s*실루엣[^.]{0,20}?(?:유지|연출)/,title:'흐물거림 없이 탄탄하게',description:'탄탄한 편직으로 안정적인 실루엣 연출.',covered:/탄탄|흐물거림/},
  {id:'nep-accent',pattern:/알록달록한\s*칩이\s*박힌\s*감각적인\s*넵사[^.]{0,45}?(?:포인트\s*부여|포인트를?\s*더)/,title:'은은하게 살아나는 포인트',description:'알록달록한 넵사로 감각적인 포인트.',covered:/넵사|알록달록/},
  {id:'stretch',pattern:/(?:혼방의\s*)?\d+골\s*코듀로이\s*원단을?\s*사용해\s*뛰어난\s*신축성\s*확보/,title:'움직임에 맞춰 유연하게',description:'신축성 있는 코듀로이로 편안한 움직임.',covered:/신축|유연|사방.*스판|움직임/},
  {id:'winter-warmth',pattern:/적당한\s*중량감으로\s*겨울철에도?\s*포근하고\s*활동성[^.]{0,35}?(?:착용감\s*선사|제공)/,title:'겨울에도 포근하게',description:'적당한 중량감으로 겨울에도 포근한 착용감.',covered:/따뜻|포근|보온/},
  {id:'wide-comfort',pattern:/체형을?\s*자연스럽게\s*커버(?:하면서|하며)[^.]{0,55}?(?:실루엣(?:을?\s*연출(?:합니다)?)?)/,title:'여유롭게, 체형 커버',description:'편안한 실루엣으로 자연스럽게 체형 커버.',covered:/와이드|체형.*커버/},
  {id:'washed-colour',pattern:/가먼트\s*워싱\s*공정을?\s*더해\s*코듀로이\s*특유의\s*깊이감?\s*있는\s*색감과\s*빈티지한\s*워싱감\s*구현/,title:'깊은 색감으로 멋스럽게',description:'자연스러운 워싱감으로 다양한 코디에 활용.',covered:/워싱.*색감|빈티지|깊은.*색감/},
  {id:'neck-shape',pattern:/스판사(?:를?\s*사용한)?\s*넥라인\s*바인딩[^.]{0,55}?(?:형태\s*변형\s*최소화|늘어남[^.]{0,15}최소화)/,title:'목선은 깔끔하고 탄탄하게',description:'넥라인 형태 변형을 줄여 깔끔한 실루엣.',covered:/넥라인.*형태|목선.*탄탄|형태.*변형/},
 ];
 for(const rule of rules){const match=text.match(rule.pattern);if(match)points.push({id:rule.id,title:rule.title,description:rule.description,evidence:match[0],covered:rule.covered});}
 return points;
}
