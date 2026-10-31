import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryPageUrl} from '../official-benefit-catalog.mjs';
test('공식 더보기는 module_page와 skin_ajax를 사용한다',()=>{
 const u=new URL(categoryPageUrl('https://www.giordano.co.kr/shop/big_section.php?cno1=1093',2));
 assert.equal(u.pathname,'/main/exec.php');
 assert.equal(u.searchParams.get('exec_file'),'skin_module/skin_ajax.php');
 assert.equal(u.searchParams.get('module_page'),'2');
 assert.equal(u.searchParams.get('cno1'),'1093');
 assert.equal(u.searchParams.get('single_module'),'prd_basic');
});
