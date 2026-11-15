import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficialColorOptions,parseOfficialColorResponse,collectOfficialColorSources} from '../smartstore-official-color-source.mjs';

const pno='A'.repeat(32),ppno='B'.repeat(32);
const product={style:'356946',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+pno,colors:['01그레이','02라떼','03초콜렛','04블랙']};
const url=name=>'https://www.giordano.co.kr/_data/attach/202611/15/'+name+'.jpg';
const page=({style='05356946',hash=pno,parent=ppno,chips=product.colors}={})=>'<form name="prdFrm"><input name="pno" value="'+hash+'"><input name="ppno" value="'+parent+'"></form><span>STYLE. '+style+'</span><a class="style_code_gio" data-clipboard-text="'+style+'"></a>'+chips.map((color,i)=>'<a class="gio_opt_img_list" data="'+(100+i)+'" onclick="selectOptionChip(1, \''+color.slice(0,2)+' '+color.slice(2)+'::0::0::'+(100+i)+'::cpx0::\', this, \'\');return false;"><img alt="'+color+'"><span class="value">'+color+'</span></a>').join('');
const payload=(main,second=main)=>({main_img:main+'#addimg',files:[main+'#addimg',second+'#addimg'],html:[main,second].map((src,i)=>'<img class="product_image_tooltip_image_gio" data-image_no="'+(500+i)+'" data-is_product_cut="" src="'+src+'#addimg">').join('')});
const response=(body,status=200)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status});

test('공식 STYLE·pno·ppno와 정확한 칩 이름/번호로 색상을 연결한다',()=>{
 const source=parseOfficialColorOptions(product,page());
 assert.equal(source.productHash,ppno);assert.equal(source.sourceProductHash,pno);assert.equal(source.style,product.style);
 assert.deepEqual(source.options[0],{color:'01그레이',label:'01그레이',optionNo:'1',optionId:'100'});
 assert.equal(source.options.length,4);assert.deepEqual(source.failures,[]);
 assert.equal(parseOfficialColorOptions(product,page({parent:''})).productHash,pno);
 assert.equal(parseOfficialColorOptions(product,page().replace(/<a class="style_code_gio"[^>]*><\/a>/,'' )).style,product.style,'명시 STYLE 문구도 사용할 수 있다');
});

test('다른 품번·상품번호·비공식 URL과 손상된 부모 번호를 거절한다',()=>{
 for(const html of [page({style:'05116955'}),page({hash:'C'.repeat(32)}),page({parent:'not-a-product'}),page().replace('name="prdFrm"','name="other"')])assert.throws(()=>parseOfficialColorOptions(product,html),{code:'OFFICIAL_COLOR_SOURCE_MISMATCH'});
 for(const sourceUrl of ['http://www.giordano.co.kr/shop/detail.php?pno='+pno,'https://evil.example/shop/detail.php?pno='+pno,'https://www.giordano.co.kr:8080/shop/detail.php?pno='+pno,'https://user@www.giordano.co.kr/shop/detail.php?pno='+pno])assert.throws(()=>parseOfficialColorOptions({...product,sourceUrl},page()));
 assert.throws(()=>parseOfficialColorOptions(product,page().replace('05356946','05356947')));
});

test('색상 번호가 같아도 이름이나 칩 data가 다르면 해당 색상만 거절한다',()=>{
 for(const html of [page().replace('01 그레이::','01 실버::'),page().replace('data="100"','data="999"'),page().replace('<span class="value">01그레이','<span class="value">01실버')]){
  const source=parseOfficialColorOptions(product,html);assert.equal(source.options.length,3);assert.equal(source.failures[0].color,'01그레이');
 }
 const duplicate=page()+'<a class="gio_opt_img_list" data="999" onclick="selectOptionChip(1, \'01그레이::0::0::999::cpx0::\', this, \'\');return false;"><img alt="01그레이"></a>';
 assert.equal(parseOfficialColorOptions(product,duplicate).options.some(option=>option.color==='01그레이'),false);
});

test('공식 응답의 main이 해당 갤러리 원본 목록에 있어야 하며 구도는 추정하지 않는다',()=>{
 const parsed=parseOfficialColorResponse({color:'01그레이',optionId:'100'},payload(url('front'),url('side')));
 assert.equal(parsed.mainImageUrl,url('front'));assert.equal(parsed.images.length,2);assert.equal(parsed.images[0].imageId,'500');assert.equal(parsed.role,undefined);assert.equal(parsed.verified,undefined);
 assert.throws(()=>parseOfficialColorResponse({}, {...payload(url('front')),main_img:url('not-in-gallery')}));
 assert.throws(()=>parseOfficialColorResponse({}, {...payload(url('front')),files:[url('other')]}));
});

