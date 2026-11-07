import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {buildSmartstoreDetail,smartstoreDetailDocument} from '../smartstore-detail.mjs';

function productWithGuide(){
 const style='116955',products=[
  {style,fit:'스트레이트',color:'04 미드헤더그레이',description:'일자로 자연스럽게 떨어져요.',measurements:[74.9,111.8,66.4,47,34,74.3,105.4]},
  {style:'116956',fit:'조거',color:'02 미드헤더그레이',description:'밑단 밴딩으로 발목을 잡아줘요.',measurements:[78.7,114.3,68.6,30.5,32.4,72.1,103.5]},
  {style:'116958',fit:'와이드',color:'03 미드헤더그레이',description:'허벅지부터 밑단까지 여유 있어요.',measurements:[80,120.7,75.2,55.9,34.3,72.4,104.1]}
 ].map(p=>({...p,front:'/smartstore-photo/guide-'+p.style+'-front',side:'/smartstore-photo/guide-'+p.style+'-side',purchaseUrl:'https://smartstore.naver.com/test/products/'+p.style}));
 return {style,detailTemplate:1,name:'기모 테리 스트레이트 스웻 팬츠',rawName:'기모 테리 스트레이트 스웻 팬츠',gender:'남성',colors:['01블랙','04미드헤더그레이'],sizes:['S','M','L','XL'],images:{main:'https://www.giordano.co.kr/main.jpg',detail:'https://www.giordano.co.kr/detail.jpg',size:'https://www.giordano.co.kr/size.jpg',info:'https://www.giordano.co.kr/info.jpg'},smartstoreDetail:{style,photoCount:3,heroImage:'/smartstore-photo/current-main',acceptAllFolderPhotos:true,colorImages:{'01블랙':['/smartstore-photo/current-black'],'04미드헤더그레이':['/smartstore-photo/current-gray-front','/smartstore-photo/current-gray-side']},paletteImages:{'01블랙':'/smartstore-photo/current-black','04미드헤더그레이':'/smartstore-photo/current-gray-front'},fitGuide:{style,detailTemplate:1,products,manager:{storeName:'동탄 롯데 지오다노',source:'user',rows:[{waist:'28',size:'S'},{waist:'29~31',size:'M'},{waist:'32~33',size:'L'},{waist:'34~36',size:'XL'}]}}}};
}
const currentColorImages=$=>$('section[id^="smartstore-color-"] img').toArray().map(n=>$(n).attr('src'));
const purchaseNotice='비교할 상품의 정면 사진을 누르면 구매 페이지로 이동해요.';
function productWithVerifiedLinks(){
 const product=productWithGuide(),urls={
  '116955':'https://shopping.naver.com/window-products/department/13857000000',
  '116956':'https://shopping.naver.com/window-products/department/13857522426',
  '116958':'https://shopping.naver.com/window-products/department/13857609430'
 };
 for(const item of product.smartstoreDetail.fitGuide.products)item.purchaseLink={style:item.style,url:urls[item.style],source:'user'};
 return product;
}

test('선택한 템플릿1·현재 품번에만 가이드와 현재 상품 표식 한 개를 표시한다',()=>{
 const p=productWithGuide(),$=load(buildSmartstoreDetail(p).html);
 assert.equal($('[data-fit-guide]').length,1);assert.equal($('[data-guide-style]').attr('data-guide-style'),p.style);
 assert.equal($('[data-fit-guide] .fit-guide-current').length,1);assert.equal(($('[data-fit-guide]').text().match(/지금 보고 있는 상품/g)||[]).length,1);
 const wrongStyle={...p,style:'123456',smartstoreDetail:{...p.smartstoreDetail,style:'123456'}};
 for(const candidate of [{...p,detailTemplate:2},wrongStyle,{...p,smartstoreDetail:{...p.smartstoreDetail,fitGuide:undefined}},{...p,smartstoreDetail:{...p.smartstoreDetail,fitGuide:{...p.smartstoreDetail.fitGuide,detailTemplate:2}}}]){
  assert.equal(load(buildSmartstoreDetail(candidate).html)('[data-fit-guide]').length,0);
 }
});

