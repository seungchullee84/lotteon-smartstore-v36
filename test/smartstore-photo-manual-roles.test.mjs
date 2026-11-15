import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {assignPhotoRolesByOrder,photoReview,savePhotoReviewDraft,savePhotoReview,validatePhotoReview} from '../smartstore-photo-review.mjs';
import {readPhotoFileSelection,savePhotoFileSelection} from '../smartstore-photo-file-selection.mjs';
import {readPhotoMappings} from '../smartstore-photo-mapping-cache.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'photo-manual-role-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'photos'),dataRoot=path.join(root,'data');await mkdir(folder);
 const product={style:'123465',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=manual-role',colors:['01화이트','02블랙']},options={dataRoot,photoRoots:[folder]},originals=[];
 for(const [index,color] of ['white','gray','black','red'].entries()){const bytes=await sharp({create:{width:80,height:120,channels:3,background:color}}).jpeg().toBuffer();originals.push(bytes);await writeFile(path.join(folder,(index+1)+'.jpg'),bytes);}
 const review=await photoReview(product,options);
 const payload={...review,channel:'smartstore',mainId:review.items[0].id,items:review.items.map((item,index)=>({...item,color:'01화이트',role:index===0?'back':index===2?'front':'detail',roleMode:index===0||index===2?'manual':'order'}))};
 const draftFile=path.join(dataRoot,'smartstore-photo-review-drafts',product.style+'.json'),selectionFile=path.join(dataRoot,'smartstore-details',product.style,'photo-file-selection.json');
 return {root,folder,dataRoot,product,options,originals,review,payload,draftFile,selectionFile};
}

test('manual angles survive ordering while all used photos still count toward the color sequence',()=>{
 const items=[{color:'white',role:'back',roleMode:'manual'},{color:'white',role:'front',roleOverride:true},{color:'white',role:'front',roleMode:'manual'},{color:'white',role:'back',roleMode:'order'},{color:'black',role:'side',roleMode:'manual'},{color:'black',role:'back'}];
 assignPhotoRolesByOrder(items);assert.deepEqual(items.map(item=>item.role),['back','side','front','detail','side','side']);assert.equal(items[0].roleDefaulted,false);assert.equal(items[1].roleMode,'order');
 const moved=[items[3],items[0],items[1],items[2]];assignPhotoRolesByOrder(moved);assert.deepEqual(moved.map(item=>item.role),['front','back','detail','front']);
 moved[1].roleMode='order';assignPhotoRolesByOrder(moved);assert.equal(moved[1].role,'side');
});

test('care labels and excluded photos stay outside the order count in both modes',()=>{
 const items=[{color:'white',role:'care-label',roleMode:'manual'},{color:'white',role:'excluded',roleMode:'manual'},{color:'white',role:'back',roleMode:'manual'},{color:'white',role:'detail'}];
 assignPhotoRolesByOrder(items);assert.deepEqual(items.map(item=>item.role),['care-label','excluded','back','side']);
});

test('new capability and draft save reopen preserve explicit manual angles without applying photos',async t=>{
 const f=await fixture(t);assert.equal(f.review.roleSelectionVersion,2);
 await savePhotoReviewDraft(f.product,f.payload,f.options);const saved=JSON.parse(await readFile(f.draftFile));assert.equal(saved.roleSelectionVersion,2);assert.equal(saved.items[0].roleMode,'manual');
 const reopened=await photoReview(f.product,f.options);assert.deepEqual(reopened.items.map(item=>item.role),['back','side','front','detail']);assert.equal(reopened.items[0].roleMode,'manual');assert.equal(reopened.mainId,f.payload.mainId);
 assert.deepEqual(await readPhotoMappings(f.dataRoot,f.product),[]);assert.deepEqual(await readPhotoFileSelection(f.dataRoot,f.product),[]);
});

