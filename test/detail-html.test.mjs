import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDetailContent} from '../detail-html.mjs';
test('기존 상세 이미지가 있으면 색상별 사진이 준비되어 있어도 원본만 사용',()=>{
  assert.deepEqual(buildDetailContent({detail:'original.jpg',main:'main.jpg',info:'info.jpg'},['블랙'],{'블랙':['black1.jpg','black2.jpg']},'original.jpg').sources,['original.jpg','info.jpg']);
});
test('발견한 원본 상세 이미지를 불러오지 못하면 임의 대체하지 않고 중단',()=>{
  assert.throws(()=>buildDetailContent({main:'main.jpg'},['블랙'],{'블랙':['black1.jpg','black2.jpg']},'original.jpg'),/대체하지 않고 중단/);
});
test('입력한 색상 순서대로 색상명과 사진 두 장을 배치',()=>{
  const result=buildDetailContent({main:'main.jpg',info:'info.jpg'},['02브라운','01블랙'],{'01블랙':['b1.jpg','b2.jpg','b3.jpg'],'02브라운':['r1.jpg','r2.jpg']});
  assert.deepEqual(result.sources,['r1.jpg','r2.jpg','b1.jpg','b2.jpg','info.jpg']);
  assert.ok(result.html.indexOf('02브라운')<result.html.indexOf('01블랙'));
  assert.ok(!result.html.includes('b3.jpg'));
});
test('상세 이미지가 없으면 대표컷과 추가컷 뒤에 고시 이미지를 배치',()=>{
  const images={main:'main.jpg',extra1:'extra1.jpg',extra2:'extra2.jpg',size:'size.jpg',check:'check.jpg',info:'info.jpg'};
  const result=buildDetailContent(images);
  assert.deepEqual(result.sources,Object.values(images));
  assert.equal((result.html.match(/<img /g)||[]).length,6);
});
test('기존 상세 이미지가 있으면 대표사진을 중복 추가하지 않음',()=>{
  assert.deepEqual(buildDetailContent({detail:'detail.jpg',main:'main.jpg',extra1:'extra.jpg',info:'info.jpg'}).sources,['detail.jpg','info.jpg']);
});
test('중복 사진은 한 번만 넣고 주소 속성은 이스케이프',()=>{
  const result=buildDetailContent({main:'a.jpg?x=1&y="2"',extra1:'a.jpg?x=1&y="2"',info:'info.jpg'});
  assert.equal(result.sources.length,2);assert.match(result.html,/&amp;y=&quot;2&quot;/);
});
