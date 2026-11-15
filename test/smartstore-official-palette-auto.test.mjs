import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {prepareOfficialPalette} from '../smartstore-official-palette-auto.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'official-palette-auto-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'collected'),dataRoot=path.join(root,'data');await mkdir(folder);
 const pno='b971d32ec0e7e5a8eb59c24038847e05',parent='edf5576f4a0c4d5635b4fa42d2546f9f';
 const product={style:'356946',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno='+pno,colors:['01그레이','02라떼','03초콜렛','04블랙'],sizes:['S','M'],images:{main:'https://www.giordano.co.kr/_data/attach/main.jpg',detail:'https://www.giordano.co.kr/_data/attach/detail.jpg'}};
 const detail=Buffer.from('current original detail'),html='<html>official product fixture</html>';await writeFile(path.join(folder,'detail.jpg'),detail);await writeFile(path.join(folder,'smartstore-official.html'),html);
 const images=new Map([['01그레이',await sharp({create:{width:120,height:160,channels:3,background:'#bcd'}}).png().toBuffer()],['04블랙',await sharp({create:{width:120,height:160,channels:3,background:'#123'}}).jpeg().toBuffer()]]);
 let calls=0,downloads=0;const urlFor=color=>'https://www.giordano.co.kr/_data/attach/'+color.slice(0,2)+(color==='01그레이'?'.png':'.jpg');
 const collectSources=async(p,options)=>{calls++;assert.equal(options.html,html);return {style:p.style,sourceUrl:p.sourceUrl,sourceProductHash:pno,productHash:parent,failures:[],colors:options.colors.map(color=>{const optionId=String(46000+Number(color.slice(0,2))),mainImageUrl=urlFor(color),optionNo='1';return {color,label:color,optionId,optionNo,mainImageUrl,images:[{url:mainImageUrl,imageId:'1',productCut:''}],requestUrl:'https://www.giordano.co.kr/main/exec.php?'+new URLSearchParams({exec_file:'shop/getAjaxData.php',exec:'getAddImgList',hash:parent,opt_no:optionNo,ino:optionId})};})};};
 const fetchImpl=async(url,options)=>{downloads++;assert.equal(options.redirect,'error');assert.equal(options.headers.Referer,product.sourceUrl);const color=product.colors.find(color=>urlFor(color)===url);assert(images.has(color));return new Response(images.get(color),{status:200});};
 const makePrepared=()=>({acceptAllFolderPhotos:true,paletteImages:{'02라떼':'/smartstore-photo/latte','03초콜렛':'/smartstore-photo/chocolate'},paletteSources:{},colorImages:{'02라떼':['/smartstore-photo/latte'],'03초콜렛':['/smartstore-photo/chocolate']},photoFiles:{'/smartstore-photo/latte':'latte.jpg','/smartstore-photo/chocolate':'chocolate.jpg'},heroImage:'/smartstore-photo/latte',photoCount:2});
 const options={folder,dataRoot,collectSources,fetchImpl};
 const manifests=async()=>{const base=path.join(dataRoot,'smartstore-details',product.style,'official-palette-auto');return (await readdir(base)).map(name=>path.join(base,name,'manifest.json'));};
 return {root,folder,dataRoot,product,detail,images,urlFor,collectSources,fetchImpl,makePrepared,options,manifests,get calls(){return calls;},get downloads(){return downloads;}};
}

