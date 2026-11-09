import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedOpenMausPoints} from '../openmaus-selling-points.mjs';

test('only distinct, affirmative evidence from the exact official source adds a selling point',()=>{
 const points=[
  {title:'부드러운 착용감',description:'기모 원단의 부드러운 촉감.',evidence:'기모 원단의 부드러운 촉감.'},
  {title:'편안한 착용감',description:'여유로운 핏으로 편안하게.',evidence:'여유로운 핏으로 편안하게.'},
 ];
 const quote='보풀 방지 기능 제공';
 const source=points.map(point=>point.evidence).concat(quote).join('\n\n');
 const input={style:'026990',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=8BE99B3ABA7919325749CA2116CE2B4D',detailHash:'a'.repeat(64),source};
 const response={style:input.style,sourceUrl:input.sourceUrl,detailHash:input.detailHash,quotes:[quote,quote,'보풀 방지 가공 적용']};
 const result=verifiedOpenMausPoints(response,input,points,source);
 assert.deepEqual(result.slice(0,2),points);
 assert.equal(result.length,3);
 assert.equal(result[2].evidence,quote);
 assert.deepEqual(verifiedOpenMausPoints({...response,detailHash:'b'.repeat(64)},input,points,source),points);
 const negative=source.replace(quote,quote+'하지 않습니다.');
 assert.deepEqual(verifiedOpenMausPoints(response,{...input,source:negative},points,negative),points);
});
