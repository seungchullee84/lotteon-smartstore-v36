export const STORE_BANNER_URL='https://shopping.naver.com/window/department/store/101731950';
export const STORE_BANNER_ASSETS=Object.freeze(Object.fromEntries(['men','women'].map(g=>[g,Object.freeze([1,2,3,4].map(n=>'store-discovery-'+g+(n===1?'':'-'+n)+'.jpg'))])));
export const STORE_BANNER_ASSET_NAMES=Object.freeze([...STORE_BANNER_ASSETS.men,...STORE_BANNER_ASSETS.women,'store-discovery-unisex.jpg']);
function garmentKind(text){
 for(const [kind,pattern]of [
  ['outer',/패딩|점퍼|자켓|재킷|코트|아우터|다운재킷|다운점퍼/],
  ['cardigan',/가디건/],['knit',/니트|스웨터|스웨타/],['hood',/후드/],
  ['sweat',/맨투맨|스웨트셔츠|스웻셔츠/],['tee',/티셔츠|티샤쓰/],
  ['shirt',/셔츠|블라우스/],['jeans',/청바지|데님\s*(팬츠|바지)/],['pants',/팬츠|바지|슬랙스/]
 ])if(pattern.test(text))return kind;
 return null;
}
export function storeBannerAsset(product){
 const gender=String(product.gender||'').trim();
 const family=/^(여성|여자|WOMEN|FEMALE)$/i.test(gender)?'women':/^(남성|남자|MEN|MALE)$/i.test(gender)?'men':null;
 if(!family)return 'store-discovery-unisex.jpg';
 // Use the official product name before edited titles or broad category labels.
 const officialName=String(product.rawName||product.name||'');
 const categories=[...(Array.isArray(product.sourceCategory)?product.sourceCategory:[]),...Object.values(product.category||{}).filter(v=>typeof v==='string')].join(' ');
 const kind=garmentKind(officialName)||garmentKind(categories);
 // Indices describe the visible official outfits, not an inferred mood/season.
 const related={men:{hood:0,sweat:2,knit:1,cardigan:1,outer:3,shirt:3,jeans:1,pants:3},women:{cardigan:0,outer:1,shirt:1,knit:2,tee:3,pants:2}};
 const index=related[family][kind];
 if(index!==undefined)return STORE_BANNER_ASSETS[family][index];
 const style=String(product.style||'');let hash=0;
 if(/^\d{6}$/.test(style))for(const char of style)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
 return STORE_BANNER_ASSETS[family][hash%4];
}
