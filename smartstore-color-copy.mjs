// Short styling impressions from the colour name only; no fabric or performance claims.
const captions=[
 [/크림|아이보리|오프화이트|에크루|cream|ivory|ecru/i,'부드럽고 화사하게'],
 [/베이지|샌드|오트밀|beige|sand|oatmeal/i,'차분하고 자연스럽게'],
 [/브라운|초코|카멜|모카|brown|choco|camel|mocha/i,'따뜻하고 깊이 있게'],
 [/네이비|남색|navy/i,'단정하고 세련되게'],
 [/블랙|검정|black/i,'깔끔하고 선명하게'],
 [/그레이|회색|차콜|gray|grey|charcoal/i,'차분하게 어우러지는'],
 [/화이트|흰색|white/i,'맑고 깨끗하게'],
 [/버건디|와인|burgundy|wine/i,'깊이 있는 포인트'],
 [/핑크|로즈|pink|rose/i,'은은하고 부드럽게'],
 [/블루|하늘|데님|blue|denim/i,'맑고 산뜻하게'],
 [/그린|카키|올리브|green|khaki|olive/i,'자연스럽고 차분하게'],
 [/레드|빨강|red/i,'선명하게 더하는 포인트'],
 [/옐로|노랑|머스터드|yellow|mustard/i,'밝고 경쾌하게'],
 [/퍼플|보라|라벤더|purple|lavender/i,'은은하게 분위기 있게'],
 [/오렌지|주황|orange/i,'생기 있는 포인트'],
];
export function colorCaption(color){
 const name=String(color||'').replace(/^\d+\s*/,'');
 if(!/[\/&+]|배색|혼합|멀티/.test(name))for(const [pattern,caption]of captions)if(pattern.test(name))return caption;
 return '색감으로 더하는 포인트';
}
