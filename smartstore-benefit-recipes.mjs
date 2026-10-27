// Reusable wording recipes. Each requires matching evidence in THIS product.
export const BENEFIT_RECIPE_VERSION='official-benefit-recipes-1';
export function sourceBenefitRecipes(source){
 const text=String(source||'').replace(/\s+/g,' '),points=[];
 const rules=[
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
