// Shared vocabulary for evidence detection, API comparisons and deduplication.
// Similar-looking but different facts (regular/slim, down/polyester, long/short)
// are never interchangeable. Add new equivalent spellings here, not per style.
export const garmentSynonyms={
 니트:['니트','스웨터','풀오버'],가디건:['가디건','카디건'],
 자켓:['자켓','재킷'],바지:['바지','팬츠','트라우저'],
 반바지:['반바지','쇼츠','쇼트팬츠'],티셔츠:['티셔츠','티'],
 맨투맨:['맨투맨','스웨트셔츠','스웻셔츠'],후드티:['후드티','후드티셔츠','후디'],
 셔츠:['셔츠','남방'],스커트:['스커트','치마'],원피스:['원피스','드레스'],
 조끼:['조끼','베스트'],바람막이:['바람막이','윈드브레이커'],
 패딩:['패딩','푸퍼'],코트:['코트'],점퍼:['점퍼'],블라우스:['블라우스'],레깅스:['레깅스']
};

export const featureSynonyms=[
 {id:'collar',pattern:/폴로|카라|칼라/,variants:['카라','칼라','카라넥'],extend:source=>/폴로/.test(source)?['폴로카라']:[]},
 {id:'zip',pattern:/풀\s*(?:집|집업|지퍼)|full\s*zip/i,variants:['집업','풀집업','풀지퍼']},
 {id:'half-zip',pattern:/반집업|하프\s*집업|half\s*zip/i,variants:['반집업','하프집업']},
 {id:'fleece',pattern:/플리스|후리스|fleece/i,variants:['플리스','후리스']},
 {id:'brushed',pattern:/기모|브러시드|brushed/i,variants:['기모','브러시드']},
 {id:'wool',pattern:/(?<!겨)울|모직|wool/i,variants:['울']},
 {id:'tapered',pattern:/테이퍼드/,variants:['테이퍼드','테이퍼드핏']},
 {id:'banding',pattern:/히든\s*밴딩/,variants:['히든밴딩','밴딩']},
 {id:'long-sleeve',pattern:/긴팔|긴소매|롱슬리브|long\s*sleeve/i,variants:['긴팔','긴소매','롱슬리브']},
 {id:'short-sleeve',pattern:/반팔|반소매|숏슬리브|short\s*sleeve/i,variants:['반팔','반소매','숏슬리브']},
 {id:'sleeveless',pattern:/민소매|슬리브리스|(?:^|\s)나시(?:\s|$)/,variants:['민소매','슬리브리스','나시']},
 {id:'fit',pattern:/오버핏|오버사이즈/,variants:['오버핏','오버사이즈']},
 {id:'fit',pattern:/레귤러\s*핏/,variants:['레귤러핏']},
 {id:'fit',pattern:/슬림\s*핏/,variants:['슬림핏']},
 {id:'cable',pattern:/케이블|꽈배기/,variants:['케이블','꽈배기']},
 {id:'rib',pattern:/골지|리브드/,variants:['골지','리브드']},
 {id:'terry',pattern:/프렌치\s*테리|french\s*terry|쭈리/i,variants:['프렌치테리','쭈리']},
 {id:'stripe',pattern:/스트라이프|단가라|줄무늬/,variants:['스트라이프','단가라','줄무늬']},
 {id:'quilt',pattern:/퀼팅|누빔/,variants:['퀼팅','누빔']},
 {id:'corduroy',pattern:/코듀로이|골덴/,variants:['코듀로이','골덴']},
 {id:'round-neck',pattern:/크루\s*넥|라운드(?:\s*넥)?/,variants:['라운드넥','크루넥']},
 {id:'v-neck',pattern:/브이넥|v\s*넥/i,variants:['브이넥','V넥']},
 {id:'turtle-neck',pattern:/터틀넥|목폴라/,variants:['터틀넥','목폴라']},
 {id:'mock-neck',pattern:/모크넥|반목/,variants:['모크넥','반목']},
 {id:'linen',pattern:/린넨|리넨/,variants:['린넨','리넨']},
 {id:'stretch',pattern:/스판|스트레치/,variants:['스판','스트레치']},
 {id:'short-length',pattern:/숏(?:기장)?|쇼트/,variants:['숏','숏기장','쇼트']}
];

export function titleFeatureGroups(source,product){
 const found=featureSynonyms.filter(group=>group.pattern.test(source)).map(group=>({id:group.id,variants:[...group.variants,...(group.extend?.(source)||[])]}));
 if(!found.some(g=>g.id==='banding')&&/밴딩/.test(source))found.push({id:'banding',variants:['밴딩']});
 if(!found.some(g=>['zip','half-zip'].includes(g.id))&&/집업|지퍼/.test(source))found.push({id:'zip',variants:['집업','지퍼']});
 const verified=product.noticeVerified||product.fieldStatus?.material==='공식 이미지 대조 완료';
 const material=verified?String(product.material||'').normalize('NFKC').trim():'';
 // The API compares the two Korean search expressions for each product.
 // Only a verified pure-cotton specification may carry the 100% claim.
 if(/^(?:면|코튼|cotton)\s*100\s*%$/i.test(material))found.push({id:'cotton',variants:['면100%','코튼100%']});
 else if(/코튼|(?:^|\s)면(?:\s|티|혼방)/.test(source)||/(?:면|코튼|cotton)\s*\d/i.test(material))found.push({id:'cotton',variants:['면','코튼']});
 if(/캐시미어/.test(source+material))found.push({id:'cashmere',variants:['캐시미어']});
 if(/린넨|리넨/.test(material)&&!found.some(g=>g.id==='linen'))found.push({id:'linen',variants:['린넨','리넨']});
 return found;
}

export function titleCategoryAliases(product,kind){
 const source=[product.rawName,product.name].join(' ');
 if(kind==='바지'&&/청바지|데님\s*(?:팬츠|바지)|진팬츠/.test(source))return ['청바지','데님팬츠','데님바지'];
 if(kind==='바지'&&/슬랙스/.test(source))return ['슬랙스',...garmentSynonyms.바지];
 if(kind==='셔츠'&&/드레스\s*셔츠|정장\s*셔츠/.test(source))return ['셔츠'];
 if(kind==='패딩'&&!/베스트|조끼/.test(source))return ['패딩','푸퍼','패딩점퍼','패딩자켓','점퍼'];
 return garmentSynonyms[kind]||[kind];
}

export function featureQueryForms(word){
 return word==='라운드넥'?['라운드넥','라운드']:[word.replace(/100%$/,'')];
}

export function mentionedFeatureVariant(keyword,group){
 return group.variants.flatMap(variant=>featureQueryForms(variant).map(text=>({variant,text})))
  .sort((a,b)=>b.text.length-a.text.length).find(entry=>keyword.toLowerCase().includes(entry.text.toLowerCase()))?.variant;
}
