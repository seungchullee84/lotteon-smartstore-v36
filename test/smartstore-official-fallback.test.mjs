import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';import path from'node:path';import os from'node:os';import sharp from'sharp';import{createHash}from'node:crypto';import{prepareSmartstoreDetail}from'../smartstore-detail-files.mjs';import{buildSmartstoreDetail}from'../smartstore-detail.mjs';
test('공식 보완 정면+추가 컷은 팔레트에 포함하고 판매 옵션과 매장 촬영 표시는 구분한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'official-fallback-'));try{
 const dataRoot=path.join(root,'data'),folder=path.join(root,'collected'),draftRoot=path.join(dataRoot,'smartstore-details','026982');for(const d of[folder,draftRoot])await mkdir(d,{recursive:true});
 const bytes=await sharp({create:{width:180,height:240,channels:3,background:'#888'}}).jpeg().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');for(const f of[path.join(folder,'detail.jpg'),path.join(draftRoot,'front.jpg'),path.join(draftRoot,'back.jpg')])await writeFile(f,bytes);
 const p={style:'026982',sourceUrl:'https://www.giordano.co.kr/test',gender:'남성',name:'후드티',colors:['01네이비','03라이트헤더그레이','04버건디'],sizes:['L'],images:{detail:'https://www.giordano.co.kr/detail.jpg'}};
 const draft={style:p.style,sourceUrl:p.sourceUrl,photos:p.colors.map(color=>({color,files:['front.jpg']})),officialPhotos:[{color:'02미드헤더그레이',sourceUrl:p.sourceUrl,sourceImageUrl:p.images.detail,sourceImageHash:hash,files:[{file:'front.jpg',role:'front',sha256:hash},{file:'back.jpg',role:'back',sha256:hash}]}]};
 await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify(draft));const prepared=await prepareSmartstoreDetail(p,folder,{dataRoot});assert.equal(prepared.smartstoreDetail.displayColors.length,4);assert.equal(prepared.colors.length,3);const html=buildSmartstoreDetail(prepared).html;assert.match(html,/취향에 맞춰, 4가지/);assert.match(html,/지오다노 공식 상품 사진/);assert.match(html,/매장 마네킹 실제 착용사진/);
 await writeFile(path.join(folder,'detail.jpg'),Buffer.from('changed'));await assert.rejects(prepareSmartstoreDetail(p,folder,{dataRoot}),/출처/);
 }finally{await rm(root,{recursive:true,force:true});}
});
