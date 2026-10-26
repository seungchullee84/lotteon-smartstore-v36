import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {reviewSellingPoints} from '../smartstore-selling-point-review.mjs';
const product={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=test',name:'공식 의류'};
const points=[{title:'단정한 디테일',description:'뒷면 단추로 여밈을 조절할 수 있습니다.',evidence:'뒷면 단추로 여밈을 조절할 수 있습니다.'}];
test('기존 규칙에 없는 의류도 공식 원문을 공통 요약하고 동일 출처·해시에서 재사용한다',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'point-review-'));try{let calls=0;const fetchImpl=async()=>{calls++;return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({points})}]}]}));};
 const source='뒷면 단추로 여밈을 조절할 수 있습니다.';const options={dataRoot:root,apiKey:'test-only',fetchImpl,detailHash:'one'};
 const first=await reviewSellingPoints(product,source,options);assert.equal(first.status,'ready');assert.deepEqual(first.points,points);await reviewSellingPoints(product,source,options);assert.equal(calls,1);
 await reviewSellingPoints(product,source,{...options,detailHash:'two'});assert.equal(calls,2);
 const stale=await reviewSellingPoints(product,'현재 상품에는 단추 여밈이 없습니다.',{...options,apiKey:'',existing:points});assert.equal(stale.points.length,0);assert.equal(stale.status,'needs-review');
 }finally{await rm(root,{recursive:true,force:true});}});
test('근거 없는 응답·통신 오류·미연결은 완료로 표시하지 않는다',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'point-invalid-'));try{
 for(const fetchImpl of [async()=>new Response(JSON.stringify({output_text:JSON.stringify({points})})),async()=>new Response('{}',{status:503})]){const result=await reviewSellingPoints(product,'다른 상품의 공식 설명입니다.',{dataRoot:root,apiKey:'test-only',fetchImpl});assert.equal(result.status,'needs-review');assert.equal(result.points.length,0);}
 const offline=await reviewSellingPoints(product,'다른 상품의 공식 설명입니다.',{dataRoot:root,apiKey:''});assert.equal(offline.status,'needs-review');
 }finally{await rm(root,{recursive:true,force:true});}});
