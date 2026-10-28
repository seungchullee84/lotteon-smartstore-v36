// Template headings preserve the current official name; seller form titles are separate.
export function officialTemplateTitle(product){
 let title=String(product.rawName||product.name||'지오다노').trim();
 // Remove confirmed campaign model names, not product/material annotations.
 title=title.replace(/[\[（(][^\]）)]*(?:변우석|문가영|박현지)[^\]）)]*[\]）)]/g,'')
  .replace(/(?:변우석|문가영|박현지)(?:\s*(?:착용|PICK|추천))?/gi,'');
 const style=String(product.style||'');
 if(/^\d{5,8}$/.test(style)){
  title=title.replace(new RegExp('(?:STYLE\\s*(?:NO\\.?)?\\s*[:.]?\\s*)?(?<!\\d)\\d{0,2}'+style+'(?!\\d)','gi'),'');
 }
 return title.replace(/\bNEW\b/gi,'').replace(/\s+/g,' ').replace(/^[\s·|,;:—–-]+|[\s·|,;:—–-]+$/g,'').trim();
}

export function officialTemplateTitleLayout(product){
 const title=officialTemplateTitle(product);
 const lead=title.match(/^((?:[A-Z][A-Z0-9&/.-]*\s+)+)(?=[가-힣])/);
 const label=lead?.[1].trim()||'',body=lead?title.slice(lead[0].length):title;
 const words=body.split(' ');let lines=[body];
 if(body.length>10&&words.length>=3){
  let cut=1,diff=Infinity;
  for(let i=1;i<words.length;i++){
   const delta=Math.abs(words.slice(0,i).join(' ').length-words.slice(i).join(' ').length);
   if(delta<diff){diff=delta;cut=i;}
  }
  lines=[words.slice(0,cut).join(' '),words.slice(cut).join(' ')];
 }
 return {title,label,lines};
}

