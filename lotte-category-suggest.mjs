import {productClassification,repairCategoryFields} from './product.mjs';

export const LOTTE_CATEGORY_FIELDS=['commonMiddle','commonSmall','channelMiddle','channelSmall'];
export function suggestMissingLotteCategory(product){
 const before={...product.category};
 if(LOTTE_CATEGORY_FIELDS.every(key=>before[key]?.trim()))return {category:before,filled:[],missing:[],message:'입력된 상품분류를 유지합니다.'};
 const escape=value=>String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const links=(product.sourceCategory||[]).map((name,index)=>'<a'+(index===0?' class="prdpath1"':'')+'>'+escape(name)+'</a>').join('');
 const suggested=productClassification('<div class="navi"><a>Home</a>'+links+'<a>'+escape(product.rawName||product.name)+'</a></div>');
 // Never infer a missing sex or reuse the other sex's tree.
 if(!['남성','여성'].includes(product.gender)||suggested.gender!==product.gender)return {category:before,filled:[],missing:LOTTE_CATEGORY_FIELDS.filter(key=>!before[key]?.trim()),message:'공식 상품 경로의 성별을 확인해 주세요.'};
 const candidate={...product,category:{...before}};
 for(const [key,value] of Object.entries(suggested.category))if(!candidate.category[key]?.trim()&&typeof value==='string')candidate.category[key]=value;
 repairCategoryFields(candidate);
 const missing=LOTTE_CATEGORY_FIELDS.filter(key=>!candidate.category[key]?.trim());
 const filled=LOTTE_CATEGORY_FIELDS.filter(key=>!before[key]?.trim()&&candidate.category[key]?.trim());
 return {category:candidate.category,filled,missing,message:missing.length?'일부 분류는 자동 확인되지 않았습니다. 남은 공란을 확인해 주세요.':filled.length?'상품에 맞는 공통·채널 분류를 자동으로 채웠습니다. 실제 선택에 성공한 경로는 다음 상품에도 재사용합니다.':'입력된 상품분류를 유지합니다.'};
}
