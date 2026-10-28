export function unclassifiedMannequinSection(draft,photo){
 const urls=[...new Set(draft?.providedImages||[])].filter(src=>/^\/smartstore-photo\/[a-f0-9]{24}$/.test(src));
 if(!urls.length)return '';
 return '<section data-mannequin-unclassified style="padding:56px 0;"><h2 style="font-size:30px;text-align:center;margin:0 0 32px;">매장 마네킨 사진</h2><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;align-items:start;">'+urls.map(src=>'<div>'+photo(src,'현재 상품의 매장 마네킨 사진','border-radius:14px;')+'</div>').join('')+'</div></section>';
}
