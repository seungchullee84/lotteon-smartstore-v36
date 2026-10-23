// Synthetic examples only. Does not collect products, open browsers or register anything.
import {koreanTitle,buildKeywords} from './product.mjs';
const examples=[
  {rawName:'남성 아가일 브이넥 니트',gender:'남성',style:'356956'},
  {rawName:'여성 브이넥 스트라이프 가디건',gender:'여성',style:'000000'},
  {rawName:'남성 기모 그래픽 맨투맨',gender:'남성',style:'000000'},
  {rawName:'여성 경량 후드 숏 패딩 자켓',gender:'여성',style:'000000'}
];
console.log('재현·가상 입력 예시입니다. 실제 상품 정보나 등록 결과가 아닙니다. 000000은 예시 품번입니다.');
for(const p of examples){
  const name=koreanTitle(p.rawName,p.gender,p.style);
  const keywords=buildKeywords({...p,name});
  console.log('\n원본명: '+p.rawName+' / 성별: '+p.gender+' / 품번: '+p.style);
  console.log('상품명: '+name);
  console.log('검색키워드: '+keywords+' ('+keywords.length+'/35자)');
}