test('only two missing colors receive one official original each, preserving PNG/JPEG bytes and every store/listing/option field',async t=>{
 const f=await fixture(t),prepared=f.makePrepared(),originalProduct=structuredClone(f.product),store=structuredClone(prepared);
 const result=await prepareOfficialPalette(f.product,prepared,f.options);assert.deepEqual(result,{filled:['01그레이','04블랙'],reused:[],pending:[]});assert.equal(f.calls,1);assert.equal(f.downloads,2);
 for(const color of result.filled){const src=prepared.paletteImages[color],file=prepared.photoFiles[src];assert.deepEqual(await readFile(path.join(f.folder,file)),f.images.get(color));assert.equal(prepared.paletteSources[color],'official');assert.match(file,/^smartstore-photo-[a-f0-9]{24}\.(png|jpg)$/);}
 assert.equal(prepared.photoMimeTypes[prepared.paletteImages['01그레이']],'image/png');assert.equal(prepared.photoMimeTypes[prepared.paletteImages['04블랙']],'image/jpeg');
 for(const key of ['colorImages','heroImage','photoCount'])assert.deepEqual(prepared[key],store[key]);assert.equal(prepared.paletteImages['02라떼'],store.paletteImages['02라떼']);assert.deepEqual(f.product,originalProduct);assert.deepEqual(await readFile(path.join(f.folder,'detail.jpg')),f.detail);
 const cached=f.makePrepared();assert.deepEqual((await prepareOfficialPalette(f.product,cached,f.options)).reused,['01그레이','04블랙']);assert.equal(f.calls,1);assert.equal(f.downloads,2);
});

test('cache is bound to source/detail/colors and checks original hashes before reuse',async t=>{
 const f=await fixture(t);await prepareOfficialPalette(f.product,f.makePrepared(),f.options);
 const [manifest]=await f.manifests(),record=JSON.parse(await readFile(manifest));await writeFile(path.join(path.dirname(manifest),record.entries['01그레이'].file),'changed');
 const result=await prepareOfficialPalette(f.product,f.makePrepared(),f.options);assert.deepEqual(result.filled,['01그레이']);assert.deepEqual(result.reused,['04블랙']);assert.equal(f.downloads,3);
 await writeFile(path.join(f.folder,'detail.jpg'),'new official detail');const newer=await prepareOfficialPalette(f.product,f.makePrepared(),f.options);assert.equal(newer.filled.length,2);assert.equal(newer.reused.length,0);assert.equal(f.downloads,5);
 f.product.colors=['04블랙','01그레이'];assert.equal((await prepareOfficialPalette(f.product,f.makePrepared(),f.options)).filled.length,2);assert.equal(f.downloads,7);
});

test('wrong source, labels, request association, external images and shared color URLs never become palette evidence',async t=>{
 for(const mode of ['style','url','pno','label','option','host','shared'])await t.test(mode,async sub=>{
  const f=await fixture(sub),prepared=f.makePrepared();
  const collectSources=async(...args)=>{const source=await f.collectSources(...args);if(mode==='style')source.style='999999';if(mode==='url')source.sourceUrl+='other';if(mode==='pno')source.sourceProductHash='0'.repeat(32);if(mode==='label')source.colors[0].label='99다른색';if(mode==='option')source.colors[0].requestUrl+='&unused=1',source.colors[0].optionId='999';if(mode==='host')source.colors[0].mainImageUrl='https://other.example/photo.jpg';if(mode==='shared')source.colors[1].mainImageUrl=source.colors[0].mainImageUrl;return source;};
  const result=await prepareOfficialPalette(f.product,prepared,{...f.options,collectSources});assert(result.pending.length>=1);assert.equal(prepared.paletteImages['01그레이'],undefined);assert.equal(prepared.paletteSources['01그레이'],undefined);
  if(['style','url','pno','shared'].includes(mode))assert.equal(f.downloads,0);else assert.equal(f.downloads,1);
 });
});

