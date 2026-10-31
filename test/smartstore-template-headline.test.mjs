import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {validateTemplateHeadline} from '../smartstore-template-headline.mjs';
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