test('비교 사진의 품번·구도 순서를 유지하고 기존 현재 상품 사진 그룹을 바꾸지 않는다',()=>{
 const p=productWithGuide(),before=structuredClone(p),result=buildSmartstoreDetail(p),$=load(result.html),base=load(buildSmartstoreDetail({...p,smartstoreDetail:{...p.smartstoreDetail,fitGuide:undefined}}).html);
 const products=p.smartstoreDetail.fitGuide.products;
 assert.deepEqual($('[data-fit-comparison] .fit-guide-grid').first().find('img').toArray().map(n=>$(n).attr('src')),products.map(p=>p.front));
 assert.deepEqual($('[data-fit-comparison] .fit-guide-sides img').toArray().map(n=>$(n).attr('src')),products.map(p=>p.side));
 assert.deepEqual(currentColorImages($),currentColorImages(base));
 assert.deepEqual($('[data-color-palette] img').toArray().map(n=>$(n).attr('src')),base('[data-color-palette] img').toArray().map(n=>base(n).attr('src')));
 assert.equal($('[data-product-intro] img').last().attr('src'),p.smartstoreDetail.heroImage);
 for(const item of products)for(const role of ['front','side'])assert(result.sources.includes(item[role]));
 assert.deepEqual(p,before);assert.equal(p.smartstoreDetail.photoCount,3);
});

test('구매URL이 준비 자료에 있어도 가이드에 구매 링크나 가짜 버튼을 만들지 않는다',()=>{
 const p=productWithGuide(),$=load(buildSmartstoreDetail(p).html),guide=$('[data-fit-guide]');
 assert.equal(guide.find('a,button,[onclick],[role="button"]').length,0);
 for(const item of p.smartstoreDetail.fitGuide.products)assert(!guide.html().includes(item.purchaseUrl));
 assert.doesNotMatch(guide.text(),/사진을.*누르|클릭.*구매|구매하러/);
});

test('미리보기에서 정면 사진 자체에 구매 주소가 연결되고 현재 상품과 측면은 연결하지 않는다',()=>{
 const p=productWithVerifiedLinks(),$=load(buildSmartstoreDetail(p).html),guide=$('[data-fit-guide]'),front=guide.find('.fit-guide-grid').first(),side=guide.find('.fit-guide-sides');
 const links=front.find('a').toArray().map(node=>({style:$(node).closest('[data-comparison-style]').attr('data-comparison-style'),url:$(node).attr('href')}));
 assert.deepEqual(links,[
  {style:'116956',url:'https://shopping.naver.com/window-products/department/13857522426'},
  {style:'116958',url:'https://shopping.naver.com/window-products/department/13857609430'}
 ]);
 assert.deepEqual(front.find('a[data-fit-photo-link] img').toArray().map(node=>$(node).attr('src')),['/smartstore-photo/guide-116956-front','/smartstore-photo/guide-116958-front']);
 assert.equal(guide.find('a').length,2);assert.equal(guide.find('[data-comparison-style="116955"] a').length,0);assert.equal(side.find('a,button').length,0);
 assert.deepEqual(side.find('img').toArray().map(node=>$(node).attr('src')),p.smartstoreDetail.fitGuide.products.map(item=>item.side));
 const notice=guide.find('[data-fit-photo-link-notice]');
 assert.equal(notice.length,1);assert.equal(notice.text(),purchaseNotice);
 assert(guide.html().indexOf('data-fit-photo-link-notice')<guide.html().indexOf('fit-guide-sides'));
});

test('PNG용 출력은 상품 태그·클릭 안내를 굽지 않으며 비교 사진과 품번 정보를 보존한다',()=>{
 const p=productWithVerifiedLinks(),preview=buildSmartstoreDetail(p),preview$=load(preview.html);
 for(const result of [buildSmartstoreDetail(p,{interactiveProductTags:false}),smartstoreDetailDocument(p,{interactiveProductTags:false,includeVideo:false})]){
  const $=load(result.html),guide=$('[data-fit-guide]');
  assert.equal(guide.find('a,button,[onclick],[role="button"],[data-upload-fit-photo],[data-fit-photo-link-notice]').length,0);assert.equal(guide.text().replace(/\s+/g,'').includes(purchaseNotice.replace(/\s+/g,'')),false);
  assert.deepEqual(guide.find('img').toArray().map(node=>$(node).attr('src')),preview$('[data-fit-guide] img').toArray().map(node=>preview$(node).attr('src')));
  assert.deepEqual(guide.find('[data-comparison-style]').toArray().map(node=>$(node).attr('data-comparison-style')),['116955','116956','116958','116955','116956','116958']);
  assert.deepEqual(result.sources,preview.sources);
 }
});

