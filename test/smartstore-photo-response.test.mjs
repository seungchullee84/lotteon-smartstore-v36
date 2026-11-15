import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {readSmartstorePhoto} from '../smartstore-photo-response.mjs';

const id='a'.repeat(24),key='/smartstore-photo/'+id;
async function fixture(run){
 const root=await mkdtemp(path.join(os.tmpdir(),'smartstore-photo-response-'));
 try{await run(root);}finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(root,{recursive:true,force:true});}
}
test('기존 JPG와 명시된 PNG·WebP 매핑은 원본 바이트와 정확한 MIME을 반환한다',async()=>fixture(async root=>{
 for(const [extension,mime] of [['jpg','image/jpeg'],['png','image/png'],['webp','image/webp']]){
  const file='smartstore-photo-'+id+'.'+extension,bytes=Buffer.from('original-'+extension);await writeFile(path.join(root,file),bytes);
  const result=await readSmartstorePhoto(root,id,{[key]:file});assert.equal(result.mime,mime);assert.deepEqual(result.bytes,bytes);
 }
}));
test('새 미리보기 PNG가 state 매핑에 없어도 JPG를 찾지 못한 뒤 PNG 원본을 읽는다',async()=>fixture(async root=>{
 const bytes=Buffer.from('new preview png');await writeFile(path.join(root,'smartstore-photo-'+id+'.png'),bytes);
 const result=await readSmartstorePhoto(root,id,{});assert.equal(result.mime,'image/png');assert.deepEqual(result.bytes,bytes);
}));
test('매핑 없는 JPG·WebP도 지원하며 파일 부재는 응답을 쓰지 않고 null을 반환한다',async()=>fixture(async root=>{
 assert.equal(await readSmartstorePhoto(root,id),null);
 for(const [extension,mime] of [['jpg','image/jpeg'],['webp','image/webp']]){
  const current=extension==='jpg'?id:'b'.repeat(24);await writeFile(path.join(root,'smartstore-photo-'+current+'.'+extension),extension);
  assert.equal((await readSmartstorePhoto(root,current)).mime,mime);
 }
}));
test('명시된 파일이 없을 때 임의의 다른 확장자 파일로 바꾸지 않는다',async()=>fixture(async root=>{
 await writeFile(path.join(root,'smartstore-photo-'+id+'.png'),'unmapped');
 assert.equal(await readSmartstorePhoto(root,id,{[key]:'smartstore-photo-'+id+'.jpg'}),null);
}));
test('잘못된 ID·다른사진·경로탈출·확장자·디렉터리 매핑을 거절한다',async()=>fixture(async root=>{
 for(const bad of ['../secret','a'.repeat(23),'A'.repeat(24),id+'.png'])await assert.rejects(readSmartstorePhoto(root,bad),{code:'SMARTSTORE_PHOTO_INVALID'});
 for(const mapped of ['../secret.jpg',path.join(root,'secret.jpg'),'smartstore-photo-'+id+'.svg','smartstore-photo-'+'b'.repeat(24)+'.jpg',null])await assert.rejects(readSmartstorePhoto(root,id,{[key]:mapped}),{code:'SMARTSTORE_PHOTO_INVALID'});
 await mkdir(path.join(root,'smartstore-photo-'+id+'.jpg'));await assert.rejects(readSmartstorePhoto(root,id),{code:'SMARTSTORE_PHOTO_INVALID'});
}));
