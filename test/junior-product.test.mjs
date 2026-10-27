import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAdultProduct,assertAdultProductPage,findAdultProductUrl,parseProduct} from '../product.mjs';
import {validateProduct} from '../product-validation.mjs';
import {prepareSmartstoreAuto} from '../smartstore-auto-prepare.mjs';

const base='https://www.giordano.co.kr/shop/detail.php?pno=';
const junior=error=>error.code==='JUNIOR_PRODUCT'&&/적용하지 않았습니다/.test(error.message);
const page=(major,title='덕다운 패딩',style='123456')=>`<title>${title} - 지오다노</title><nav><h3>JUNIOR</h3><a>JUNIOR</a><a>KIDS</a></nav><div class="navi"><a>Home</a><a class="prdpath1">${major}</a><a>OUTER</a><a>${title}</a></div><div>STYLE. ${style}</div><img src="/_data/attach/main.jpg"><img src="/${style}info.jpg">`;

test('공식 상품명·경로·주니어 전용 주소 중 하나만 확인돼도 제외',()=>{
 for(const product of [{rawName:'주니어 목넥 패딩'},{rawName:'쥬니어 긴팔티'},{sourceCategory:['JUNIOR','OUTER']},{name:'키즈 니트'},{rawName:'Kids padded jacket'},{sourceUrl:base+'junior&brand=page_junior'}])assert.throws(()=>assertAdultProduct(product),junior);
 assert.throws(()=>assertAdultProductPage(page('JUNIOR')),junior);
 assert.throws(()=>assertAdultProductPage('<h3>주니어 패딩</h3>'),junior);
});

test('성인 상품은 공통 메뉴·추천 상품에 주니어가 있어도 수집 가능',()=>{
 for(const major of ['MEN','WOMEN']){
  const html=page(major)+'<aside>추천 상품: 주니어 패딩</aside>';
  assert.doesNotThrow(()=>assertAdultProductPage(html));
  assert.equal(parseProduct(html,base+'adult','123456').style,'123456');
 }
});

test('주니어 상세 URL도 상품정보 생성 전에 차단',()=>{
 assert.throws(()=>parseProduct(page('JUNIOR'),base+'junior','123456'),junior);
 assert.throws(()=>parseProduct(page('MEN'),base+'junior&brand=page_junior','123456'),junior);
});

test('같은 품번 검색에서 주니어를 건너뛰고 성인 결과를 선택',async()=>{
 const results=new Map([[base+'junior',page('JUNIOR')],[base+'other',page('MEN','다른 상품','654321')],[base+'adult',page('WOMEN')]]);
 assert.equal(await findAdultProductUrl([...results.keys()],'123456',async url=>results.get(url)),base+'adult');
});

test('일치하는 결과가 주니어뿐이면 적용 없이 중단',async()=>{
 await assert.rejects(findAdultProductUrl([base+'junior'],'123456',async()=>page('JUNIOR')),junior);
 await assert.rejects(findAdultProductUrl([base+'other'],'123456',async()=>page('MEN','다른 상품','654321')),/실제 품번/);
});

test('저장된 주니어 상품도 등록 입력·사진 준비 전에 차단',async()=>{
 const product={style:'123456',rawName:'주니어 패딩',sourceCategory:['JUNIOR']};
 assert.throws(()=>validateProduct(product),junior);
 await assert.rejects(prepareSmartstoreAuto(product,'unused',{dataRoot:'unused'}),junior);
});
