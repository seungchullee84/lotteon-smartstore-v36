import test from 'node:test';
import assert from 'node:assert/strict';
import {startBenefitResearch} from '../benefit-research.mjs';
test('startup and refresh never scan files or spawn a worker in on-demand mode',async()=>{
 const old=process.env.REGISTER_BENEFIT_AUTORUN;process.env.REGISTER_BENEFIT_AUTORUN='1';
 try{for(let i=0;i<2;i++){
  const research=startBenefitResearch('Z:/nonexistent-catalog-must-not-be-created');
  await research.ready;assert.equal(research.state.status,'on-demand');
  assert.equal((await research.refresh()).status,'on-demand');assert.equal(research.state.pid,undefined);research.stop();
 }}finally{if(old===undefined)delete process.env.REGISTER_BENEFIT_AUTORUN;else process.env.REGISTER_BENEFIT_AUTORUN=old;}
});
