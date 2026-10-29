import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {extractEmbeddedNotice} from '../embedded-notice.mjs';
import {parseProduct} from '../product.mjs';
test('공식 페이지의 같은 품번 숫자 접미 상세이미지를 인식한다',()=>{const p=parseProduct('<title>남성 푸퍼</title><img src="https://www.giordano.co.kr/_gio_on/2026/01076932_1.jpg">','https://www.giordano.co.kr/shop/detail.php?pno=current','076932');assert.equal(p.images.detail,'https://www.giordano.co.kr/_gio_on/2026/01076932_1.jpg');});

test('상세 원본 하단의 현재 품번·소재·제조국·제조연월 확인 후 정보고시만 추출한다',async()=>{
 const bytes=await sharp({create:{width:200,height:1200,channels:3,background:'#fff'}}).png().toBuffer();
 const product={style:'076921',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=current',images:{detail:'https://www.giordano.co.kr/_gio_on/2026/01076921_.jpg'}};
 const result={text:'INFORMATION 스타일 01076921 제품소재 나일론 제조국 베트남 제조연월 2026.08',tsv:'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t400\t100\t20\t99\tINFORMATION'};
 const recovered=await extractEmbeddedNotice(product,bytes,{recognize:async()=>result});
 assert.equal(recovered.source.crop.top,792);assert.equal((await sharp(recovered.bytes).metadata()).height,408);assert.equal(recovered.source.style,'076921');
 await assert.rejects(()=>extractEmbeddedNotice(product,bytes,{recognize:async()=>({...result,text:result.text.replace('01076921','01076922')})}),/현재 품번/);
 await assert.rejects(()=>extractEmbeddedNotice(product,bytes,{recognize:async()=>({text:'INFORMATION 076921',tsv:result.tsv})}),/정보고시 표/);
});

test('밑줄로 끝나는 공식 상세·사이즈 파일을 인식하며 고시가 없으면 상세 원본 대비책을 허용한다',()=>{
 const html='<title>패딩</title><img src="/_data/attach/main.jpg"><img src="/_gio_on/2026/01076921_.jpg"><img src="/_gio_on/2026/01076921size_.jpg">';
 const product=parseProduct(html,'https://www.giordano.co.kr/shop/detail.php?pno=current','076921');
 assert(product.images.detail.endsWith('01076921_.jpg'));assert(product.images.size.endsWith('01076921size_.jpg'));assert.equal(product.images.info,undefined);
});
