export const isSmartstoreDetailEditUrl=url=>/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/edit\/\d+(?:\?[^#]*)?$/.test(String(url));
export function assertDetailOnlyProduct(title,style){
 const found=[...new Set((String(title).match(/(?<!\d)\d{5,6}(?!\d)/g)||[]).map(v=>v.padStart(6,'0')))];
 if(!/^\d{6}$/.test(style||'')||found.length!==1||found[0]!==style)throw Error('조회/수정 화면의 상품명 품번이 현재 상세페이지 품번과 다릅니다. 같은 상품을 열어 주세요.');
}
export async function bindSmartstoreDetailEdit(context,style){
 const pages=context.pages().filter(p=>!p.isClosed()&&isSmartstoreDetailEditUrl(p.url()));
 if(pages.length!==1)throw Error(pages.length?'조회/수정 창이 여러 개입니다. 사용할 창 하나만 남겨 주세요.':'전용 크롬에서 상품조회 → 해당 상품 조회/수정 화면을 직접 열어 주세요.');
 const page=pages[0];page.setDefaultTimeout(8000);await page.bringToFront();
 const name=page.locator('input[name="product.name"]');await name.waitFor({state:'visible',timeout:10000});
 assertDetailOnlyProduct(await name.inputValue(),style);return page;
}
export async function runSmartstoreDetailOnly({product,folder,signal,connect,render,upload,log=()=>{}}){
 const check=()=>signal?.throwIfAborted();check();
 if(!product||!folder||!/^\d{6}$/.test(product.style||''))throw Error('먼저 현재 상품 정보를 수집하고 상세 미리보기를 확인해 주세요.');
 log('상세설명만 교체 · 조회/수정 화면 품번 확인');await connect(product);check();
 log('현재 미리보기 구성으로 상세이미지 제작');const detail=await render(product,folder);check();
 const result=await upload(product,folder,detail);check();
 if(result?.detailUploaded!==true)throw Error('상세설명 반영 확인이 끝나지 않았습니다.');
 log('상세설명만 반영 완료 · 상품명·가격·옵션·태그·대표/추가이미지 유지 · 상품 저장 안 함');
 return {...result,style:product.style,detailOnly:true,saved:false,published:false};
}
