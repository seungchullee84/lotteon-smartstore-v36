export function normalizeCountry(value){
 const line=String(value||'').trim().split(/[\r\n]/)[0].replace(/[：:]/g,'').trim();
 const names=['대한민국','한국','중국','베트남','방글라데시','미얀마','인도네시아','캄보디아','인도','태국','필리핀','파키스탄','스리랑카','말레이시아','일본','이탈리아','포르투갈','튀르키예','터키','미국','프랑스','대만','네팔','라오스'];
 return names.find(name=>line===name||line===name+'산')||'';
}
