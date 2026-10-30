import {buildDetailContent} from './detail-html.mjs';
import {colorCaption} from './smartstore-color-copy.mjs';
import {displaySellingPoints} from './smartstore-selling-points.mjs';
import {mannequinWearingNote,productSellingPoints} from './smartstore-template-one.mjs';
import {officialTemplateTitle} from './smartstore-template-title.mjs';
import {productVideoUrl,BRAND_VIDEO_HEADING_HEIGHT} from './smartstore-brand-video.mjs';
import {STORE_BANNER_URL} from './smartstore-store-banner.mjs';
import {templateTwoTheme,templateTwoHeadline} from './smartstore-template-two-theme.mjs';
import {templateTwoFooter} from './smartstore-template-two-footer.mjs';
import {templateTwoCss} from './smartstore-template-two-style.mjs';
export {mannequinWearingNote,productSellingPoints};
export const SMARTSTORE_DETAIL_TEMPLATE='dongtan-rose-color-issue-20261031';
export const TEMPLATE_ASSET_NAMES=['giordano-official.png','store.jpg','GowunDodum-Regular.ttf'];
export const TEMPLATE_ASSET_BASE='https://raw.githubusercontent.com/seungchullee84/lotteon-smartstore-v36/main/public/smartstore-template/';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safe(src){if(typeof src!=='string'||!(/^(https?:\/\/|\/image\/|\/smartstore-photo\/|\/smartstore-template\/|data:image\/(png|jpeg|webp);base64,|file:\/\/)/.test(src)))throw Error('상세페이지 이미지 주소를 확인해 주세요.');return esc(src);}
export function buildSmartstoreDetail(p,{assetBase=TEMPLATE_ASSET_BASE,imageUrl=src=>src,includeVideo=true,videoUrl,includeNavigation=false}={}){
 if(!p?.images)throw Error('먼저 상품 정보를 수집해 주세요.');
 const original=buildDetailContent(p.images,p.colors,p.colorImages,p.originalDetailUrl),draft=p.smartstoreDetail;
 if(draft&&String(draft.style)!==String(p.style))throw Error('다른 품번의 상세페이지 자료는 적용하지 않습니다.');
 const groups=(draft?.displayColors||p.colors||[]).map((color,index)=>({color,index,urls:[...new Set(draft?.colorImages?.[color]||p.colorImages?.[color]||[])]}));
 const points=draft?.omitSellingPoints?[]:displaySellingPoints(draft?.sellingPoints?.length?draft.sellingPoints.slice(0,4):productSellingPoints(p));
 const theme=templateTwoTheme(p),headline=templateTwoHeadline(p,points),name=officialTemplateTitle(p),sources=[];
 const photo=(src,alt)=>{const url=imageUrl(src);sources.push(src);return `<img src="${safe(url)}" alt="${esc(alt)}">`;};
 const common=(file,alt)=>photo(assetBase+file,alt);
 const vars=Object.entries(theme).filter(([,v])=>/^#[a-f0-9]{6}$/i.test(v)).map(([k,v])=>'--'+k+':'+v).join(';');
 const hero=draft?.heroImage?.startsWith('/smartstore-photo/')?draft.heroImage:groups.find(g=>draft?.colorSources?.[g.color]!=='official'&&g.urls[0]?.startsWith('/smartstore-photo/'))?.urls[0];
 let body=`<header class="ss2-header"><span class="ss2-store">롯데백화점 동탄점</span><div class="ss2-logo">${common('giordano-official.png','지오다노 공식 홈페이지 로고')}</div><span class="ss2-meta">${theme.key==='women'?'WOMEN':theme.key==='men'?'MEN':'GIORDANO'} / ${esc(p.style)}</span></header>`;
 body+=`<section data-product-intro data-intro-layout="benefit-and-mannequin" class="ss2-intro"><p class="ss2-kicker">${esc(name)}</p><h1 data-benefit-headline>${headline.map(line=>'<span style="display:block">'+esc(line)+'</span>').join('')}</h1>${points[0]?.description?'<p class="ss2-description">'+esc(points[0].description)+'</p>':''}<div class="ss2-product-line"><span>${esc(name)}</span><small data-style-number>STYLE NO. ${esc(p.style)}</small></div>${hero?photo(hero,'현재 상품 '+p.style+' 매장 마네킹 착용 모습'):''}<div class="ss2-photo-signature"><span>GIORDANO</span><span>${hero?'매장 마네킹 실제 착용사진':''}</span></div></section>`;
 body+=`<section data-brand-video-heading class="ss2-video-title" style="height:${BRAND_VIDEO_HEADING_HEIGHT}px"><p>GIORDANO FILM</p><h2>지오다노가 담은 일상의 순간</h2></section>`;
 if(includeVideo)body+=`<section data-brand-video="mp4" class="ss2-video"><video src="${safe(videoUrl||productVideoUrl(p))}" title="지오다노 브랜드 영상" controls autoplay muted loop playsinline preload="metadata"></video></section>`;
 if(groups.length){
  body+=`<section class="ss2-palette"><h2 class="ss2-section-title">지금, 눈에 들어오는 색은?</h2><div data-color-palette class="ss2-palette-grid" style="--columns:${Math.min(5,groups.length)}">`;
  for(const g of groups){const front=draft?.acceptAllFolderPhotos?draft.paletteImages?.[g.color]:g.urls[0],tag=includeNavigation&&g.urls.length?'a':'div';body+=`<${tag} class="ss2-palette-item"${tag==='a'?' href="#smartstore-color-'+g.index+'"':''}>${front?photo(front,g.color+' 정면'):'<div data-palette-photo-pending class="ss2-pending">사진 준비 중</div>'}<span class="ss2-palette-name">${esc(g.color)}</span></${tag}>`;}
  body+='</div><p class="ss2-source-note">촬영 조명과 화면 설정에 따라 실제 색상과 차이가 있을 수 있습니다.</p></section><div class="ss2-photo-heading" data-mannequin-intro>매장 마네킹 실제 착용사진</div>';
  const wearing=mannequinWearingNote(p);if(wearing&&hero)body+='<p data-mannequin-size class="ss2-source-note" style="padding:0 5%">'+esc(wearing)+'</p>';
  for(const g of groups){if(!g.urls.length)continue;const official=draft?.colorSources?.[g.color]==='official';body+=`<section id="smartstore-color-${g.index}" data-color-source="${official?'official':'store'}" class="ss2-color"><div class="ss2-color-head"><span class="ss2-color-number">${String(g.index+1).padStart(2,'0')}</span><h2>${esc(g.color)}</h2><span class="ss2-caption">${esc(colorCaption(g.color,{style:p.style}))}</span></div>${official?'<p class="ss2-source-note">지오다노 공식 상품 사진</p>':''}<div class="ss2-color-photos"${g.urls.length>3?' data-count-many':''}>${g.urls.map((url,i)=>'<figure>'+photo(url,g.color+' '+(official?'공식 상품 사진':i===0?'착용 모습':'디테일'))+(draft?.photoSources?.[url]==='official-model'?'<p data-official-model-note class="ss2-source-note">지오다노 공식 모델 착용사진</p>':'')+'</figure>').join('')}</div></section>`;}
 }
 if(draft?.acceptAllFolderPhotos&&draft.providedImages?.length)body+='<div data-folder-photos>'+draft.providedImages.map(src=>photo(src,'현재 상품 '+p.style+' 착용사진')).join('')+'</div>';
 if(points.length)body+=`<section class="ss2-points"><h2 data-product-point-heading class="ss2-section-title">이 옷을 고르는 이유</h2><div data-product-points data-point-count="${points.length}" class="ss2-point-grid">${points.map(point=>'<div><h3>'+esc(point.title)+'</h3><p>'+esc(point.description)+'</p></div>').join('')}</div></section>`;
 body+=`<section class="ss2-material"><h2>소재와 사이즈</h2><p>${esc(p.material||'소재는 공식 상품고시를 확인해 주세요.')}<br>사이즈 ${esc((p.sizes||[]).join(' · '))}</p></section>`;
 const embedded=new Set(p.images.detail?(draft?.embeddedOfficialSections||[]).map(k=>p.images[k]).filter(Boolean):[]);
 const officialSources=[...new Set([p.images.main,...original.sources,p.images.extra1,p.images.extra2].filter(Boolean))].filter(src=>src===p.images.detail||!embedded.has(src));
 body+='<section data-official-detail class="ss2-official"><h2 class="ss2-section-title">공식 사진과 상품 정보</h2>'+officialSources.map(src=>'<figure>'+photo(src,'현재 상품의 공식 상세 및 상품정보')+'</figure>').join('')+'</section>';
 body+=`<section data-store-banner><a class="ss2-banner" href="${STORE_BANNER_URL}" target="_blank" rel="noopener" aria-label="지오다노 다른 상품 보기 · 롯데백화점 동탄점 스토어로 이동"><div class="ss2-banner-copy"><span class="ss2-banner-badge">지오다노 상품 더 보기</span><span class="ss2-banner-label">GIORDANO · 롯데백화점 동탄점</span><h2>지오다노의<br><strong>다른 상품도</strong><br>살펴보세요.</h2><span class="ss2-banner-action">다른 상품 보러 가기 <b aria-hidden="true">↗</b></span><p>이 배너를 누르면 스토어로 이동합니다.</p></div>${p.images.main?'<div class="ss2-banner-model">'+photo(p.images.main,'현재 상품의 지오다노 공식 상품사진')+'</div>':''}</a></section>`;
 body+=templateTwoFooter(common);
 return {html:`<style>${templateTwoCss}</style><div data-smartstore-template="${SMARTSTORE_DETAIL_TEMPLATE}" data-template-theme="${theme.key}"${theme.needsGenderReview?' data-gender-review="required"':''} class="ss2" style="${vars}">${body}</div>`,sources:[...new Set(sources)],template:SMARTSTORE_DETAIL_TEMPLATE,points,brandIntro:null,theme:theme.key};
}
export function smartstoreDetailDocument(p,options={}){
 const result=buildSmartstoreDetail(p,options),font=options.fontUrl;
 return {...result,html:`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.style)} · 스마트스토어 상세페이지</title><style>${font?`@font-face{font-family:GowunDodum;src:url('${esc(font)}') format('truetype');font-weight:400;font-display:swap}`:''}html,body{margin:0;padding:0}html{scrollbar-width:none}body{background:#ece7e4}img{max-width:100%}</style></head><body>${result.html}</body></html>`};
}
