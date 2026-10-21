import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import {chromium} from 'playwright';

export async function collectGoodwear(url,folder,log,cancelled,signal){
 const code=new URL(url).pathname.split('/')[2];
 const request=async address=>{if(cancelled())throw Error('사용자가 중단했습니다.');const r=await fetch(address,{signal:signal||AbortSignal.timeout(30000)});if(!r.ok)throw Error('굿웨어몰 요청 실패: '+r.status);return r;};
 await mkdir(folder,{recursive:true});log('굿웨어몰 공식 상품정보 수집');
 const data=await(await request('https://www.goodwearmall.com/product/api/view.json?godNo='+encodeURIComponent(code))).json();
 const g=data.goods;if(data.result!=='Y'||g?.god?.godNo!==code)throw Error('굿웨어몰 상품정보를 확인하지 못했습니다.');
 const title=g.god.godNm,gender=/여성/.test(title)?'여성':/남성/.test(title)?'남성':'';
 const notices=g.godNtfcList.flatMap(x=>x.godNtfcList||[]),notice=key=>notices.find(x=>x.godNtfcIemCd===key)?.ntfcCont||'';
 const imageUrl=value=>{const u=new URL(value,'https://img.goodwearmall.com');if(u.protocol!=='https:'||u.hostname!=='img.goodwearmall.com')throw Error('굿웨어몰 이미지 출처 확인 필요');return u.href;};
 const main=imageUrl(g.defaultImage),extras=g.godImgList.filter(x=>x.imgUseYn==='Y'&&imageUrl(x.imgUrl)!==main).slice(0,2);
 const original=g.godDetailList.find(x=>x.godDetailTpCd==='AFF_MALL_ONLY')?.godDetailCont||'';
 const detailSources=cheerio.load(original)('img').map((_,e)=>e.attribs.src).get();
 if(detailSources.length!==1)throw Error('상세 원본이 없거나 여러 장입니다. 원본 구성 확인 후 연결해야 합니다.');
 const images={main,detail:imageUrl(detailSources[0]),...Object.fromEntries(extras.map((x,i)=>['extra'+(i+1),imageUrl(x.imgUrl)]))};
 for(const [key,src] of Object.entries(images)){const bytes=Buffer.from(await(await request(src)).arrayBuffer());await sharp(bytes).metadata();await writeFile(path.join(folder,key+'.jpg'),bytes);}
 const plain=s=>cheerio.load('<div>'+String(s)+'</div>')('div').text();
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const noticeHtml='<html lang="ko"><meta charset="utf-8"><style>body{font:18px sans-serif;color:#000;background:white;margin:24px}table{border-collapse:collapse;width:850px}td,th{border:1px solid #555;padding:14px;text-align:left}th{width:180px}</style><h2>'+esc(title)+'</h2><table>'+notices.map(x=>'<tr><th>'+esc(x.cdNm)+'</th><td>'+esc(plain(x.ntfcCont))+'</td></tr>').join('')+'</table></html>';
 await writeFile(path.join(folder,'공식몰고시.html'),noticeHtml);
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:900,height:900}});await page.setContent(noticeHtml);await page.screenshot({path:path.join(folder,'info.jpg'),type:'jpeg',fullPage:true});}finally{await browser.close();}
 const brand=g.sysBrnd.brndKorFlterNm||g.sysBrnd.brndNm;
 const yearMonth=notice('NTFC_MNFCTUR_YM').match(/^(20\d{2})(\d{2})$/);
 const product={style:code,sourceBrand:brand,sourceSite:'goodwear',sourceUrl:url,originalDetailUrl:images.detail,rawName:title,gender,sourceCategory:[gender==='여성'?'WOMEN':'MEN',/점퍼/.test(title)?'OUTER':'',title].filter(Boolean),name:(gender+' '+title.replace(/^(여성|남성)\)\s*/,'')+' '+code).trim(),consumerPrice:g.god.cvrPrc,colors:['01'+g.god.colorNm.replace(/\s/g,'')],sizes:[...new Set(g.godItmExList.map(x=>x.optValNm||x.itmNm))],material:plain(notice('NTFC_PRD_PCL_MATR')),country:plain(notice('NTFC_MNFCTUR_NATION')),manufactured:yearMonth?yearMonth[1]+'-'+yearMonth[2]:'',washing:(g.godCareInfoList||[]).map(x=>x.careDesc).join(' / ')||plain(notice('NTFC_LNDR_MTHD')),images,category:{commonMiddle:'',commonSmall:'',channelMiddle:'',channelSmall:''},ocrText:notices.map(x=>x.cdNm+': '+plain(x.ntfcCont)).join('\n'),warnings:['보내주신 URL의 '+g.god.colorNm+' 색상 기준입니다. 다른 색상은 합치지 않았습니다.','롯데 브랜드·매장 및 채널 기본값은 별도 확인이 필요합니다.'],fieldStatus:{material:'공식몰 텍스트 원문',washing:'공식몰 세탁 안내 원문'}};
 log('굿웨어몰 원본 상세·상품정보 수집 완료');return product;
}
