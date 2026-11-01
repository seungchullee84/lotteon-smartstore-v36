import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {reusableSmartstoreCollection as resume} from '../smartstore-resume-collection.mjs';
test('resume current collection only with matching identity and existing official source',async()=>{
 const root=await mkdtemp('D:/collection-resume-test-'),folder=path.join(root,'current');
 const product={style:'375908',sourceUrl:'https://www.giordano.co.kr/shop/view.php?index_no=123',images:{detail:'official'},colors:['black']};
 const options={dataRoot:root};
 try{
  await mkdir(folder);assert.equal(await resume({style:product.style},product,folder,options),null);
  await writeFile(path.join(folder,'smartstore-official.html'),'official');assert.equal(await resume({style:product.style},product,folder,options),null);
  await writeFile(path.join(folder,'detail.jpg'),'source');
  const reused=await resume({style:product.style},product,folder,options);assert.equal(reused.folder,folder);assert.deepEqual(reused.product,product);assert.notEqual(reused.product,product);
  assert.equal(await resume({style:'116914'},product,folder,options),null);
  assert.equal(await resume({url:product.sourceUrl+'4'},product,folder,options),null);
  assert.equal(await resume({style:product.style},{...product,photoSelectionPending:true},folder,options),null);
  assert.equal(await resume({style:product.style},product,folder,{dataRoot:folder}),null);
 }finally{await rm(root,{recursive:true,force:true});}
});
