import test from 'node:test';import assert from 'node:assert/strict';
import {subjectColors,resolvePhotoColor,decidePhotoRoles,LOCAL_PHOTO_POLICY,garmentKind} from '../smartstore-local-photo-policy.mjs';
import {acceptedLocalPrediction,classifyLocalPhotos} from '../smartstore-local-photo.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
test('상의·바지의 색을 배경과 이너 색에서 구분한다',()=>{
 assert.equal(garmentKind({name:'데님 쇼트 자켓'}),'upper');assert.equal(garmentKind({name:'코듀로이 팬츠'}),'pants');assert.equal(garmentKind({name:'티어드 원피스'}),'dress');assert.equal(garmentKind({sourceCategory:['WOMEN','JEANS']}),'pants');
 const caption='A mannequin wearing a black jacket and white pants. There is a white shirt under the jacket.';
 assert.deepEqual(subjectColors(caption,'upper'),['black']);assert.deepEqual(subjectColors(caption,'pants'),['white']);
 assert.deepEqual(subjectColors('A mannequin wearing a shirt. The shirt is blue and white.','upper'),['white','blue']);
 assert.deepEqual(subjectColors('There are blue walls behind the mannequin.','upper'),[]);
});
test('배경에 끌린 높은 회색 점수만으로 검정 의류를 회색으로 확정하지 않는다',()=>{
 const refs=[{quantiles:[[240,250,255],[240,250,255],[240,250,255]]},{quantiles:[[165,175,185],[165,175,185],[165,175,185]]},{quantiles:[[10,20,30],[10,20,30],[10,20,30]]}];
 const r=resolvePhotoColor({caption:'A mannequin wearing a black jacket and white pants.',quantiles:[[10,20,30],[10,20,30],[10,20,30]],colorScores:[{color:'02그레이',score:.99}]},['01화이트','02그레이','03블랙'],refs,'upper');assert.equal(r.color,'03블랙');assert(r.supported);
 const ambiguous=resolvePhotoColor({caption:'A garment.',quantiles:refs[0].quantiles},['01화이트','02아이보리'],[refs[0],refs[0]],'upper');assert.equal(ambiguous.supported,false);
});
test('색상별 구도를 선택하고 라벨·후면·다른 구도를 정면으로 몰지 않는다',()=>{
 const make=(name,color,binary,front,symmetry=.9)=>({name,colorResult:{supported:true,color},binary,roleScores:[{role:'front',score:front}],coverage:.4,symmetry});
 const rows=decidePhotoRoles([make('1.jpg','01블랙',{role:'front',relative:.96},.6),make('back.jpg','01블랙',{role:'back',relative:.99},.4),make('angled.jpg','01블랙',{role:'front',relative:.8},.45,.6),{name:'label.jpg',roleScores:[{role:'care-label',score:.95}]}]);
 assert.deepEqual(rows.map(r=>r.role),['front','back','detail','care-label']);assert(rows.every(r=>r.supported));
 const invalid={method:LOCAL_PHOTO_POLICY,status:'supported',role:'care-label',evidence:{careScore:.1}};assert(!acceptedLocalPrediction(invalid,[]));assert(acceptedLocalPrediction({...invalid,evidence:{careScore:.95}},[]));
 assert(!acceptedLocalPrediction({method:LOCAL_PHOTO_POLICY,status:'supported',role:'front',color:'01블랙',evidence:{}},['01블랙']));
});
test('예전 실패 캐시·공식 칩 변경·품번 출처 변경을 다시 평가한다',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'photo-policy-'));try{
  const p={style:'123456',sourceUrl:'https://www.giordano.co.kr/p/1',colors:['01블랙']},photo={name:'1.jpg',bytes:Buffer.from('original')};
  const hash=createHash('sha256').update(photo.bytes).digest('hex'),old=createHash('sha256').update(JSON.stringify([1,p.style,p.sourceUrl,p.colors,hash])).digest('hex');await mkdir(path.join(root,'local-photo-predictions'));await writeFile(path.join(root,'local-photo-predictions',old+'.json'),JSON.stringify({prediction:{roleScore:0}}));
  const folder=path.join(root,'source');await mkdir(folder);await writeFile(path.join(folder,'colorchip-0.jpg'),'chip-one');let calls=0;
  const predict=async()=>{calls++;return [{role:'front',color:'01블랙',roleScore:.9,roleMargin:.3,colorScore:.9,colorMargin:.3}];};
  assert.equal((await classifyLocalPhotos(p,[photo],{dataRoot:root,folder,predict})).length,1);await classifyLocalPhotos(p,[photo],{dataRoot:root,folder,predict});assert.equal(calls,1);
  await writeFile(path.join(folder,'colorchip-0.jpg'),'chip-two');await classifyLocalPhotos(p,[photo],{dataRoot:root,folder,predict});assert.equal(calls,2);
  await classifyLocalPhotos({...p,sourceUrl:'https://www.giordano.co.kr/p/2'},[photo],{dataRoot:root,folder,predict});assert.equal(calls,3);
  const stop=new AbortController();stop.abort();await assert.rejects(classifyLocalPhotos(p,[photo],{dataRoot:root,predict,signal:stop.signal}),{name:'AbortError'});
 }finally{await rm(root,{recursive:true,force:true});}
});
