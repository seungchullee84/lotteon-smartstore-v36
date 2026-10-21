import test from 'node:test';
import assert from 'node:assert/strict';
import {officialConsumerPrice} from '../product.mjs';

test('375908 소비자가는 판매가·쿠폰가와 구분한다',()=>{
  const html='<div class="info" data-normal_prc="59,800" data-sell_prc="54,800" data-lower_prc="46,500"><span>46,500원</span><table><tr><th>소비자가격</th><td>59,800원</td></tr><tr><th>판매가</th><td>54,800원</td></tr></table>'+ '쿠폰 안내 '.repeat(150)+'46,500원 STYLE. 05375908</div>';
  assert.equal(officialConsumerPrice(html),59800);
});
test('명시된 소비자가 표만 있어도 읽는다',()=>assert.equal(officialConsumerPrice('<table><tr><th>소비자가</th><td>59,800 원</td></tr></table>'),59800));
test('판매가만 있거나 소비자가가 비어 있으면 추측하지 않는다',()=>{
  for(const value of ['', '0', '가격문의', '59,800 / 46,500'])assert.equal(officialConsumerPrice(`<div class="info" data-normal_prc="${value}">46,500원 STYLE.</div>`),null);
});
test('소비자가 출처가 서로 다르면 확인을 요구한다',()=>assert.equal(officialConsumerPrice('<div class="info" data-normal_prc="59,800"></div><table><tr><th>소비자가격</th><td>54,800원</td></tr></table>'),null));
