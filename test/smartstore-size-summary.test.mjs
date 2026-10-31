import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {verifiedSizeSummary} from '../smartstore-size-summary.mjs';
test('실측표는 검증한 품번·공식 URL·원본 해시·사이즈가 모두 일치할 때만 재사용한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'size-summary-')),folder=path.join(root,'product'),draft=path.join(root,'smartstore-details','123456');
 try{await mkdir(folder,{recursive:true});await mkdir(draft,{recursive:true});const bytes=Buffer.from('current official size image');await writeFile(path.join(folder,'size.jpg'),bytes);
 const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/current',sizes:['S','M']},record={version:1,verified:true,style:p.style,sourceUrl:p.sourceUrl,sourceImageHash:createHash('sha256').update(bytes).digest('hex'),unit:'cm',sizes:['S','M'],rows:[{label:'총길이',values:[62.2,63.5]}]};
 const file=path.join(draft,'size-summary.json');await writeFile(file,JSON.stringify(record));assert.deepEqual(await verifiedSizeSummary(p,folder,root),record);
 assert.equal(await verifiedSizeSummary({...p,sourceUrl:p.sourceUrl+'/changed'},folder,root),null);
 assert.equal(await verifiedSizeSummary({...p,sizes:['L']},folder,root),null);
 await writeFile(file,JSON.stringify({...record,rows:[{label:'총길이',values:[-1,63.5]}]}));assert.equal(await verifiedSizeSummary(p,folder,root),null);
 await writeFile(file,JSON.stringify(record));await writeFile(path.join(folder,'size.jpg'),'changed');assert.equal(await verifiedSizeSummary(p,folder,root),null);
 }finally{await rm(root,{recursive:true,force:true});}
});