test('외부·HTTP·임의 경로·비이미지 원본과 리다이렉트성 URL을 제외한다',()=>{
 for(const unsafe of ['https://evil.example/front.jpg','http://www.giordano.co.kr/_data/attach/front.jpg','https://www.giordano.co.kr/_data/product/front.jpg','https://www.giordano.co.kr/_data/attach/front.html','https://user:pass@www.giordano.co.kr/_data/attach/front.jpg','https://www.giordano.co.kr:8080/_data/attach/front.jpg','https://www.giordano.co.kr/_data/attach/a%2fb.jpg'])assert.throws(()=>parseOfficialColorResponse({},payload(unsafe)));
 assert.throws(()=>parseOfficialColorResponse({},'<html>로그인</html>'));
 assert.throws(()=>parseOfficialColorResponse({}, {...payload(url('front')),html:'<img src="'+url('front')+'">'}));
});

test('상품 페이지 1회와 요청한 미촬영 색상만 조회하고 ppno를 사용한다',async()=>{
 const requests=[];
 const fetchImpl=async(address,options)=>{requests.push({address,options});const request=new URL(address);if(request.pathname==='/shop/detail.php')return response(page());return response(payload(url(request.searchParams.get('ino'))));};
 const result=await collectOfficialColorSources(product,{colors:['01그레이','04블랙'],fetchImpl});
 assert.equal(requests.length,3);assert.deepEqual(result.colors.map(entry=>entry.color),['01그레이','04블랙']);assert.deepEqual(result.failures,[]);
 for(const entry of result.colors){const request=new URL(entry.requestUrl);assert.equal(request.searchParams.get('hash'),ppno);assert.equal(request.searchParams.get('ino'),entry.optionId);assert.equal(request.searchParams.get('opt_no'),entry.optionNo);assert.equal(request.searchParams.get('exec'),'getAddImgList');assert.ok(entry.images.some(image=>image.url===entry.mainImageUrl));}
 for(const request of requests){assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Referer,product.sourceUrl);}
});

test('HTML 주입은 추가 페이지 조회 없이 동시 2개까지 처리하며 실패색상만 보류한다',async()=>{
 let active=0,peak=0,calls=0;
 const result=await collectOfficialColorSources(product,{html:page(),fetchImpl:async address=>{
  calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,10));active--;
  const id=new URL(address).searchParams.get('ino');return id==='101'?response('unavailable',503):response(payload(url(id)));
 }});
 assert.equal(calls,4);assert.equal(peak,2);assert.deepEqual(result.colors.map(entry=>entry.color),['01그레이','03초콜렛','04블랙']);assert.equal(result.failures[0].color,'02라떼');assert.match(result.failures[0].message,/503/);
});

test('다른 색상에서 같은 API main이 반환되면 양쪽 모두 사용하지 않는다',async()=>{
 const result=await collectOfficialColorSources(product,{html:page(),colors:['01그레이','04블랙'],fetchImpl:async()=>response(payload(url('shared')))});
 assert.equal(result.colors.length,0);assert.deepEqual(result.failures.map(entry=>entry.color),['01그레이','04블랙']);assert.match(result.failures[0].message,/같은 공식 대표사진/);
});

test('색상 누락과 잘못된 JSON은 부분 실패로 남기고 다른 색상은 유지한다',async()=>{
 const html=page({chips:['01그레이','02라떼','03초콜렛']});
 const result=await collectOfficialColorSources(product,{html,fetchImpl:async address=>new URL(address).searchParams.get('ino')==='101'?response('<html>오류</html>'):response(payload(url(new URL(address).searchParams.get('ino'))))});
 assert.deepEqual(result.colors.map(entry=>entry.color),['01그레이','03초콜렛']);assert.deepEqual(result.failures.map(entry=>entry.color),['02라떼','04블랙']);
});

test('품번 불일치와 요청 외 색상은 API 호출 전에 중단한다',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not fetch');};
 await assert.rejects(collectOfficialColorSources(product,{html:page({style:'05116955'}),fetchImpl}),/품번/);
 await assert.rejects(collectOfficialColorSources(product,{html:page(),colors:['99없는색'],fetchImpl}),/없는 색상/);assert.equal(calls,0);
});

test('조회 제한 시간은 실패색상을 명시하며 응답/본문 읽기까지 취소한다',async()=>{
 const fetchImpl=async()=>new Promise(()=>{});
 const result=await collectOfficialColorSources(product,{html:page(),colors:['01그레이'],fetchImpl,timeoutMs:15});assert.equal(result.colors.length,0);assert.match(result.failures[0].message,/시간이 초과/);
 const bodyTimeout=await collectOfficialColorSources(product,{html:page(),colors:['01그레이'],timeoutMs:15,fetchImpl:async()=>({ok:true,text:()=>new Promise(()=>{})})});assert.match(bodyTimeout.failures[0].message,/시간이 초과/);
});

test('외부 취소는 부분 성공으로 숨기지 않고 전체 요청을 종료한다',async()=>{
 const controller=new AbortController();const promise=collectOfficialColorSources(product,{html:page(),signal:controller.signal,fetchImpl:async()=>new Promise(()=>{})});
 controller.abort(new Error('상품이 변경되었습니다.'));await assert.rejects(promise,/상품이 변경/);
 let called=false;await assert.rejects(collectOfficialColorSources(product,{html:page(),signal:controller.signal,fetchImpl:async()=>{called=true;}}),/상품이 변경/);assert.equal(called,false);
});
