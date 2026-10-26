import manifest from './public/smartstore-template/brand-intro-variants.json' with {type:'json'};
export const BRAND_INTRO_ASSET_NAMES=Object.freeze(manifest.variants.map(v=>v.file));
const families=[['padding',/패딩|푸퍼|덕다운|구스|puffer|padded/i],['vest',/베스트|조끼|vest/i],['coat',/코트|coat/i],['fleece',/플리스|보아|fleece/i],['hood',/후드|hood/i],['cardigan',/가디건|cardigan/i],['knit',/니트|스웨터|스웨타|터틀넥|knit|sweater/i],['sweat',/맨투맨|스웨트|스웻|sweat/i],['tee',/티셔츠|긴팔티|반팔티|래글런|t-shirt/i],['shirt',/셔츠|블라우스|shirt/i],['denim',/데님|청바지|denim/i],['pants',/팬츠|바지|슬랙스|치노|pants/i],['outer',/자켓|재킷|아우터|집업|jacket/i]];
const hash=text=>{let value=2166136261;for(const c of text)value=Math.imul(value^c.charCodeAt(0),16777619)>>>0;return value;};
export function brandIntroSelection(product){
 const name=String(product.rawName||product.name||'');const gender=String(product.gender||'').trim();const family=/^(남성|남자|MEN|MALE)$/i.test(gender)?'men':/^(여성|여자|WOMEN|FEMALE)$/i.test(gender)?'women':null;
 const category=[...(Array.isArray(product.sourceCategory)?product.sourceCategory:[]),...Object.values(product.category||{}).filter(v=>typeof v==='string')].join(' ');
 const kind=families.find(([,pattern])=>pattern.test(name))||families.find(([,pattern])=>pattern.test(category));
 const scorePhoto=(id,weight)=>{const photo=manifest.photos.find(p=>p.id===id);const related=kind?.[1].test(photo.tags.join(' '))?weight:0;return related+photo.tags.reduce((sum,tag)=>sum+(name.includes(tag)?Math.round(weight/5):0),0);};
 const ranked=manifest.variants.map(v=>({...v,score:scorePhoto(v.men,family==='women'?25:100)+scorePhoto(v.women,family==='men'?25:100)}));
 const best=Math.max(...ranked.map(v=>v.score)),candidates=ranked.filter(v=>v.score===best);const selected=candidates[hash(String(product.style||'')+'|'+name+'|'+gender)%candidates.length];
 return {id:selected.id,file:selected.file,men:selected.men,women:selected.women,sourceCount:manifest.sourceCount,matchedKind:best>0?kind?.[0]||'official-name':null};
}
