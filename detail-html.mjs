export function buildDetailContent(images,colors=[],colorImages={},originalDetailUrl=null){
  if(originalDetailUrl&&!images.detail)throw Error('기존 상세 이미지가 있지만 불러오지 못했습니다. 대표컷·추가컷으로 대체하지 않고 중단합니다.');
  const keys=images.detail?['detail','size','check','info']:['main','extra1','extra2','size','check','info'];
  const escape=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const photo=src=>`<img src="${escape(src)}" style="display:block;width:100%;max-width:100%;height:auto;margin:0 auto" alt="">`;
  const groups=!images.detail?colors.map(color=>({color,urls:[...new Set(colorImages[color]||[])].slice(0,2)})).filter(g=>g.urls.length):[];
  let sources,body;
  if(groups.length){
    const notices=[...new Set(['size','check','info'].map(k=>images[k]).filter(Boolean))];
    sources=[...groups.flatMap(g=>g.urls),...notices];
    body=groups.map(g=>`<h2 style="margin:64px 0 24px;font-size:24px;font-weight:500;letter-spacing:1px;color:#222">${escape(g.color)}</h2>`+g.urls.map(photo).join('')).join('')+notices.map(photo).join('');
  }else{sources=[...new Set(keys.map(key=>images[key]).filter(Boolean))];body=sources.map(photo).join('');}
  const html='<div style="text-align:center;max-width:900px;margin:0 auto">'+body+'</div>';
  return {html,sources};
}
