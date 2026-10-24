import {buildDetailContent} from './detail-html.mjs';

export const SMARTSTORE_DETAIL_TEMPLATE='dongtan-approved-20261024';
export const TEMPLATE_ASSET_NAMES=['brand-intro.jpg','benefits.jpg','shipping.jpg','returns.jpg','store.jpg','GowunDodum-Regular.ttf'];
export const TEMPLATE_ASSET_BASE='https://raw.githubusercontent.com/seungchullee84/lotteon-smartstore-v36/main/public/smartstore-template/';
export const OFFICIAL_BRAND_VIDEO='https://www.youtube.com/embed/nRI2390T5GQ?playsinline=1&rel=0&autoplay=1&mute=1&controls=1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const style='font-family:GowunDodum,\'Malgun Gothic\',sans-serif;color:#293f33;word-break:keep-all;overflow-wrap:anywhere;line-height:1.85;';
function safeImage(src){
 if(typeof src!=='string'||!(/^(https?:\/\/|\/image\/|\/smartstore-photo\/|\/smartstore-template\/|data:image\/(png|jpeg|webp);base64,|file:\/\/)/.test(src)))throw Error('상세페이지 이미지 주소를 확인해 주세요.');
 return esc(src);
}
export function productSellingPoints(p){
 const name=String(p.rawName||p.name||'');const material=String(p.material||'');const points=[];
 for(const [test,title,description] of [
  [/기모/,'기모','기모 소재로 준비한 상품'],[/모달/,'모달','상품명에서 확인한 모달 소재'],[/와이드/,'와이드핏','여유로운 와이드 실루엣'],[/슬림핏/,'슬림핏','슬림한 실루엣'],[/레귤러핏/,'레귤러핏','기본이 되는 레귤러 실루엣'],[/라운드넥/,'라운드넥','단정한 라운드 네크라인'],[/긴팔/,'긴팔','긴소매로 완성한 기본 아이템'],[/경량/,'경량','가벼운 착용을 위한 경량 상품']
 ])if(test.test(name))points.push({title,description});
 if(points.length<3&&/(?:면|코튼)\s*\d|\d\s*%?\s*(?:면|코튼)/.test(material))points.push({title:'코튼 혼용',description:material});
 if(points.length<3&&/폴리우레탄|스판덱스/.test(material))points.push({title:'혼용 소재',description:'폴리우레탄·스판덱스 혼용 여부는 아래 소재 정보를 확인해 주세요.'});
 if(points.length<3&&p.colors?.length)points.push({title:p.colors.length+' COLORS',description:p.colors.join(' · ')});
 if(points.length<3&&p.sizes?.length)points.push({title:'SIZE',description:p.sizes.join(' · ')});
 if(!points.length)points.push({title:'PRODUCT',description:'공식 상품 상세정보를 확인해 주세요.'});
 return points.slice(0,3);
}

