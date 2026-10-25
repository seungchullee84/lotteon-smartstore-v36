export const STORE_BANNER_URL='https://shopping.naver.com/window/department/store/101731950';
export function storeBannerAsset(product){
 const gender=String(product.gender||'').trim();
 if(/^(여성|여자|WOMEN|FEMALE)$/i.test(gender))return 'store-discovery-women.jpg';
 if(/^(남성|남자|MEN|MALE)$/i.test(gender))return 'store-discovery-men.jpg';
 return 'store-discovery-unisex.jpg';
}
