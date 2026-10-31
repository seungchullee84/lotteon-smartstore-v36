import {load} from 'cheerio';
import {templateMainHeadline} from './smartstore-template-headline.mjs';

// Only template 2: preserve the existing source images and seller data.
export function templateTwoSxoBody(html,product,name,points=[]){
 const $=load(html,null,false);
 const title=templateMainHeadline(product,name,2);
 const heading=$('[data-template-main-title]');
 heading.text(title).attr('data-template-default-title',name);
 $('.ss2-kicker,.ss2-description,.ss2-product-line>span').remove();
 const labels=[...new Set(points.map(p=>String(p.shortTitle||p.title||'').trim()).filter(Boolean))].slice(0,3);
 if(labels.length){
  const chips=$('<ul class="ss2-intro-features" data-intro-features aria-label="상품 핵심 특징"></ul>');
  for(const label of labels)chips.append($('<li>').text(label));
  chips.insertAfter(heading);
 }
 $('.ss2-photo-signature').each((_,node)=>{
  const n=$(node);n.find('span').first().remove();
 });
 $('.ss2-points').insertAfter('[data-product-intro]');
 $('[data-brand-video-heading], [data-brand-video]').insertBefore('[data-store-banner]');
 $('.ss2-palette-grid').attr('style','--columns:4');
 $('.ss2-palette>.ss2-section-title').text('색상, 한눈에 비교해 보세요.');
 $('.ss2-detail-bridge').remove();
 const summary=product.smartstoreDetail?.sizeSummary;
 if(summary?.style===product.style&&summary.sourceUrl===product.sourceUrl&&summary.verified===true){
  const table=$('<table data-size-summary><caption>공식 실측 주요 치수 · 단위 cm</caption><thead><tr><th scope="col">사이즈</th></tr></thead><tbody></tbody></table>');
  for(const size of summary.sizes)table.find('thead tr').append($('<th scope="col">').text(size));
  for(const row of summary.rows){const tr=$('<tr>').append($('<th scope="row">').text(row.label));for(const value of row.values)tr.append($('<td>').text(String(value)));table.find('tbody').append(tr);}
  $('.ss2-material').append(table);
 }
 $('.ss2-material').append('<p data-size-comparison-note>평소 잘 맞는 옷과 아래 공식 실측표를 비교해 주세요.</p>');
 return $.html();
}

export const templateTwoSxoCss=`
.ss2{font-weight:500;-webkit-text-stroke:.24px}
.ss2-intro{padding:28px 24px 30px;text-align:center}
.ss2-intro h1{font-size:38px;line-height:1.6;letter-spacing:-.5px;margin:12px 0}
.ss2-intro-features{display:flex;justify-content:center;flex-wrap:wrap;gap:14px;list-style:none;padding:0;margin:18px 0 22px}
.ss2-intro-features li{max-width:100%;padding:7px 14px;border:1px solid var(--border);border-radius:999px;background:var(--paper);color:var(--accent);font-size:18px;font-weight:700;line-height:1.7}
.ss2-product-line{border:0;margin:8px 0 24px;padding:0}
.ss2-product-line [data-style-number]{font-size:14px}
.ss2-intro>img{width:100%;height:auto;border-radius:10px}
.ss2-photo-signature{justify-content:center;font-size:18px;margin-top:16px}
.ss2-points{margin:0;padding:36px 48px;background:var(--opening);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.ss2-point-grid{display:block;margin-top:14px}
.ss2-point-grid>div{border:0;border-bottom:1px solid var(--border);padding:22px 0}
.ss2-point-grid>div:last-child{border-bottom:0}
.ss2-point-grid h3{font-size:28px;font-weight:700;line-height:1.6;color:var(--accent)}
.ss2-point-grid p{font-size:24px;line-height:1.8;margin-top:8px}
.ss2-palette{margin:0;padding:48px;background:var(--alternate)}
.ss2-palette-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:24px 14px}
.ss2-palette-name{font-size:20px;line-height:1.7;padding-top:12px;border:0}
.ss2-photo-heading{text-align:center;margin:0;padding:32px 24px;font-size:26px}
.ss2-color{padding:36px 12px}
.ss2-color-photos,.ss2-color-photos[data-count-many]{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ss2-color-photos figure{min-width:0}
.ss2-color-photos figure:first-child,.ss2-color-photos figure:nth-child(3){grid-column:auto}
.ss2-color-photos figure:nth-child(2){margin:0}
.ss2-color-photos figure:only-child{grid-column:1/-1}
.ss2-material{margin:0;padding:36px 48px;text-align:center;border:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--alternate)}
.ss2-material p{font-size:22px}
.ss2-material [data-size-comparison-note]{font-size:18px;margin-top:16px}
.ss2 [data-size-summary]{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:22px;font-size:24px}
.ss2 [data-size-summary] caption{font-size:18px;text-align:left;color:var(--muted);padding-bottom:12px}
.ss2 [data-size-summary] th,.ss2 [data-size-summary] td{padding:14px 8px;border-bottom:1px solid var(--border);text-align:center;font-weight:500}
.ss2 [data-size-summary] thead{background:var(--soft)}
.ss2-official{padding:48px 0 0}
.ss2-official>.ss2-section-title{padding:0 48px}
.ss2-official figure{margin:0}
.ss2-video-title{border-top:1px solid var(--border)}
.ss2-video{padding:0 6% 36px}
@media(max-width:600px){
 .ss2-intro{padding:24px 12px}.ss2-intro h1{font-size:28px}
 .ss2-intro-features{margin:16px 0 20px}.ss2-intro-features li{font-size:14px;padding:5px 10px}
 .ss2-points,.ss2-palette{padding:28px 22px}
 .ss2-point-grid h3{font-size:22px}.ss2-point-grid p{font-size:18px}
 .ss2-palette-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:18px 8px}
 .ss2-palette-name{font-size:12px;overflow-wrap:anywhere}
 .ss2-color{padding:30px 6px}.ss2-color-photos{gap:6px}
 .ss2-material{padding:28px 22px}.ss2-material p{font-size:18px}
 .ss2 [data-size-summary]{font-size:18px}.ss2 [data-size-summary] caption{font-size:15px}
 .ss2-official>.ss2-section-title{padding:0 22px}
 .ss2-service-grid,.ss2-contact-grid{grid-template-columns:1fr}
}
`;
