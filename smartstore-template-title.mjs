// Template headings preserve the current official name; seller form titles are separate.
export function officialTemplateTitle(product){
 let title=String(product.rawName||product.name||'지오다노').trim();
 const style=String(product.style||'');
 if(/^\d{5,8}$/.test(style)){
  title=title.replace(new RegExp('(?:STYLE\\s*(?:NO\\.?)?\\s*[:.]?\\s*)?(?<!\\d)\\d{0,2}'+style+'(?!\\d)','gi'),'');
 }
 return title.replace(/\s+/g,' ').replace(/^[\s·|,;:—–-]+|[\s·|,;:—–-]+$/g,'').trim();
}
