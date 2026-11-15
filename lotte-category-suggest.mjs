import {productClassification,assertAdultProduct} from './product.mjs';
import {resolveCatalogCategory} from './category-catalog.mjs';
import {isMensUnderwear} from './category.mjs';
import {bridgeLotteCategory} from './lotte-category-bridge.mjs';

export const LOTTE_CATEGORY_FIELDS=['commonMiddle','commonSmall','channelMiddle','channelSmall'];
export function suggestMissingLotteCategory(product){
 const before={...product.category};
 if(LOTTE_CATEGORY_FIELDS.every(key=>before[key]?.trim()))return {category:before,filled:[],missing:[],message:'입력된 상품분류를 유지합니다.'};
 try{assertAdultProduct(product);}catch(error){if(error.code!=='JUNIOR_PRODUCT')throw error;return {category:before,filled:[],missing:LOTTE_CATEGORY_FIELDS.filter(key=>!before[key]?.trim()),message:'성인 상품의 공식 경로를 확인해 주세요. 주니어 분류는 자동 추천하지 않습니다.'};}
 const escape=value=>String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const links=(product.sourceCategory||[]).map((name,index)=>'<a'+(index===0?' class="prdpath1"':'')+'>'+escape(name)+'</a>').join('');
 const suggested=productClassification('<div class="navi"><a>Home</a>'+links+'<a>'+escape(product.rawName||product.name)+'</a></div>');
 // Never infer a missing sex or reuse the other sex's tree.
 if(!['남성','여성'].includes(product.gender)||suggested.gender!==product.gender)return {category:before,filled:[],missing:LOTTE_CATEGORY_FIELDS.filter(key=>!before[key]?.trim()),message:'공식 상품 경로의 성별을 확인해 주세요.'};
 const resolved=resolveCatalogCategory({...product,category:suggested.category});
 // These two special paths were confirmed separately from the apparel catalog.
 const knownSpecial=isMensUnderwear(product)||(suggested.category.channelMajor==='브랜드가방'&&/벨트/.test(product.rawName||product.name||''));
 // A known first-category type (for example a coat under MEN / ALL) is
 // sufficient for an editable second path, even without a length in the title.
 const firstBridge=!resolved.path&&!knownSpecial?bridgeLotteCategory({...product,category:suggested.category}):null;
 if(!resolved.path&&!knownSpecial&&!firstBridge?.complete)return {category:before,filled:[],missing:LOTTE_CATEGORY_FIELDS.filter(key=>!before[key]?.trim()),message:'상품 형태에 맞는 실제 분류 경로가 확인되지 않았습니다. 남은 공란을 확인해 주세요.'};
 const proposed=firstBridge?.complete?firstBridge.category:resolved.category,label=value=>String(value||'').replace(/^\w+\s*[:：]\s*/,'').replace(/\s/g,'');
 // Fill a coherent path only; never change a partial manual selection or attach
 // a guessed child/code beneath a conflicting parent.
 const conflicts=['commonMajor','commonMiddle','commonSmall','channelMajor','channelMiddle','channelSmall','channelDetail'].some(key=>label(before[key])&&label(proposed[key])!==label(before[key]));
 if(conflicts)return {category:before,filled:[],missing:LOTTE_CATEGORY_FIELDS.filter(key=>!before[key]?.trim()),message:'입력된 분류와 상품 추천 경로가 달라 기존 값을 유지했습니다. 남은 공란을 확인해 주세요.'};
 const category={...before};
 for(const [key,value] of Object.entries(proposed))if(typeof value==='string'&&!String(category[key]||'').trim())category[key]=value;
 if(proposed.channelCodes)category.channelCodes={...proposed.channelCodes};
 const missing=LOTTE_CATEGORY_FIELDS.filter(key=>!category[key]?.trim());
 const filled=LOTTE_CATEGORY_FIELDS.filter(key=>!before[key]?.trim()&&category[key]?.trim());
 return {category,filled,missing,message:missing.length?'일부 분류는 자동 확인되지 않았습니다. 남은 공란을 확인해 주세요.':filled.length?'상품에 맞는 공통·채널 분류를 자동으로 채웠습니다. 실제 선택에 성공한 경로는 다음 상품에도 재사용합니다.':'입력된 상품분류를 유지합니다.'};
}
