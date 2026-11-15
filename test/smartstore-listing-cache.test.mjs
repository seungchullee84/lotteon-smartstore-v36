import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createListingDraftReader} from '../smartstore-listing-draft-cache.mjs';
import {listingPreview} from '../smartstore-listing-images.mjs';
import {findPhotos} from '../smartstore-photo-files.mjs';
import {savePhotoFileSelection} from '../smartstore-photo-file-selection.mjs';
import {photoDigest} from '../smartstore-photo-files.mjs';
import {saveMainSelection} from '../smartstore-main-selection.mjs';
import {createHash} from 'node:crypto';
const mainHash=createHash('sha256').update('main').digest('hex');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(),'listing-cache-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const product = {style:'123456',sourceUrl:'https://www.giordano.co.kr/current',colors:['01블랙','02화이트']};
  const folder = path.join(root,'smartstore-details',product.style);
  await fs.mkdir(folder,{recursive:true});
  const photos=path.join(root,'photos');await fs.mkdir(photos);await fs.writeFile(path.join(photos,'1.jpg'),'main');
  await saveMainSelection(product,{name:'1.jpg',bytes:Buffer.from('main')},root);
  return {root,product,file:path.join(folder,'draft.json'),options:{dataRoot:root,photoRoots:[photos]}};
}

function draftFor(product) {
  return {...product,listingImages:{main:{sourceName:'1.jpg',sourceHash:mainHash,color:'01블랙'},extras:[{sourceName:'2.jpg',color:'02화이트',role:'front'}]}};
}

test('concurrent draft reads share the snapshot and listing polls return independent manifests',async t=>{
  const {root,product,file,options} = await fixture(t);
  const draft = {...draftFor(product),photos:Array.from({length:500},(_,i)=>({name:i+'.jpg',hash:'a'.repeat(64)}))};
  await fs.writeFile(file,JSON.stringify(draft));
  let reads = 0;
  const readDraft = createListingDraftReader({read:async(...args)=>{
    reads++;
    return fs.readFile(...args);
  }});
  const snapshots = await Promise.all(Array.from({length:20},()=>readDraft(file)));
  for(let i=0;i<30;i++)assert.equal(await readDraft(file),snapshots[0]);
  assert.equal(reads,1,'50 unchanged polls, including 20 concurrent polls, share one read/parse/hash');
  for(const snapshot of snapshots)assert.equal(snapshot,snapshots[0]);
  const results = await Promise.all(Array.from({length:20},()=>listingPreview(product,options)));
  results[0].main.sourceName='mutated.jpg';
  results[0].extras[0].sourceName='mutated-extra.jpg';
  const next = await listingPreview(product,options);
  assert.equal(next.main.sourceName,'1.jpg');
  assert.equal(next.extras[0].sourceName,'2.jpg');
  assert.equal(next.detailRevision,results[1].detailRevision);
  const noWhite = await listingPreview({...product,colors:['01블랙']},options);
  assert.deepEqual(noWhite.extras,[],'current product colors are evaluated even when draft is cached');
  const differentProduct = {...product,sourceUrl:'https://www.giordano.co.kr/other'};
  assert.equal(await listingPreview(differentProduct,{dataRoot:root,photoRoots:[]}),null);
  const changedImage = {...product,images:{main:'https://www.giordano.co.kr/new.jpg'}};
  const official = await listingPreview(changedImage,options);
  assert.equal(official.extras[0].sourceUrl,changedImage.images.main);
});

test('external draft replacement, deletion, recreation and parse failure invalidate cached data',async t=>{
  const {product,file} = await fixture(t);
  const read = createListingDraftReader();
  const first = draftFor(product);
  await fs.writeFile(file,JSON.stringify(first));
  const before = await read(file);
  await fs.writeFile(file+'.tmp',JSON.stringify({...first,photos:['changed']}));
  await fs.rename(file+'.tmp',file);
  const after = await read(file);
  assert.notEqual(after.detailRevision,before.detailRevision);
  await fs.unlink(file);
  assert.equal(await read(file),null);
  await fs.writeFile(file,'{invalid');
  await assert.rejects(read(file),SyntaxError);
  await fs.writeFile(file,JSON.stringify(first));
  assert.deepEqual((await read(file)).draft,first);
});

test('a slow old read retries against new file identity and cannot replace the new snapshot',async()=>{
  let version = 1;
  let resolveOld;
  let signalStarted;
  const started = new Promise(resolve=>signalStarted=resolve);
  const oldRead = new Promise(resolve=>resolveOld=resolve);
  let reads = 0;
  const reader = createListingDraftReader({
    inspect:async()=>({dev:1n,ino:BigInt(version),size:20n,mtimeNs:1n,ctimeNs:1n}),
    read:async()=>{
      reads++;
      if(version===1){signalStarted();return oldRead;}
      return '{"version":2}';
    }
  });
  const first = reader('draft');
  await started;
  version = 2;
  const newer = await reader('draft');
  resolveOld('{"version":1}');
  assert.equal((await first).draft.version,2);
  assert.equal(await reader('draft'),newer);
  assert.equal(reads,2);
});

test('same-size edits with restored mtime still invalidate through ctime',async()=>{
  let ctimeNs = 1n;
  let text = '{"version":1}';
  const reader = createListingDraftReader({
    inspect:async()=>({dev:1n,ino:1n,size:13n,mtimeNs:1n,ctimeNs}),
    read:async()=>text
  });
  assert.equal((await reader('draft')).draft.version,1);
  ctimeNs = 2n;
  text = '{"version":2}';
  assert.equal((await reader('draft')).draft.version,2);
});

test('pre-draft preview follows explicit selection and excludes unavailable originals',async t=>{
  const {root,product} = await fixture(t);
  const photos = path.join(root,'photos');
  await fs.mkdir(photos,{recursive:true});
  await fs.writeFile(path.join(photos,'1.jpg'),'main');
  await fs.writeFile(path.join(photos,'detail.jpg'),'detail');
  const originalRead = fs.readFile;
  const imageReads = [];
  t.mock.method(fs,'readFile',async(file,...args)=>{
    if(String(file).endsWith('.jpg'))imageReads.push(path.basename(file));
    return originalRead(file,...args);
  });
  syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  const options = {dataRoot:root,photoRoots:[photos]};
  assert.equal((await listingPreview(product,options)).main.sourceName,'1.jpg');
  assert.deepEqual(imageReads,['1.jpg'],'unchanged saved filename only reads the selected original');
  const main = (await findPhotos(product,options)).find(photo=>photo.name==='1.jpg');
  await savePhotoFileSelection(root,product,[{id:main.id,hash:photoDigest(main.bytes),role:'excluded',color:''}]);
  assert.equal(await listingPreview(product,options),null);
  await savePhotoFileSelection(root,product,[]);
  await fs.mkdir(path.join(photos,'nested'));
  await fs.writeFile(path.join(photos,'nested','1번.png'),'another main');
  assert.equal((await listingPreview(product,options)).main.sourceName,'1.jpg','another numbered file does not change the explicit selection');
  await fs.unlink(path.join(photos,'nested','1번.png'));
  assert.equal((await listingPreview(product,options)).main.sourceName,'1.jpg');
  await fs.unlink(path.join(photos,'1.jpg'));
  assert.equal(await listingPreview(product,options),null);
});
