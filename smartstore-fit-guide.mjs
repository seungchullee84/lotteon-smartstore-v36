import {resolveDetailTemplate} from './smartstore-template-picker.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const measurements=['허리둘레','엉덩이둘레','허벅지둘레','밑단둘레','앞밑위','안쪽 바지길이','총기장'];

// The prepared pack is local to this product and selected template. These
// comparison images must never become current-product color/photo selections.
export function fitGuideSection(product,photo){
 const guide=product.smartstoreDetail?.fitGuide;
 if(!guide||guide.style!==product.style||guide.detailTemplate!==resolveDetailTemplate(product.detailTemplate))return '';
 const products=guide.products,current=p=>p.style===product.style;
 const label=p=>`<span class="fit-guide-code">${esc(p.style)}</span><h3>${esc(p.fit)}</h3>`;
 const marker=p=>current(p)?'<span class="fit-guide-current">지금 보고 있는 상품</span>':'<span class="fit-guide-alternative">함께 비교하는 핏</span>';
 const cards=role=>products.map((p,index)=>`<article class="fit-guide-card fit-guide-tone-${index}" data-comparison-style="${esc(p.style)}"${current(p)?' data-current-product':''}><header>${marker(p)}${label(p)}</header><figure>${photo(p[role],`${p.style} ${p.color} ${role==='front'?'정면':'측면'} 매장 촬영사진`)}</figure>${role==='front'?'<p class="fit-guide-description">'+esc(p.description)+'</p>':''}</article>`).join('');
 return `<section class="fit-guide" data-fit-guide data-guide-style="${esc(product.style)}">
 <div class="fit-guide-comparison" data-fit-comparison>
  <p class="fit-guide-eyebrow">FIT COMPARISON</p>
  <h2>같은 기모 팬츠,<br>핏은 이렇게 달라요.</h2>
  <p class="fit-guide-lead">밑단 모양과 바지 폭을 나란히 살펴보세요.</p>
  <p class="fit-guide-photo-label">매장 마네킹 실제 착용사진 · 정면</p>
  <div class="fit-guide-grid">${cards('front')}</div>
  <p class="fit-guide-note">촬영 거리와 구도가 달라 사진 속 크기는 실측 비율과 다를 수 있어요.</p>
  <p class="fit-guide-photo-label fit-guide-side-label">옆모습도 함께 비교해요.</p>
  <div class="fit-guide-grid fit-guide-sides">${cards('side')}</div>
 </div>
 <div class="fit-guide-measurements" data-fit-measurements>
  <p class="fit-guide-eyebrow">SIZE COMPARISON</p><h2>같은 L도, 치수가 달라요.</h2>
  <p class="fit-guide-lead">평소 잘 맞는 바지의 치수와 비교해 보세요.</p>
  <p class="fit-guide-table-label">공식 L 사이즈 실측 · 단위 cm</p>
  <table><thead><tr><th scope="col">측정 항목</th>${products.map(p=>`<th scope="col"${current(p)?' class="fit-guide-current-column"':''}>${esc(p.fit)}<small>${esc(p.style)}</small></th>`).join('')}</tr></thead><tbody>${measurements.map((name,i)=>`<tr><th scope="row">${name}</th>${products.map(p=>`<td${current(p)?' class="fit-guide-current-column"':''}>${p.measurements[i].toFixed(1)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <p class="fit-guide-note">허리·엉덩이·허벅지·밑단은 단면이 아닌 둘레예요.<br>제품 실측값은 신체 치수와 다르며, 측정 방법에 따라 차이가 날 수 있어요.</p>
 </div>
 <div class="fit-guide-manager" data-manager-size-guide>
  <p class="fit-guide-eyebrow">${esc(guide.manager.storeName)}</p><h2>매니저 추천<br>사이즈 가이드</h2>
  <div class="fit-guide-manager-table"><div class="fit-guide-manager-heading"><span>평소 허리 사이즈 · 인치</span><span>추천 사이즈</span></div>${guide.manager.rows.map(row=>`<div class="fit-guide-manager-row"><strong>${esc(row.waist)}</strong><span aria-hidden="true">→</span><b>${esc(row.size)}</b></div>`).join('')}</div>
  <p class="fit-guide-note">원하는 착용감에 따라 상품별 실측표도 함께 확인해 주세요.</p>
 </div>
 </section>`;
}

export const fitGuideCss=`
.fit-guide{color:#28332d;background:#faf9f5;border-top:1px solid #dadfd6;-webkit-text-stroke:0}
.fit-guide-comparison,.fit-guide-measurements,.fit-guide-manager{padding:58px 34px}
.fit-guide .fit-guide-eyebrow{font-size:15px;font-weight:700;letter-spacing:2px;color:#5b6b5a;margin:0 0 14px}
.fit-guide h2{font-size:36px;line-height:1.5;font-weight:700;letter-spacing:-.5px;margin:0}
.fit-guide .fit-guide-lead{font-size:21px;line-height:1.8;margin:15px 0 28px}
.fit-guide .fit-guide-photo-label{font-size:20px;margin:28px 0 18px;font-weight:700}
.fit-guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch}
.fit-guide-card{--fit-ink:#52634e;--fit-tint:#e7ece3;min-width:0;background:#fff;border:1px solid #dce1d7;border-radius:12px;overflow:hidden}
.fit-guide-tone-1{--fit-ink:#50677b;--fit-tint:#e8eef3}.fit-guide-tone-2{--fit-ink:#826343;--fit-tint:#f2eadd}
.fit-guide-card[data-current-product]{border:2px solid #52634e;box-shadow:0 4px 14px #52634e12}
.fit-guide-card header{padding:16px 8px 18px;text-align:center;background:var(--fit-tint);color:var(--fit-ink)}
.fit-guide-current,.fit-guide-alternative{display:block;min-height:28px;margin-bottom:8px;font-size:14px;font-weight:700;letter-spacing:0}
.fit-guide-current{color:#fff;background:#52634e;border-radius:20px;padding:3px 7px;width:max-content;max-width:100%;margin-left:auto;margin-right:auto}
.fit-guide-code{display:block;font:500 20px/1.5 Arial,sans-serif;letter-spacing:2px}
.fit-guide-card h3{font-size:25px;line-height:1.6;margin:2px 0 0;font-weight:700}
.fit-guide-card figure{margin:0;background:#fff}.fit-guide-card img{display:block;width:100%;height:auto;aspect-ratio:3/4;object-fit:contain}
.fit-guide .fit-guide-description{padding:18px 16px;font-size:18px;line-height:1.9;margin:0}
.fit-guide .fit-guide-note{font-size:16px;line-height:1.85;color:#677166;margin:20px 0 0}
.fit-guide .fit-guide-side-label{margin-top:40px}.fit-guide-sides header{padding:12px 8px}.fit-guide-sides .fit-guide-current,.fit-guide-sides .fit-guide-alternative{display:none}
.fit-guide-measurements{border-top:1px solid #dadfd6;background:#eef1e9}.fit-guide .fit-guide-table-label{text-align:right;font-size:16px;margin:20px 0 12px}
.fit-guide table{width:100%;table-layout:fixed;border-collapse:collapse;background:#fff;font-size:20px;line-height:1.5;text-align:center}
.fit-guide th,.fit-guide td{padding:15px 7px;border-bottom:1px solid #e0e4dc}.fit-guide th{font-weight:500}.fit-guide thead th{background:#dfe6d9;color:#354530}.fit-guide thead small{display:block;font:14px/1.6 Arial,sans-serif;letter-spacing:1px;margin-top:4px}.fit-guide tbody th{font-size:18px}
.fit-guide .fit-guide-current-column{background:#f3f6ee;font-weight:700}.fit-guide thead .fit-guide-current-column{background:#52634e;color:#fff}
.fit-guide-manager{border-top:1px solid #dadfd6;text-align:center;background:#f8f5ee}.fit-guide-manager .fit-guide-eyebrow{letter-spacing:1px}
.fit-guide-manager-table{max-width:600px;margin:30px auto 0;border-top:2px solid #52634e;border-bottom:2px solid #52634e}
.fit-guide-manager-heading{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:15px 10px;background:#e7ece3;font-size:18px;color:#52634e}
.fit-guide-manager-row{display:grid;grid-template-columns:1fr 32px 1fr;align-items:center;padding:18px 12px;border-top:1px solid #dedfd7;font:500 30px/1.5 Arial,sans-serif}.fit-guide-manager-row>span{font-size:20px;color:#8a9386}.fit-guide-manager-row b{color:#52634e}
@media(max-width:600px){
 .fit-guide-comparison,.fit-guide-measurements,.fit-guide-manager{padding:34px 12px}.fit-guide h2{font-size:27px}.fit-guide .fit-guide-eyebrow{font-size:12px}.fit-guide .fit-guide-lead{font-size:16px;margin-bottom:20px}.fit-guide .fit-guide-photo-label{font-size:16px}
 .fit-guide-grid{gap:6px}.fit-guide-card{border-radius:8px}.fit-guide-card header{padding:10px 3px}.fit-guide-current,.fit-guide-alternative{font-size:10px;min-height:22px;letter-spacing:-.5px;margin-bottom:6px}.fit-guide-current{padding:2px 4px}.fit-guide-code{font-size:15px;letter-spacing:1px}.fit-guide-card h3{font-size:18px}.fit-guide .fit-guide-description{font-size:13px;line-height:1.8;padding:12px 8px}.fit-guide .fit-guide-note{font-size:12px}.fit-guide table{font-size:15px}.fit-guide th,.fit-guide td{padding:12px 3px}.fit-guide tbody th{font-size:13px}.fit-guide thead small{font-size:11px}.fit-guide .fit-guide-table-label{font-size:13px}.fit-guide-manager-heading{font-size:13px;gap:8px}.fit-guide-manager-row{font-size:25px;padding:14px 8px}
}
`;
