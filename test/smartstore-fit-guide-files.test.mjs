import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {prepareFitGuide} from '../smartstore-fit-guide-files.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const failure={code:'FIT_GUIDE_REVERIFY'};
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-fit-guide-'));
 t.after(async()=>{const resolved=path.resolve(root),temporary=path.resolve(os.tmpdir());assert(resolved.startsWith(temporary+path.sep)&&path.basename(resolved).startsWith('smartstore-fit-guide-'));await rm(resolved,{recursive:true,force:true});});
 const dataRoot=path.join(root,'data'),folder=path.join(root,'collection'),pack=path.join(dataRoot,'smartstore-details','116955','fit-guide');
 await mkdir(folder,{recursive:true});await mkdir(pack,{recursive:true});
 const product={style:'116955',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=current',detailTemplate:1,smartstoreDetail:{photoCount:4,heroImage:'/unchanged',colorImages:{gray:['/selected']}}};
 const manifest={version:1,style:product.style,sourceUrl:product.sourceUrl,detailTemplate:1,anchor:{},products:[],manager:{storeName:'동탄 롯데 지오다노',source:'user',rows:[{waist:'28',size:'S'},{waist:'29~31',size:'M'},{waist:'32~33',size:'L'},{waist:'34~36',size:'XL'}]}};
 for(const [index,style] of ['116955','116956','116958'].entries()){
  const item={style,fit:['스트레이트','조거','와이드'][index],color:'미드헤더그레이',description:'공식 자료로 확인한 핏이에요.',measurements:[74.9,111.8,66.4,47,34,74.3,105.4],official:{url:index===0?product.sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+style}};
  await mkdir(path.join(pack,style));
  for(const role of ['detail','size','info']){const bytes=await sharp({create:{width:10,height:12,channels:3,background:{r:40+index*50,g:80,b:120}}}).jpeg().toBuffer();const file=style+'/'+role+'.jpg';await writeFile(path.join(pack,file),bytes);item.official[role]={file,sha256:hash(bytes)};if(index===0&&role!=='info'){await writeFile(path.join(folder,role+'.jpg'),bytes);manifest.anchor[role+'Sha256']=hash(bytes);}}
  for(const [view,role] of ['front','side'].entries()){const bytes=await sharp({create:{width:750,height:1000,channels:3,background:{r:60+index*40,g:80+view*20,b:100}}}).jpeg({quality:90,mozjpeg:true}).toBuffer();const file=style+'/'+role+'.jpg';await writeFile(path.join(pack,file),bytes);item[role]={file,sha256:hash(bytes)};}
  manifest.products.push(item);
 }
 const save=()=>writeFile(path.join(pack,'manifest.json'),JSON.stringify(manifest));await save();
 return {root,dataRoot,folder,pack,product,manifest,save};
}
async function noServingCopies(f){assert.equal((await readdir(f.folder)).filter(name=>name.startsWith('smartstore-photo-')).length,0);}

test('자료가 없는 상품과 다른 템플릿은 기존 사진 선택을 바꾸지 않는다',async t=>{
 const f=await fixture(t),before=structuredClone(f.product);
 for(const style of ['12345','123456','12345678'])assert.equal(await prepareFitGuide({...f.product,style},f.folder,{dataRoot:f.dataRoot}),null);
 await assert.rejects(prepareFitGuide({...f.product,style:'../116955'},f.folder,{dataRoot:f.dataRoot}),failure);
 assert.equal(await prepareFitGuide({...f.product,detailTemplate:2},f.folder,{dataRoot:f.dataRoot}),null);
 f.manifest.detailTemplate=2;await f.save();
 assert.equal(await prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),null);
 assert.deepEqual(f.product,before);await noServingCopies(f);
});

test('사용자가 선택한 템플릿2와 자료의 템플릿이 같으면 그 선택을 유지한다',async t=>{
 const f=await fixture(t);f.product.detailTemplate=2;f.manifest.detailTemplate=2;await f.save();const before=structuredClone(f.product);
 const result=await prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot});assert.equal(result.detailTemplate,2);assert.equal(result.products.length,3);assert.deepEqual(f.product,before);
});

test('세 상품 사진을 원바이트로 연결하고 대표·추가 사진 수는 유지한다',async t=>{
 const f=await fixture(t),before=structuredClone(f.product);f.manifest.products[1].purchaseUrl='https://example.com/not-allowed';await f.save();
 const result=await prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot});
 assert.deepEqual(result.manager,f.manifest.manager);assert.deepEqual(result.products.map(p=>p.style),['116955','116956','116958']);assert.equal(result.detailTemplate,1);assert.equal(Object.keys(result.photoFiles).length,6);
 for(let index=0;index<3;index++)for(const role of ['front','side']){const src=result.products[index][role],name=result.photoFiles[src];assert.equal(src,'/smartstore-photo/'+f.manifest.products[index][role].sha256.slice(0,24));assert.deepEqual(await readFile(path.join(f.folder,name)),await readFile(path.join(f.pack,f.manifest.products[index][role].file)));}
 assert.equal('photoCount' in result,false);assert.equal('heroImage' in result,false);assert.equal('purchaseUrl' in result.products[1],false);assert.deepEqual(f.product,before);
});

