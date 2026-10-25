export function smartstoreWorkTarget(url){
 const match=/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/(copy|edit)\/(\d+)(?:\?[^#]*)?$/.exec(String(url));
 return match?{mode:match[1],id:match[2]}:null;
}
export const isSmartstoreInputUrl=url=>!!smartstoreWorkTarget(url);
export function assertSmartstoreEditProduct(url,title,style){
 const target=smartstoreWorkTarget(url);
 if(!target)throw Error('스마트스토어 복사등록 또는 조회/수정 화면에서 실행해 주세요.');
 if(target.mode!=='edit')return;
 const codes=[...new Set((String(title).match(/(?<!\d)\d{5,6}(?!\d)/g)||[]).map(code=>code.padStart(6,'0')))];
 if(!/^\d{6}$/.test(style||'')||codes.length!==1||codes[0]!==style)throw Error('조회/수정 화면의 상품명 품번이 현재 작업 품번과 다릅니다. 같은 상품을 연 뒤 시작해 주세요.');
}
