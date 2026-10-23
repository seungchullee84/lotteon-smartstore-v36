// Shared by SmartStore preview and form input. Does not modify the Lotte product.
export function assertSmartstoreTitleLength(title){
 const length=[...title].length;
 if(length<27||length>39)throw Error('스마트스토어 상품명은 품번·공백 포함 27~39자여야 합니다. 현재 '+length+'자입니다.');
 return title;
}
export function smartstoreTitle(product){
  const style=String(product?.style||'').trim();
  if(!/^\d{6}$/.test(style))throw Error('먼저 상품 품번을 확인해 주세요.');
  const source=String(product.smartstoreName||'').trim()||String(product.name||'').trim();
  if(!source)throw Error('스마트스토어 상품명을 입력해 주세요.');
  const gender=['남성','여성'].includes(product.gender)?product.gender:'';
  const promotions=new Set(['NEW','무료배송','당일배송','초특가','최저가','강력추천','인기상품','베스트셀러','할인','세일','쿠폰']);
  const normalized=source.replace(/[\[\]【】]/g,' ')
    .replace(/지오다노|\bGIORDANO\b/gi,' ')
    // Use the approved plain term only in the SmartStore title pipeline.
    .replace(/푸퍼(?=\s|자켓|재킷|점퍼|베스트|조끼|$)/g,word=>product.smartstoreName?.trim()?word:'패딩')
    .replace(/^(\s*)(남성|여성|남자|여자)(?=니트|가디건|카디건|맨투맨|패딩|바지|셔츠|티셔츠|후드|자켓|재킷|코트|벨트)/,'$1$2 ');
  const words=[],seen=new Set();
  let namedGender='',genderLabel='';
  for(let word of normalized.split(/\s+/).filter(Boolean)){
    const sex=({남자:'남성',여자:'여성',남성:'남성',여성:'여성'})[word];
    if(sex){
      if((gender&&sex!==gender)||(namedGender&&sex!==namedGender))throw Error('스마트스토어 상품명과 선택한 성별이 다릅니다. 상품명을 확인해 주세요.');
      namedGender=sex;if(!genderLabel)genderLabel=word;continue;
    }
    if(word===style||word==='('+style+')'||promotions.has(word.toUpperCase()))continue;
    word=word.replace(/^V[ -]?(?:NECK|넥)$/i,'브이넥');
    // Collapse exact words and established aliases, keeping the first wording.
    const key=({스웨터:'니트',카디건:'가디건'})[word]||word.toLocaleLowerCase('en');
    if(!seen.has(key)){seen.add(key);words.push(word);}
  }
  if(!words.length)throw Error('브랜드·성별·품번 외에 실제 상품명을 입력해 주세요.');
  const title=['지오다노',genderLabel||gender,...words,style].filter(Boolean).join(' ');
  // Reject rather than truncate product facts/model identifiers.
  if([...title].length>100)throw Error('스마트스토어 상품명은 공백 포함 100자 이내로 줄여 주세요.');
  return title;
}