export function buildSmartstoreDetail(p,{assetBase=TEMPLATE_ASSET_BASE,imageUrl=src=>src,includeVideo=true,includeNavigation=true}={}){
 if(!p?.images)throw Error('먼저 상품 정보를 수집해 주세요.');
 const original=buildDetailContent(p.images,p.colors,p.colorImages,p.originalDetailUrl);
 const draft=p.smartstoreDetail;
 if(draft&&String(draft.style)!==String(p.style))throw Error('다른 품번의 상세페이지 자료는 적용하지 않습니다.');
 const groups=(p.colors||[]).map((color,index)=>({color,index,urls:[...new Set(draft?.colorImages?.[color]||p.colorImages?.[color]||[])].slice(0,3)})).filter(g=>g.urls.length);
 const points=draft?.sellingPoints?.length?draft.sellingPoints.slice(0,3):productSellingPoints(p);
 const sources=[];
 const photo=(src,alt='',extra='')=>{const url=imageUrl(src);sources.push(src);return `<img src="${safeImage(url)}" alt="${esc(alt)}" style="display:block;width:100%;height:auto;border:0;margin:0;${extra}">`;};
 const common=(name,alt)=>photo(assetBase+name,alt);
 const header=(kicker,title)=>`<p style="font:14px/1.7 Arial,sans-serif;letter-spacing:2px;margin:0;color:#53694d;">${esc(kicker)}</p><h2 style="font-size:38px;line-height:1.5;margin:12px 0 22px;font-weight:700;">${title}</h2>`;
 const name=p.name||p.rawName||'지오다노';
 let body=common('brand-intro.jpg','지오다노 공식 로고와 남녀 모델 브랜드 소개');
 if(includeVideo)body+=`<section style="padding:28px;background:#f4f3ec;"><h2 style="text-align:center;font-size:22px;margin:0 0 18px;">GIORDANO 2026 F/W FILM</h2><iframe width="860" height="484" style="width:100%;aspect-ratio:16/9;height:auto;border:0;" src="${esc(OFFICIAL_BRAND_VIDEO)}" title="지오다노 공식 남녀 모델 영상" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></section>`;
 body+=`<section style="padding:60px 6%;background:#f1f1e9;"><p style="margin:0 0 30px;text-align:center;font-size:21px;">롯데백화점 동탄점</p><h1 style="font-size:46px;line-height:1.5;margin:0 0 24px;font-weight:700;">${esc(draft?.headline||name)}</h1><p style="font-size:23px;margin:0;">STYLE ${esc(p.style)} · ${esc(p.colors?.length||0)} COLORS</p><p style="font-size:21px;margin:12px 0 0;">${esc((p.sizes||[]).join(' · '))}</p></section>`;
 body+=`<section style="padding:48px 6%;">${header('PRODUCT POINT','고를 때 확인할 포인트.')}<div style="display:flex;gap:20px;align-items:start;">${points.map((point,i)=>`<div style="flex:1;min-width:0;border-top:0.5px solid #cbd1c3;padding-top:18px;"><span style="font-size:17px;color:#6b785f;">${String(i+1).padStart(2,'0')}</span><h3 style="font-size:25px;line-height:1.6;margin:10px 0;">${esc(point.title)}</h3><p style="font-size:20px;margin:0;">${esc(point.description)}</p></div>`).join('')}</div></section>`;
 if(groups.length){
  body+=`<section style="padding:28px 6% 44px;">${header('COLOR PALETTE','취향에 맞춰, '+esc(groups.length)+'가지.')}${includeNavigation?'<p style="padding:12px 16px;background:#fff1e7;color:#a43c23;border-left:3px solid #c35b36;font-size:19px;font-weight:700;">색상 사진을 클릭하면 해당 색상으로 이동합니다.</p>':''}<div style="display:flex;gap:12px;align-items:start;">${groups.map(g=>`<a href="#smartstore-color-${g.index}" style="flex:1;min-width:0;text-decoration:none;color:inherit;">${photo(g.urls[0],g.color,'aspect-ratio:3/4;object-fit:cover;')}<b style="display:block;font-size:21px;margin-top:14px;">${esc(g.color)}</b></a>`).join('')}</div><p style="font-size:19px;margin:24px 0 0;">촬영 조명과 화면 설정에 따라 실제 색상과 차이가 있을 수 있습니다. 공식 상품 이미지도 함께 확인해 주세요.</p></section>`;
  for(const group of groups)body+=`<section id="smartstore-color-${group.index}" style="padding:40px 4%;background:${group.index%2?'#f6f3ef':'#fff'};">${header('COLOR '+String(group.index+1).padStart(2,'0'),esc(group.color))}<div style="display:flex;gap:8px;align-items:start;"><div style="flex:1.15;min-width:0;">${photo(group.urls[0],group.color+' 착용 모습')}</div>${group.urls.length>1?`<div style="flex:1;min-width:0;">${group.urls.slice(1).map(url=>photo(url,group.color+' 디테일','margin-bottom:8px;')).join('')}<p style="font-size:19px;margin:16px 0 0;">DETAIL<br>정면과 다른 각도의 착용 모습을 함께 담았습니다.</p></div>`:''}</div></section>`;
 }
 body+=`<section style="padding:40px 6%;background:#f6f3ef;">${header('MATERIAL & SIZE','상품 정보를 확인해 주세요.')}<p style="font-size:23px;margin:0;">${esc(p.material||'소재는 아래 공식 상품고시를 확인해 주세요.')}</p><p style="font-size:21px;margin:12px 0 0;">사이즈 ${esc((p.sizes||[]).join(' · '))}</p></section>`;
 body+=`<section><div style="padding:48px 6%;">${header('PRODUCT DETAIL','디테일까지,<br>차근차근 살펴보세요.')}<p style="font-size:23px;margin:0;">공식 상품 이미지와 상세 정보를 원본 그대로 안내합니다.</p></div>`;
 // Preserve the complete original, including size/INFORMATION. Never crop or substitute it.
 const officialSources=p.images.detail||!groups.length?original.sources:[...new Set(['size','check','info'].map(key=>p.images[key]).filter(Boolean))];
 for(const src of officialSources)body+=photo(src,'해당 상품의 공식 상세 및 상품정보');
 body+='</section>'+common('benefits.jpg','동탄롯데 지오다노 구매 혜택 · 5만명 이상 스토어 관심등록고객')+common('shipping.jpg','정품 상품 출고 안내')+common('returns.jpg','교환 및 반품 안내');
 body+=`<section style="padding:48px 6%;background:#e7ede4;">${header('GIORDANO · DONGTAN','지오다노<br>롯데백화점 동탄점')}<p style="font-size:24px;margin:0 0 28px;">경기도 화성시 동탄역로 160<br>지하 1층 지오다노</p>${common('store.jpg','매장 안내')}</section>`;
 return {html:`<div data-smartstore-template="${SMARTSTORE_DETAIL_TEMPLATE}" style="${style}max-width:848px;margin:0 auto;background:#fff;text-align:left;">${body}</div>`,sources:[...new Set(sources)],template:SMARTSTORE_DETAIL_TEMPLATE,points};
}

export function smartstoreDetailDocument(p,options={}){
 const result=buildSmartstoreDetail(p,options);
 const font=options.fontUrl;
 return {...result,html:`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.style)} · 스마트스토어 상세페이지</title><style>${font?`@font-face{font-family:GowunDodum;src:url('${esc(font)}') format('truetype');font-weight:400;font-display:swap}`:''}*{box-sizing:border-box}body{margin:0;background:#ecebe7}body>div{max-width:860px!important}img{max-width:100%}h1,h2,h3,b,strong{font-weight:700}p{font-weight:500;-webkit-text-stroke:.24px currentColor}@media(max-width:600px){h1{font-size:30px!important}h2{font-size:27px!important}h3{font-size:19px!important}p{font-size:16px!important}b{font-size:15px!important}}</style></head><body>${result.html}</body></html>`};
}
