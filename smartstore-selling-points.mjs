// Product copy is derived from explicit official sentences, never from an SKU or season guess.
export function officialSellingPoints(description){
 const text=String(description||'').replace(/\s+/g,' ');const points=[];
 const fabric=text.match(/\d+g\/(?:㎡|m2)의[^.\n]*?(?:실키한|실키)[^.\n]*(?:특징|제공합니다)/);
 if(fabric&&/저지/.test(fabric[0])&&/부드럽|소프트/.test(fabric[0])){
  const weight=fabric[0].match(/\d+g\/(?:㎡|m2)/)[0].replace('m2','㎡');
  points.push({title:/가볍/.test(fabric[0])?'가볍고, 실키하게':'부드럽고, 실키하게',description:weight+' 저지 원단의 부드러운 터치.',evidence:fabric[0]});
 }
 const slim=text.match(/몸에 자연스럽게 밀착되는 슬림한 실루엣으로[^.\n]*(?:활용하기 좋습니다|적합)/);
 if(slim&&/레이어드/.test(slim[0]))points.push({title:'슬림하게, 레이어드',description:'몸에 자연스럽게 밀착되는 슬림 실루엣.',evidence:slim[0]});
 const neck=text.match(/적당한 폭의 터틀넥[^.\n]*?(?:착용감[^.\n]*?(?:더했으며|제공)|착용감)/);
 if(neck)points.push({title:'부담 적은 터틀넥',description:'적당한 폭으로 편안한 착용감.',evidence:neck[0]});
 if(points.length)return points.slice(0,3);
 // Keep the official POINT headings and wording for other clothing categories.
 const original=String(description||'').replace(/\\n/g,'\n');
 const blocks=[...original.matchAll(/POINT\s*0?[1-9]\s*(?:[（(]([^）)]+)[）)])?\s*([\s\S]*?)(?=POINT\s*0?[1-9]|\n\s*\*|$)/gi)];
 for(const block of blocks){
  const lines=block[2].split(/\n+/).map(s=>s.trim()).filter(Boolean);if(!lines.length)continue;
  const first=lines[0],sentence=(lines.slice(1).join(' ')||first).split(/(?<=[.!?])\s+/)[0];
  points.push({title:first.length<=28?first:(block[1]||first.slice(0,27)+'…'),description:sentence.length<=90?sentence:sentence.slice(0,89)+'…',evidence:block[2].trim()});
 }
 if(points.length)return points.slice(0,3);
 // With no POINT blocks, quote an actual official sentence rather than fill cards
 // with a product name, color count, size list, or a material-check instruction.
 for(const sentence of text.split(/(?<=[.!?])\s+/).filter(s=>s.length>=10&&!/^(?:\*|※)|주의|비침이 있을|참고 부탁/.test(s)).slice(0,3))points.push({title:sentence.length<=28?sentence:sentence.slice(0,27)+'…',description:sentence.length<=90?sentence:sentence.slice(0,89)+'…',evidence:sentence});
 return points;
}
export function usableSellingPoints(points,source){
 const compact=s=>String(s).replace(/\s+/g,'');
 return Array.isArray(points)&&points.length>0&&points.every(p=>p.title&&p.description&&p.evidence&&!/^혼용 소재$|^\d+ COLORS$|^SIZE$|^PRODUCT$/.test(p.title)&&!/혼용 여부는.*확인해/.test(p.description)&&(source===undefined||compact(source).includes(compact(p.evidence.split(/\s+\/\s+https?:\/\//)[0]))));
}
