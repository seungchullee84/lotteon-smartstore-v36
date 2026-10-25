export const STORE_BANNER_URL='https://shopping.naver.com/window/department/store/101731950';
export const STORE_BANNER_ASSETS=Object.freeze(Object.fromEntries(['men','women'].map(g=>[g,Object.freeze([1,2,3,4].map(n=>'store-discovery-'+g+(n===1?'':'-'+n)+'.jpg'))])));
export const STORE_BANNER_ASSET_NAMES=Object.freeze([...STORE_BANNER_ASSETS.men,...STORE_BANNER_ASSETS.women,'store-discovery-unisex.jpg']);
export function storeBannerAsset(product){
 const gender=String(product.gender||'').trim();
 const family=/^(여성|여자|WOMEN|FEMALE)$/i.test(gender)?'women':/^(남성|남자|MEN|MALE)$/i.test(gender)?'men':null;
 if(!family)return 'store-discovery-unisex.jpg';
 const style=String(product.style||'');let hash=0;
 if(/^\d{6}$/.test(style))for(const char of style)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
 return STORE_BANNER_ASSETS[family][hash%4];
}
