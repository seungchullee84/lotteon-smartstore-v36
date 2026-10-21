import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('브라우저 코드에 중복 선언 등 구문 오류가 없음',async()=>{
 const js=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
});
