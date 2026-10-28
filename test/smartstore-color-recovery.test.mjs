import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {prepareSmartstoreAuto} from '../smartstore-auto-prepare.mjs';
import {buildSmartstoreDetail} from '../smartstore-detail.mjs';
import {savePhotoMappings,readPhotoMappings} from '../smartstore-photo-mapping-cache.mjs';

async function fixture(run){
 const root=await mkdtemp(path.join(os.tmpdir(),'color-recovery-'));
 try{
  const dataRoot=path.join(root,'data'),folder=path.join(root,'collected'),photos=path.join(root,'photos');
  await mkdir(folder);await mkdir(photos);
  const product={style:'326931',name:'여성 경량 하프집업 326931',rawName:'여성 경량 하프집업',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=recovery',colors:['01그레이','02브라운'],sizes:['S'],images:{}};
  await writeFile(path.join(folder,'smartstore-official.html'),'<body>STYLE. 05326931<div class="prd_detail_content_gio">가벼운 하프집업 상품입니다.</div></body>');
  const bytes=await Promise.all(Array.from({length:6},(_,i)=>sharp({create:{width:80,height:100,channels:3,background:{r:30+i*30,g:100,b:150}}}).jpeg().toBuffer()));
  const hashes=bytes.map(b=>createHash('sha256').update(b).digest('hex'));
  const options={dataRoot,photoRoots:[photos],recognizePhoto:async()=>'',fetchImpl:()=>assert.fail('외부 호출 불필요')};
  await run({root,dataRoot,folder,photos,product,bytes,hashes,options});
 }finally{await rm(root,{recursive:true,force:true});}
}

test('색상 폴더의 5장 이상 사진을 두 템플릿에 모두 유지하고 삭제한 사진은 되살리지 않는다',()=>fixture(async({dataRoot,folder,photos,product,bytes,options})=>{
 const colorRoot=path.join(photos,'01그레이');await mkdir(colorRoot);
 for(let i=0;i<bytes.length;i++)await writeFile(path.join(colorRoot,i===0?'1.jpg':'photo-'+i+'.jpg'),bytes[i]);
 const prepared=await prepareSmartstoreAuto(product,folder,options);
 assert.equal(prepared.smartstoreDetail.pendingPhotoCount,0);
 assert.equal(prepared.smartstoreDetail.colorImages['01그레이'].length,6);
 for(const detailTemplate of [1,2]){const html=buildSmartstoreDetail({...prepared,detailTemplate}).html;for(const src of prepared.smartstoreDetail.colorImages['01그레이'])assert(html.includes(src));}
 // Lose the editable draft's mapping. The separate source/hash ledger restores it.
 const f=path.join(dataRoot,'smartstore-details',product.style,'draft.json'),d=JSON.parse(await readFile(f));
 d.photos=[];for(const r of d.photoMapping.files){r.color='';r.role='provided';}await writeFile(f,JSON.stringify(d));
 await rm(path.join(colorRoot,'photo-5.jpg'));
 const again=await prepareSmartstoreAuto(product,folder,options);
 assert.equal(again.smartstoreDetail.pendingPhotoCount,0);assert.equal(again.smartstoreDetail.colorImages['01그레이'].length,5);
}));

test('가져오기 색상과 해시로 빈 매핑을 복구하며 파일명이나 각도를 추정하지 않는다',()=>fixture(async({dataRoot,folder,photos,product,bytes,hashes,options})=>{
 for(let i=0;i<2;i++)await writeFile(path.join(photos,i===0?'1.jpg':'20261028.jpg'),bytes[i]);
 const root=path.join(dataRoot,'smartstore-details',product.style);await mkdir(root,{recursive:true});
 await writeFile(path.join(root,'draft.json'),JSON.stringify({style:product.style,sourceUrl:product.sourceUrl,photos:[],importedColorPhotos:[{color:'02브라운',hashes:hashes.slice(0,2)}],photoMapping:{files:hashes.slice(0,2).map(hash=>({hash,color:'',role:'provided'}))}}));
 const p=await prepareSmartstoreAuto(product,folder,options);
 assert.equal(p.smartstoreDetail.pendingPhotoCount,0);assert.equal(p.smartstoreDetail.colorImages['02브라운'].length,2);
 const d=JSON.parse(await readFile(path.join(root,'draft.json')));assert(d.photoMapping.files.every(r=>r.color==='02브라운'&&r.role==='detail'));
}));

test('색상 연결 캐시는 다른 공식 출처·다른 품번·없는 색상에 재사용하지 않는다',()=>fixture(async({dataRoot,product,hashes})=>{
 await savePhotoMappings(dataRoot,product,[{hash:hashes[0],color:'01그레이',role:'front'}]);
 await savePhotoMappings(dataRoot,product,[{hash:hashes[0],color:'',role:'provided'}]);
 assert.equal((await readPhotoMappings(dataRoot,product)).length,1);
 for(const p of [{...product,sourceUrl:product.sourceUrl+'changed'},{...product,style:'326932'},{...product,colors:['02브라운']}])assert.deepEqual(await readPhotoMappings(dataRoot,p),[]);
}));
