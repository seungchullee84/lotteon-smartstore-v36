import test from 'node:test';import assert from 'node:assert/strict';
import {sellingPointIconKind,sellingPointIcon} from '../smartstore-point-icons.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
test('소구점 제목과 설명에 맞춰 아이콘을 선택하고 변경시 다시 계산한다',()=>{
 const point={title:'가볍게, 포근하게',description:'안쪽 기모'};assert.equal(sellingPointIconKind(point),'warmth');
 Object.assign(point,{title:'입체적인 NEW YORK',description:'자수 아플리케'});assert.equal(sellingPointIconKind(point),'embroidery');
 Object.assign(point,{title:'편안함에 실용성까지',description:'캥거루 포켓'});assert.equal(sellingPointIconKind(point),'pocket');
 for(const [title,kind] of [['여유로운 핏','fit'],['쾌적한 통기성','airflow'],['가벼운 경량','light'],['냉감 소재','cooling'],['자유로운 신축성','stretch'],['면 혼용','material'],['확인된 특징','neutral']])assert.equal(sellingPointIconKind({title}),kind);
 assert.equal(sellingPointIconKind({title:'촉감의 차이',description:'안쪽 기모'}),'warmth');
 for(const [title,kind] of [['포근한 메리노 울','wool'],['부드럽게 감싸는 터틀넥','turtleneck'],['단정한 라운드넥','neckline'],['지퍼로 더한 포인트','zipper']])assert.equal(sellingPointIconKind({title}),kind);
 assert.notEqual(sellingPointIconKind({title:'겨울 아이템'}),'wool');
 assert.doesNotMatch(sellingPointIcon({title:'<script>alert(1)</script>'}),/<script/);
});
test('실제 상세 문서에서 최신 소구점별 아이콘과 문구를 함께 바꾼다',()=>{
 const p={style:'026982',images:{detail:'https://example.com/detail.jpg'},colors:[],smartstoreDetail:{style:'026982',sellingPoints:[{title:'포근한 기모',description:'따뜻하게',evidence:'공식 확인'}]}};
 assert.match(buildSmartstoreDetail(p).html,/data-point-icon="warmth"/);
 p.smartstoreDetail.sellingPoints=[{title:'자수 디테일',description:'입체적인 패치',evidence:'공식 확인'}];
 const html=buildSmartstoreDetail(p).html;assert.match(html,/data-point-icon="embroidery"/);assert.doesNotMatch(html,/data-point-icon="warmth"/);
});