test('applied manual angles survive file-selection reopen and inventory changes without changing originals or main',async t=>{
 const f=await fixture(t);await savePhotoReview(f.product,f.payload,f.options);
 const selected=await readPhotoFileSelection(f.dataRoot,f.product);assert.deepEqual(selected.map(item=>item.roleMode),['manual','order','manual','order']);
 assert.equal((await readPhotoMappings(f.dataRoot,f.product)).find(item=>item.hash===f.review.items[0].hash).role,'back');
 await rm(f.draftFile);let reopened=await photoReview(f.product,f.options);assert.deepEqual(reopened.items.map(item=>item.role),['back','side','front','detail']);assert.equal(reopened.mainId,f.payload.mainId);
 await writeFile(path.join(f.folder,'new.jpg'),await sharp({create:{width:80,height:120,channels:3,background:'blue'}}).jpeg().toBuffer());
 reopened=await photoReview(f.product,f.options);assert.equal(reopened.items.find(item=>item.id===f.payload.mainId).role,'back');assert.equal(reopened.mainId,f.payload.mainId);
 for(let index=0;index<f.originals.length;index++)assert.deepEqual(await readFile(path.join(f.folder,(index+1)+'.jpg')),f.originals[index]);
 const changed=await photoReview({...f.product,sourceUrl:f.product.sourceUrl+'-other'},f.options);assert(changed.items.every(item=>item.roleMode==='order'));assert.equal(changed.mainId,null);
});

test('reordering preserves manual modes and explicit return to order persists through save reopen',async t=>{
 const f=await fixture(t);await savePhotoReview(f.product,f.payload,f.options);let review=await photoReview(f.product,f.options);
 const items=[review.items[3],review.items[0],review.items[1],review.items[2]];await savePhotoReview(f.product,{...review,channel:'smartstore',items},f.options);
 review=await photoReview(f.product,f.options);assert.deepEqual(review.items.map(item=>item.role),['front','back','detail','front']);assert.equal(review.mainId,f.payload.mainId);
 review.items[1].roleMode='order';await savePhotoReview(f.product,{...review,channel:'smartstore'},f.options);review=await photoReview(f.product,f.options);assert.equal(review.items[1].role,'side');assert.equal(review.items[1].roleMode,'order');
});

test('legacy roleOverride and old unversioned drafts/file records do not become new manual choices',async t=>{
 const f=await fixture(t);await mkdir(path.dirname(f.draftFile),{recursive:true});
 await writeFile(f.draftFile,JSON.stringify({...f.payload,items:f.payload.items.map(item=>({...item,role:'back',roleOverride:true})),roleSelectionVersion:undefined}));
 let review=await photoReview(f.product,f.options);assert.deepEqual(review.items.map(item=>item.role),['front','side','detail','detail']);assert(review.items.every(item=>item.roleMode==='order'));
 await rm(f.draftFile);await mkdir(path.dirname(f.selectionFile),{recursive:true});
 await writeFile(f.selectionFile,JSON.stringify({version:1,style:f.product.style,sourceUrl:f.product.sourceUrl,items:f.payload.items}));
 review=await photoReview(f.product,f.options);assert.deepEqual(review.items.map(item=>item.role),['front','side','detail','detail']);assert(review.items.every(item=>item.roleMode==='order'));
});

test('manual role validation still enforces source, inventory, supported roles and main selection',async t=>{
 const f=await fixture(t);
 for(const patch of [{roleMode:'other'},{roleMode:'manual',role:''},{roleMode:'manual',role:'unknown'}]){
  const payload={...f.payload,items:f.payload.items.map((item,index)=>index===0?{...item,...patch}:item)};
  await assert.rejects(savePhotoReviewDraft(f.product,payload,f.options));assert.throws(()=>validatePhotoReview(f.review,payload));
 }
 assert.throws(()=>validatePhotoReview(f.review,{...f.payload,sourceUrl:'other'}));assert.throws(()=>validatePhotoReview(f.review,{...f.payload,revision:'old'}));
 assert.throws(()=>validatePhotoReview(f.review,{...f.payload,items:f.payload.items.map((item,index)=>index===0?{...item,role:'excluded'}:item)}),{code:'MAIN_PHOTO_SELECTION_REQUIRED'});
 await assert.rejects(savePhotoFileSelection(f.dataRoot,f.product,f.payload.items.map((item,index)=>index===0?{...item,roleMode:'invalid'}:item)));
 await writeFile(path.join(f.folder,'1.jpg'),await sharp({create:{width:80,height:120,channels:3,background:'green'}}).jpeg().toBuffer());await assert.rejects(savePhotoReview(f.product,f.payload,f.options),/변경/);
});
