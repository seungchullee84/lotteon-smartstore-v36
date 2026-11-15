import test from 'node:test';
import assert from 'node:assert/strict';
import {backgroundActionKind} from '../background-action-policy.mjs';
import {backgroundPrompt} from '../background-prompt.mjs';

test('same-product input, metadata, export and navigation hold application without cancelling generation',()=>{
 for(const action of ['run','open','continue','stop','save-main-image','save-detail-images','notice-region-text','price-changer/open','smartstore-detail-only','smartstore-extra-only','smartstore-template','smartstore-template-headline','smartstore-point-selection','learn-washing-icon','browser-login-settings','naver-keywords','lotte-current-brushed-category','lotte-category-selection'])assert.equal(backgroundActionKind('/api/'+action),'concurrent',action);
});
test('product/photo changes, shutdown and unknown mutations invalidate old work before mutation',()=>{
 for(const action of ['collect','smartstore-auto','smartstore-import-photos','smartstore-import-photos-apply','smartstore-photo-review','smartstore-combine-photos','exclude-extra-image','shutdown','future-photo-replacement'])assert.equal(backgroundActionKind('/api/'+action),'source-change',action);
});
test('retry, explicit failure and completion use the guarded workflow path',()=>{
 for(const action of ['background-prepare','background-dispatch','background-inspect','background-result','background-retry','background-fail','background-complete','background-cancel','background-selection','background-apply-preview'])assert.equal(backgroundActionKind('/api/'+action),'workflow',action);
});
test('worker instructions require corrective retries, current-attempt review and explicit failure reason',()=>{
 const prompt=backgroundPrompt({jobId:'job-123456',style:'416972',key:'main',sourcePath:'C:/source/main.jpg'},{root:"C:/folder's app",nodePath:'C:/node.exe'});
 for(const value of ['retry --job job-123456 --reason','fail --job job-123456 --reason','apply --job job-123456 --reviewed --attempt','최대 2차','waiting:true',"folder''s app"])assert.ok(prompt.includes(value),value);
 assert.ok(prompt.includes('취소나 품번·선택 변경 오류는 재시도하지'));
});