test('업로드 렌더에서만 정면 세 장을 각각의 구간으로 표시하고 비교 상품 두 장에만 주소를 전달한다',()=>{
 const p=productWithVerifiedLinks(),$=load(smartstoreDetailDocument(p,{interactiveProductTags:false,independentFitPhotos:true}).html);
 const cards=$('[data-upload-fit-photo]');
 assert.deepEqual(cards.toArray().map(node=>({style:$(node).attr('data-comparison-style'),url:$(node).attr('data-purchase-url')||null})),[
  {style:'116955',url:null},
  {style:'116956',url:'https://shopping.naver.com/window-products/department/13857522426'},
  {style:'116958',url:'https://shopping.naver.com/window-products/department/13857609430'}
 ]);
 assert.equal(cards.find('img').length,3);assert.equal(cards.find('a').length,0);
 assert.equal(cards.find('.fit-guide-photo-cta').length,2);
 assert.equal($('[data-fit-guide] img').length,6);
});

test('공식 L 치수와 사용자 추천 네 행을 서로 다른 표로 정확히 표시한다',()=>{
 const p=productWithGuide(),$=load(buildSmartstoreDetail(p).html),guide=p.smartstoreDetail.fitGuide;
 const actual=$('[data-fit-measurements] tbody tr').toArray().map(row=>$(row).find('td').toArray().map(cell=>$(cell).text()));
 assert.deepEqual(actual,Array.from({length:7},(_,i)=>guide.products.map(p=>p.measurements[i].toFixed(1))));
 assert.match($('[data-fit-measurements]').text(),/공식 L 사이즈/);assert.match($('[data-fit-measurements]').text(),/단면이 아닌 둘레/);
 const rows=$('[data-manager-size-guide] .fit-guide-manager-row').toArray().map(row=>({waist:$(row).find('strong').text(),size:$(row).find('b').text()}));
 assert.deepEqual(rows,guide.manager.rows);assert.equal(rows.length,4);assert($('[data-manager-size-guide]').text().includes(guide.manager.storeName));
});

test('미리보기와 PNG용 문서는 같은 가이드 데이터와 이미지 변환 콜백을 사용한다',()=>{
 const p=productWithGuide(),preview=buildSmartstoreDetail(p),seen=[];
 const imageUrl=src=>{seen.push(src);return 'https://render.example.test/image?source='+encodeURIComponent(src);};
 const document=smartstoreDetailDocument(p,{imageUrl,includeVideo:false}),$=load(document.html),preview$=load(preview.html);
 const originals=p.smartstoreDetail.fitGuide.products.flatMap(p=>[p.front,p.side]);
 assert.deepEqual(document.sources,preview.sources);
 assert.deepEqual($('[data-fit-guide] img').toArray().map(n=>decodeURIComponent(new URL($(n).attr('src')).searchParams.get('source'))),preview$('[data-fit-guide] img').toArray().map(n=>preview$(n).attr('src')));
 for(const src of originals)assert.equal(seen.filter(value=>value===src).length,1);
 assert.equal($('[data-manager-size-guide]').text(),preview$('[data-manager-size-guide]').text());assert.equal($('[data-fit-measurements]').text(),preview$('[data-fit-measurements]').text());
});

test('준비 자료의 상품·매장 문구를 HTML 코드로 실행하지 않는다',()=>{
 const p=productWithGuide(),guide=p.smartstoreDetail.fitGuide,attack='<img src=x onerror="alert(1)"><script>bad()</script>';
 guide.products[1].fit=attack;guide.products[1].description=attack;guide.products[1].color=attack;guide.manager.storeName=attack;guide.manager.rows[0].waist=attack;
 const $=load(buildSmartstoreDetail(p).html),section=$('[data-fit-guide]');
 assert.equal(section.find('img').length,6);assert.equal(section.find('script,[onerror]').length,0);assert(section.text().includes(attack));
});
