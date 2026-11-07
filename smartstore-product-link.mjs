const invalid=()=>Object.assign(new Error('상품 링크는 네이버의 상품 상세 주소만 사용할 수 있습니다.'),{code:'INVALID_SMARTSTORE_PRODUCT_LINK'});

// Product identity is fully contained in these paths. Drop all query parameters
// so campaign/tracking links are never carried into a product's own detail page.
export function normalizeSmartstoreProductLink(value){
 if(typeof value!=='string'||value.length>4096)throw invalid();
 const input=value.trim();
 if(!input||/[\u0000-\u0020\u007f\\]/.test(input))throw invalid();
 const parts=/^https:\/\/(shopping\.naver\.com|smartstore\.naver\.com)(\/[^?#]*)(?:\?[^#]*)?$/i.exec(input);
 if(!parts)throw invalid();
 let url;try{url=new URL(input);}catch{throw invalid();}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||url.pathname!==parts[2])throw invalid();
 const allowed=url.hostname==='shopping.naver.com'
  ? /^\/window-products\/department\/\d{1,20}$/.test(url.pathname)
  : url.hostname==='smartstore.naver.com'&&/^\/[a-z0-9][a-z0-9_-]{0,99}\/products\/\d{1,20}$/i.test(url.pathname);
 if(!allowed)throw invalid();
 return url.origin+url.pathname;
}
