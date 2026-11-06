export function careLabelText(text){
 const words=['제조국','제조연월','혼용률','취급주의','관리번호','LOT','MADE IN','폴리에스터','소비자상담'];
 const compact=String(text||'').replace(/\s+/g,'').toUpperCase();
 return words.filter(word=>compact.includes(word.replace(/\s+/g,'').toUpperCase())).length>=3;
}
