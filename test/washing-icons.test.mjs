import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {iconHash,saveIconMeaning,readIconLibrary,iconWashingResult} from '../washing-icons.mjs';
const sample=shape=>sharp(Buffer.from('<svg width="80" height="80"><rect width="80" height="80" fill="white"/>'+shape+'</svg>')).png().toBuffer();
test('동일 아이콘을 저장 후 다시 읽고 금지 표시 변경은 구별',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'washing-icons-'));const file=path.join(folder,'library.json');
 try{
  const a=await sample('<circle cx="40" cy="40" r="25" stroke="black" stroke-width="3" fill="none"/>');
  const b=await sample('<circle cx="40" cy="40" r="25" stroke="black" stroke-width="3" fill="none"/><path d="M15 15L65 65" stroke="black" stroke-width="3"/>');
  await saveIconMeaning(a,'드라이클리닝',file);
  const db=await readIconLibrary(file);assert.equal(db.entries.length,1);assert.equal(db.entries[0].hash,await iconHash(a));assert.notEqual(await iconHash(a),await iconHash(b));
  await assert.rejects(saveIconMeaning(a,'드라이클리닝 금지',file),/이미 저장한 의미/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('처음 보는 아이콘이 하나라도 있으면 OCR을 임의 대체하지 않음',()=>{
 assert.equal(iconWashingResult([{known:true,meaning:'손세탁'},{known:false,meaning:''}]).complete,false);
 assert.equal(iconWashingResult([]).complete,false);
 assert.equal(iconWashingResult([{known:true,meaning:'손세탁'},{known:true,meaning:'표백제 금지'}]).value,'손세탁, 표백제 금지');
});
