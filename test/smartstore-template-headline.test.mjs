import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {validateTemplateHeadline,templateHeadlineEdits} from '../smartstore-template-headline.mjs';
import {applyProductEdits} from '../product-edits.mjs';

test('직접 입력 제목은 두 템플릿에서 텍스트로만 반영하고 공식·판매 상품명은 보존한다',()=>{
 const p={style:'123456',name:'판매용 상품명',rawName:'공식 상품명',gender:'남성',colors:[],sizes:[],images:{},templateHeadline:'따뜻한 하루\n<script>문구</script>'};
 for(const detailTemplate of [1,2]){
  const $=load(buildSmartstoreDetail({...p,detailTemplate}).html);
  assert.equal($('[data-template-main-title]').text(),p.templateHeadline);
  assert.equal($('[data-template-main-title] script').length,0);
  const automatic=load(buildSmartstoreDetail({...p,detailTemplate,templateHeadline:''}).html);
  assert(!automatic('[data-template-main-title]').text().includes('따뜻한 하루'));
 }
 assert.equal(p.name,'판매용 상품명');assert.equal(p.rawName,'공식 상품명');
 assert.equal(applyProductEdits(p,{style:p.style,fields:{templateHeadline:''}}).templateHeadline,'');
 assert.equal(validateTemplateHeadline('첫 줄\r\n둘째 줄'),'첫 줄\n둘째 줄');
 for(const value of [null,{},'가'.repeat(121)])assert.throws(()=>validateTemplateHeadline(value),/120자/);
});

test('템플릿1 감성 제목과 템플릿2 상품명은 별도로 저장·표시하고 자동 복원도 서로 영향을 주지 않는다',()=>{
 const original={style:'376923',name:'판매용 제목',rawName:'후드 덕다운 푸퍼',gender:'여성',colors:[],sizes:[],images:{},templateHeadline:'여성 후드 덕다운 점퍼'};
 const one=templateHeadlineEdits(original,'추운 날에도,\n포근하게',1),p=applyProductEdits(original,{style:original.style,fields:one});
 assert.equal(p.templateHeadline2,original.templateHeadline);
 for(const [detailTemplate,title] of [[1,'추운 날에도,\n포근하게'],[2,original.templateHeadline]])assert.equal(load(buildSmartstoreDetail({...p,detailTemplate}).html)('[data-template-main-title]').text(),title);
 const reset=applyProductEdits(p,{style:p.style,fields:templateHeadlineEdits(p,'',1)});
 assert.equal(load(buildSmartstoreDetail({...reset,detailTemplate:2}).html)('[data-template-main-title]').text(),original.templateHeadline);
 assert.notEqual(load(buildSmartstoreDetail({...reset,detailTemplate:1}).html)('[data-template-main-title]').text(),original.templateHeadline);
 assert.equal(p.name,original.name);assert.equal(p.rawName,original.rawName);
});