test('one color failure preserves the successful color and short-lived failures avoid repeated network work',async t=>{
 const f=await fixture(t),fetchImpl=async(url,options)=>url===f.urlFor('01그레이')?new Response('',{status:503}):f.fetchImpl(url,options);
 let prepared=f.makePrepared(),result=await prepareOfficialPalette(f.product,prepared,{...f.options,fetchImpl});assert.deepEqual(result.filled,['04블랙']);assert.equal(result.pending[0].color,'01그레이');assert.match(prepared.palettePendingReasons['01그레이'],/503/);
 const calls=f.calls;prepared=f.makePrepared();result=await prepareOfficialPalette(f.product,prepared,{...f.options,collectSources:()=>assert.fail('cached failure must wait'),fetchImpl:()=>assert.fail('successful image is cached')});assert.deepEqual(result.reused,['04블랙']);assert.equal(f.calls,calls);
 const [manifest]=await f.manifests(),record=JSON.parse(await readFile(manifest));record.failures['01그레이'].at=Date.now()-31000;await writeFile(manifest,JSON.stringify(record));result=await prepareOfficialPalette(f.product,f.makePrepared(),f.options);assert.deepEqual(result.filled,['01그레이']);assert.deepEqual(result.reused,['04블랙']);
});

test('changing current original during download aborts before attaching a stale official image',async t=>{
 const f=await fixture(t),prepared=f.makePrepared(),fetchImpl=async(url,options)=>{const response=await f.fetchImpl(url,options);await writeFile(path.join(f.folder,'detail.jpg'),'changed during download');return response;};
 await assert.rejects(prepareOfficialPalette(f.product,prepared,{...f.options,fetchImpl}),{code:'OFFICIAL_PALETTE_SOURCE_CHANGED'});assert.equal(prepared.paletteImages['01그레이'],undefined);assert.equal(prepared.paletteImages['04블랙'],undefined);
});

test('invalid product identity, missing detail and cancellation do not trigger fallback network requests',async t=>{
 const f=await fixture(t),options={...f.options,fetchImpl:()=>assert.fail('network'),collectSources:()=>assert.fail('source network')};
 assert.equal((await prepareOfficialPalette({...f.product,sourceUrl:'https://www.giordano.co.kr/test'},f.makePrepared(),options)).pending.length,2);
 await rm(path.join(f.folder,'detail.jpg'));assert.equal((await prepareOfficialPalette(f.product,f.makePrepared(),options)).pending.length,2);
 const controller=new AbortController();controller.abort();await assert.rejects(prepareOfficialPalette(f.product,f.makePrepared(),{...options,signal:controller.signal}),{name:'AbortError'});
});

test('concurrent callers serialize the same identity and share verified originals',async t=>{
 const f=await fixture(t);const results=await Promise.all([prepareOfficialPalette(f.product,f.makePrepared(),f.options),prepareOfficialPalette(f.product,f.makePrepared(),f.options)]);assert.equal(f.calls,1);assert.equal(f.downloads,2);assert.equal(results[0].filled.length,2);assert.equal(results[1].reused.length,2);
});

test('different official URLs with identical bytes cannot mark two colors complete, including an already reused cache image',async t=>{
 for(const mode of ['new','cached','existing-official'])await t.test(mode,async sub=>{
  const f=await fixture(sub);let prepared=f.makePrepared();
  if(mode!=='new'){
   await prepareOfficialPalette(f.product,prepared,f.options);const [manifest]=await f.manifests(),record=JSON.parse(await readFile(manifest));delete record.entries['04블랙'];await writeFile(manifest,JSON.stringify(record));
   if(mode==='cached')prepared=f.makePrepared();else {delete prepared.paletteImages['04블랙'];delete prepared.paletteSources['04블랙'];}
  }
  f.images.set('04블랙',f.images.get('01그레이'));
  const result=await prepareOfficialPalette(f.product,prepared,f.options);
  assert.equal(prepared.paletteImages['04블랙'],undefined);assert.match(prepared.palettePendingReasons['04블랙'],/같은 공식 사진 원본/);
  if(mode==='existing-official')assert(prepared.paletteImages['01그레이'],'preserve an official tile that existed before this call');
  else {assert.equal(prepared.paletteImages['01그레이'],undefined);assert.deepEqual(result.filled,[]);assert.deepEqual(result.reused,[]);assert.equal(result.pending.length,2);}
  assert.equal(prepared.paletteImages['02라떼'],'/smartstore-photo/latte');
 });
});
