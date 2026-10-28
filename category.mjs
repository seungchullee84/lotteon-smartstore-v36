export const MENS_UNDERWEAR_CATEGORY=Object.freeze({commonMajor:'L0014 : 남성의류',commonMiddle:'M0059 : 남성속옷',commonSmall:'00715 : 남성내의',channelMajor:'남성의류',channelMiddle:'남성속옷',channelSmall:'남성내의',channelDetail:''});
export function isMensUnderwear(product){
 const title=product.rawName||product.name||'';
 return product.gender==='남성'&&(/지워머|내의|내복/.test(title)||(product.sourceCategory?.includes('INNERWEAR')&&/발열|레깅스/.test(title)));
}
export function categoryAlternatives(value){
 const label=value.replace(/^[^:：]*[:：]\s*/,'').trim();const gender=label.match(/^(남성|여성)/)?.[0]||'';const base=label.replace(/^(남성|여성)/,'');
 const groups=[['바람막이','바람막이점퍼','윈드브레이커'],['스웨트셔츠/후드/집업','후드티셔츠','후드티','후드','맨투맨/후드티','맨투맨/후드','스웨트셔츠','맨투맨'],['티셔츠/맨투맨','긴팔티셔츠/맨투맨','티셔츠/후드','티셔츠/탑','티셔츠','라운드넥티셔츠','라운드티셔츠','긴팔티셔츠'],['트레이닝바지','트레이닝하의','트레이닝팬츠','스웻팬츠','스웨트팬츠','트레이닝복'],['바지','팬츠','캐주얼바지','바지/레깅스'],['면바지','치노면바지','치노팬츠','코튼팬츠','면바지/밴딩팬츠'],['기모팬츠','기모바지','브러시드팬츠'],['청바지','데님','데님팬츠'],['재킷','자켓','자켓/코트','재킷/코트'],['점퍼','점퍼/패딩/야상','점퍼/패딩','재킷/점퍼'],['패딩','패딩/다운','패딩점퍼','다운점퍼','패딩/다운점퍼'],['니트','니트/스웨터','스웨터/풀오버','스웨터','풀오버','니트/가디건','스웨터/가디건'],['가디건','카디건','집업니트','집업 니트','니트집업'],['코트','롱코트','하프코트','트렌치코트','자켓/코트','재킷/코트']];
 const group=groups.find(g=>g.includes(base))||[];
 const genericJacket=/^(재킷|자켓)$/.test(base)?['캐주얼자켓','캐주얼재킷']:[];
 return [...new Set([label,...[...group,...genericJacket].map(x=>gender+x)])];
}
export function similarCategory(value,labels){
 for(const candidate of categoryAlternatives(value)){const matches=labels.filter(l=>l.replace(/^[^:：]*[:：]\s*/,'').replace(/\s/g,'')===candidate.replace(/\s/g,''));if(matches.length===1)return matches[0];}
 if(!/^(남성|여성)/.test(value.replace(/^[^:：]*[:：]\s*/,''))){
   for(const candidate of categoryAlternatives(value)){
     const matches=labels.filter(l=>l.replace(/^[^:：]*[:：]\s*/,'').replace(/^(남성|여성)/,'').replace(/\s/g,'')===candidate.replace(/\s/g,''));
     if(matches.length===1)return matches[0];
   }
 }
 return null;
}

// Keep the parent and leaf together; aliases alone cannot repair the wrong branch.
export function channelCategoryPath(category){
 // Selected in the live Lotte channel tree, 2026-10-28. No material restriction.
 if(category.channelSmall==='머플러'&&category.channelMiddle==='워머/목도리')return {...category,channelMajor:'브랜드잡화/넥타이',channelDetail:'',channelCodes:{major:'BC35000000',middle:'BC35100000',small:'BC35100100',detail:''}};
 if(category.channelSmall==='남성내의')return {...category,...MENS_UNDERWEAR_CATEGORY,channelCodes:undefined};
 const leaf=String(category.channelSmall||'').replace(/^[^:：]*[:：]\s*/,'').replace(/^(남성|여성)/,'').trim();
 // User-confirmed standard category screenshot, 2026-10-26. No detail level.
 if(leaf==='니트머플러')return {...category,channelMajor:'잡화',channelMiddle:'워머/머플러',channelSmall:'니트머플러',channelDetail:''};
 const paths=[
  {leaves:['청바지','데님','데님팬츠','부츠컷/와이드핏','스키니/슬림핏','스트레이트핏'],middle:'청바지'},
  {leaves:['바람막이','바람막이점퍼','윈드브레이커','패딩','패딩/다운','패딩점퍼','다운점퍼','패딩/다운점퍼'],middle:'점퍼/패딩/야상'},
  {leaves:['코트','롱코트','하프코트','트렌치코트','재킷','자켓','캐주얼자켓','캐주얼재킷','트위드자켓','테일러드자켓','노카라자켓','린넨/마자켓'],middle:'자켓/코트'},
  {leaves:['면바지','면바지/밴딩팬츠','치노면바지','치노팬츠','코튼팬츠','슬랙스','기모팬츠','기모바지','브러시드팬츠'],middle:'바지'},
  {leaves:['트레이닝바지','트레이닝팬츠','스웻팬츠','스웨트팬츠'],middle:'트레이닝복'}
 ];
 const rule=paths.find(p=>p.leaves.includes(leaf));
 if(!rule)return {...category};
 const middle=categoryAlternatives(rule.middle).includes(category.channelMiddle)?category.channelMiddle:rule.middle;
 return {...category,channelMiddle:middle};
}