test('품번·출처·중복 품번이 맞지 않으면 복사 전에 재확인을 요구한다',async t=>{
 const f=await fixture(t),original=structuredClone(f.manifest);
 for(const mutate of [m=>m.style='116958',m=>m.sourceUrl+='-changed',m=>m.products[0].official.url+='-changed',m=>m.products[2].style='116956',m=>m.products[0].style='123456']){
  Object.assign(f.manifest,structuredClone(original));mutate(f.manifest);await f.save();await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);
 }
});

test('현재 상세 또는 사이즈 원본이 바뀌면 오래된 가이드를 사용하지 않는다',async t=>{
 const f=await fixture(t);
 for(const role of ['detail','size']){const file=path.join(f.folder,role+'.jpg'),original=await readFile(file);await writeFile(file,'changed current source');await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);await writeFile(file,original);}
});

test('해시가 다른 공식 자료와 착용사진은 연결하지 않는다',async t=>{
 const f=await fixture(t);
 for(const asset of [f.manifest.products[1].official.info,f.manifest.products[2].side]){const file=path.join(f.pack,asset.file),original=await readFile(file);await writeFile(file,'tampered');await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);await writeFile(file,original);}
});

test('해시를 갱신해도 잘못된 사진 규격·포맷·깨진 JPEG를 허용하지 않는다',async t=>{
 const f=await fixture(t),asset=f.manifest.products[1].front,file=path.join(f.pack,asset.file),original=await readFile(file);
 const wrongSize=await sharp({create:{width:749,height:1000,channels:3,background:'#ddd'}}).jpeg().toBuffer();
 const wrongFormat=await sharp({create:{width:750,height:1000,channels:3,background:'#ddd'}}).png().toBuffer();
 for(const bytes of [wrongSize,wrongFormat,original.subarray(0,Math.floor(original.length/2))]){await writeFile(file,bytes);asset.sha256=hash(bytes);await f.save();await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);}
});

test('폴더는 있는데 manifest나 필수 파일이 없으면 조용히 생략하지 않는다',async t=>{
 const f=await fixture(t);await rm(path.join(f.pack,'manifest.json'));await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);
 await f.save();await rm(path.join(f.pack,f.manifest.products[1].side.file));await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);
});

test('상대경로 탈출과 폴더 밖으로 향한 실제 파일 연결을 차단한다',async t=>{
 const f=await fixture(t),asset=f.manifest.products[1].official.detail,original=structuredClone(asset);
 asset.file='../outside.jpg';await f.save();await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);
 const outside=path.join(f.root,'outside');await mkdir(outside);await writeFile(path.join(outside,'detail.jpg'),await readFile(path.join(f.pack,original.file)));await symlink(outside,path.join(f.pack,'escape'),process.platform==='win32'?'junction':'dir');
 asset.file='escape/detail.jpg';await f.save();await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);
});

test('문구 HTML과 비정상 치수·추천 행을 렌더러로 넘기지 않는다',async t=>{
 const f=await fixture(t),original=structuredClone(f.manifest);
 for(const mutate of [m=>m.products[0].description='<img src=x onerror=alert(1)>',m=>m.products[0].measurements[0]=0,m=>m.products[0].measurements.push(50),m=>m.manager.source='guess',m=>m.manager.rows.pop(),m=>m.manager.rows[1].size='S']){
  Object.assign(f.manifest,structuredClone(original));mutate(f.manifest);await f.save();await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);
 }
});

test('사용자가 확인한 비교 상품 링크만 보존하고 현재 품번에는 링크를 붙이지 않는다',async t=>{
 const f=await fixture(t),wide='https://shopping.naver.com/window-products/department/13857609430',jogger='https://shopping.naver.com/window-products/department/13857522426';
 f.manifest.products[0].purchaseLink={url:'https://smartstore.naver.com/store/products/116955',style:'116955',source:'user'};
 f.manifest.products[1].purchaseLink={url:jogger+'?NaPm=ct%3Dtest',style:'116956',source:'user'};
 f.manifest.products[2].purchaseLink={url:wide,style:'116958',source:'user'};await f.save();
 const result=await prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot});
 assert.equal('purchaseLink' in result.products[0],false);
 assert.deepEqual(result.products[1].purchaseLink,{url:jogger,style:'116956',source:'user'});
 assert.deepEqual(result.products[2].purchaseLink,{url:wide,style:'116958',source:'user'});
 assert.equal(f.manifest.products[1].purchaseLink.url,jogger+'?NaPm=ct%3Dtest');
});

test('잘못된 구매주소·확인되지 않은 링크·다른 품번 링크는 복사 전에 중단한다',async t=>{
 const f=await fixture(t);
 for(const purchaseLink of [null,{url:'https://example.com/products/123',style:'116956',source:'user'},{url:'https://shopping.naver.com/window-products/department/123',style:'116958',source:'user'},{url:'https://shopping.naver.com/window-products/department/123',style:'116956',source:'guessed'},{url:'https://shopping.naver.com/window-products/department/123#buy',style:'116956',source:'user'}]){
  f.manifest.products[1].purchaseLink=purchaseLink;await f.save();await assert.rejects(prepareFitGuide(f.product,f.folder,{dataRoot:f.dataRoot}),failure);await noServingCopies(f);
 }
});
