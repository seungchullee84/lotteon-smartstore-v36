// Shared by the server and offline regression tests; no registration side effects.
import {repairCategoryFields,easyProductName,cleanMarketingText,validateStyle,SEARCH_KEYWORDS_MAX_LENGTH} from './product.mjs';

export function validateProduct(p){

  repairCategoryFields(p);
  p.country=String(p.country||'').replace(/[^가-힣A-Za-z\s]+/g,'').trim();
  p.name=easyProductName(p.name);
  p.keywords=cleanMarketingText(p.keywords).replace(/,{2,}/g,',').replace(/^,|,$/g,'');
  validateStyle(p.style);
  for(const key of ['name','gender','material','country','washing','manufactured','keywords'])if(!p[key]?.trim())throw Error('검토란을 입력해 주세요: '+key);
  if(!['여성','남성'].includes(p.gender))throw Error('성별을 확인해 주세요.');
  if(!p.name.startsWith(p.gender+' '))throw Error('선택한 성별과 상품명 앞의 남성/여성 표시가 다릅니다.');
  if(p.gender==='남성'&&Object.values(p.category||{}).some(v=>/여성/.test(v))||p.gender==='여성'&&Object.values(p.category||{}).some(v=>/남성/.test(v)))throw Error('성별과 상품분류가 다릅니다. 분류를 다시 확인해 주세요.');
  if(!Number.isInteger(+p.consumerPrice)||+p.consumerPrice<1000)throw Error('공식몰 소비자가를 확인해 주세요.');
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.manufactured))throw Error('제조연월은 YYYY-MM 형식입니다.');
  if(!p.colors?.length||!p.sizes?.length)throw Error('색상과 사이즈가 필요합니다.');
  if(p.colors.some(v=>!/^\d{2}\S+$/.test(v)))throw Error('색상은 번호+색상명이며 공백이 없어야 합니다.');
  for(const key of ['commonMiddle','commonSmall','channelMiddle','channelSmall'])if(!p.category?.[key]?.trim())throw Error('카테고리를 입력해 주세요: '+key);
  if(p.keywords.length>SEARCH_KEYWORDS_MAX_LENGTH)throw Error(`검색키워드는 쉼표·공백 포함 ${SEARCH_KEYWORDS_MAX_LENGTH}자 이내로 입력해 주세요.`);
  if(!p.keywords.startsWith('지오다노'))throw Error('검색키워드는 지오다노로 시작해야 합니다.');
}
