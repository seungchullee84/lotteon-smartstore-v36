import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,rename,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {listingPreview,listingManifest,chooseListingPhotos,saveListingSelection} from '../smartstore-listing-images.mjs';
import {saveMainSelection} from '../smartstore-main-selection.mjs';
import {findPhotos} from '../smartstore-photo-files.mjs';
import {photoDigest} from '../smartstore-photo-files.mjs';
import {savePhotoFileSelection} from '../smartstore-photo-file-selection.mjs';

test('preview follows the explicit representative and never falls back to a numbered filename',async t=>{
 const dataRoot=await mkdtemp(path.join(tmpdir(),'explicit-main-preview-'));t.after(()=>rm(dataRoot,{recursive:true,force:true}));
 const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/current',colors:['01블랙']};
 const photos=path.join(dataRoot,'photos');await mkdir(photos);
 await writeFile(path.join(photos,'1.jpg'),'not-selected');await writeFile(path.join(photos,'chosen.jpg'),'selected');
 const options={dataRoot,photoRoots:[photos]};
 assert.equal(await listingPreview(product,options),null,'a numbered filename cannot select a representative');
 let chosen=(await findPhotos(product,options)).find(p=>p.name==='chosen.jpg');
 await saveMainSelection(product,chosen,dataRoot);
 assert.equal((await listingPreview(product,options)).main.sourceName,'chosen.jpg');
 const draftRoot=path.join(dataRoot,'smartstore-details',product.style);
 const listingImages=await saveListingSelection(draftRoot,{main:{...chosen,color:'01블랙',role:'front'},extras:[]});
 await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...product,listingImages}));
 assert.equal((await listingManifest(product,options)).main.sourceName,'chosen.jpg');
 const numbered=(await findPhotos(product,options)).find(p=>p.name==='1.jpg');
 await saveMainSelection(product,numbered,dataRoot);
 assert.equal(await listingManifest(product,options),null,'old draft cannot override a new explicit selection');
 assert.equal((await listingPreview(product,options)).main.sourceName,'1.jpg','numbered filenames remain valid when explicitly selected');
 await unlink(path.join(draftRoot,'main-selection.json'));
 assert.equal(await listingManifest(product,options),null,'legacy draft alone cannot imply an explicit selection');
 await saveMainSelection(product,chosen,dataRoot);
 await unlink(path.join(draftRoot,'draft.json'));
 await rename(path.join(photos,'chosen.jpg'),path.join(photos,'renamed.jpg'));
 assert.equal((await listingPreview(product,options)).main.sourceName,'renamed.jpg');
 await writeFile(path.join(photos,'renamed.jpg'),'changed');
 assert.equal(await listingPreview(product,options),null,'modified selection cannot fall back to 1.jpg');
});

test('listing composition requires an explicit mainSelected flag',()=>{
 const numbered={name:'1.jpg',color:'01블랙',role:'front',bytes:Buffer.from('numbered')};
 const chosen={name:'chosen.jpg',color:'01블랙',role:'front',bytes:Buffer.from('chosen'),mainSelected:true};
 assert.throws(()=>chooseListingPhotos([numbered],{colors:['01블랙']}),/대표사진/);
 assert.equal(chooseListingPhotos([numbered,chosen],{colors:['01블랙']}).main,chosen);
});

test('completed previews revalidate excluded, renamed, changed and deleted main originals',async t=>{
 const dataRoot=await mkdtemp(path.join(tmpdir(),'completed-main-preview-'));t.after(()=>rm(dataRoot,{recursive:true,force:true}));
 const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/current',colors:['01블랙']};
 const photos=path.join(dataRoot,'photos');await mkdir(photos);
 await writeFile(path.join(photos,'1.jpg'),'not-selected');await writeFile(path.join(photos,'chosen.jpg'),'selected');
 const options={dataRoot,photoRoots:[photos]},chosen=(await findPhotos(product,options)).find(p=>p.name==='chosen.jpg');
 await saveMainSelection(product,chosen,dataRoot);
 const draftRoot=path.join(dataRoot,'smartstore-details',product.style),listingImages=await saveListingSelection(draftRoot,{main:{...chosen,color:'01블랙',role:'front'},extras:[]});
 await writeFile(path.join(draftRoot,'draft.json'),JSON.stringify({...product,listingImages}));
 assert.equal((await listingPreview(product,options)).photoReview.status,'ready');
 await savePhotoFileSelection(dataRoot,product,[{id:chosen.id,hash:photoDigest(chosen.bytes),role:'excluded',color:''}]);
 assert.equal(await listingPreview(product,options),null,'a completed draft cannot revive an excluded main');
 await savePhotoFileSelection(dataRoot,product,[]);
 await rename(path.join(photos,'chosen.jpg'),path.join(photos,'renamed.jpg'));
 const renamed=await listingPreview(product,options);assert.equal(renamed.main.sourceName,'renamed.jpg');assert.equal(renamed.photoReview.status,'ready');
 await writeFile(path.join(photos,'renamed.jpg'),'changed');assert.equal(await listingPreview(product,options),null,'changed main cannot be masked by the saved draft');
 await writeFile(path.join(photos,'renamed.jpg'),'selected');assert.equal((await listingPreview(product,options)).main.sourceName,'renamed.jpg');
 await unlink(path.join(photos,'renamed.jpg'));assert.equal(await listingPreview(product,options),null,'deleted main cannot fall back to 1.jpg');
});
