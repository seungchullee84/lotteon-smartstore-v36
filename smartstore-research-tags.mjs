import {openTagVerification} from './smartstore-learned.mjs';

const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export async function fillResearchTags(page,research,log=()=>{},check=()=>{}){
 if(!research.configured||!research.candidates.length){log(research.configured?'상품 근거에 맞는 조사 태그 없음 · 기존 태그 유지':'태그 조사 자료 연결 필요 · 기존 태그 유지');return {tagsTouched:false,tagMode:'research',tagCount:0,searchTagsVerified:false,tagStatus:'no-candidates'};}
 const started=Date.now(),pool=research.candidates.slice(0,30),wanted=new Map(pool.map(t=>[t.id,t.name]));
 if(pool.some(t=>!/^\d+$/.test(t.id)||!t.name)||wanted.size!==pool.length)throw Error('조사 태그 ID·명칭을 확인해 주세요.');
 check();const field=page.getByRole('textbox',{name:'태그를 입력해주세요.',exact:true});
 if(!await field.isVisible())await page.getByRole('button',{name:/^검색설정 도움말/}).click();
 const selected=page.locator('span.choice-label').filter({has:page.locator('strong')});
 const read=()=>selected.evaluateAll(es=>es.map(e=>({name:e.querySelector('strong')?.textContent.replace(/^#\s*/,'').trim(),id:e.querySelector('.sub-text')?.textContent.replace(/\D/g,'')})));
 const existing=await read(),retained=new Set();let searches=0;
 for(let i=existing.length-1;i>=0;i--){check();const t=existing[i];if(wanted.get(t.id)===t.name&&!retained.has(t.id)&&retained.size<10)retained.add(t.id);else await selected.nth(i).getByRole('button').click();}
 const used=new Set(retained),rejected=new Set();let verified=[],exhausted=false;
 const control=field.locator('../..');
 for(let round=0;round<3;round++){
  for(const tag of pool){
   check();if((await read()).length>=10)break;if(used.has(tag.id))continue;used.add(tag.id);
   await field.fill('');await field.pressSequentially(tag.name,{delay:0});await field.press('End');searches++;
   const option=control.locator('.selectize-dropdown-content [data-selectable][data-value="'+tag.id+'"]').filter({hasText:new RegExp('^'+escape(tag.name)+'$')});
   try{await option.waitFor({state:'visible',timeout:1500});}catch{check();rejected.add(tag.id);log('현재 사전 ID·명칭 확인 안 됨: '+tag.name);continue;}
   check();await option.click();
   await page.waitForFunction(name=>[...document.querySelectorAll('span.choice-label strong')].some(e=>e.textContent.replace(/^#\s*/,'').trim()===name)||[...document.querySelectorAll('.modal-content')].some(e=>e.getBoundingClientRect().height&&e.textContent.includes('태그로 등록할 수 없는 단어')),tag.name,{timeout:5000});
   const modal=page.locator('.modal-content').filter({hasText:'태그로 등록할 수 없는 단어'});
   if(await modal.isVisible()){await modal.getByRole('button',{name:'확인',exact:true}).click();rejected.add(tag.id);log('현재 사용 불가 태그 생략: '+tag.name);}
  }
  const tags=await read();exhausted=pool.every(t=>used.has(t.id));
  if(!tags.length){log('확인 가능한 사전 태그 없음 · 상품 저장 안 함');return {tagsTouched:existing.length>0,tagMode:'research',tagCount:0,searchTagsVerified:false,tagStatus:'unavailable',rejectedIds:[...rejected],searches};}
  if(tags.length>10||new Set(tags.map(t=>t.id)).size!==tags.length||tags.some(t=>wanted.get(t.id)!==t.name))throw Error('입력 태그가 조사 ID·명칭과 다릅니다.');
  check();await openTagVerification(page,field);
  const dialog=page.locator('.modal-content').filter({hasText:'검색 적용 태그 확인'});
  await dialog.getByRole('heading',{name:'검색 적용 태그 확인'}).waitFor({state:'visible'});
  const groups=await dialog.locator('dl').evaluateAll(es=>es.flatMap(e=>Array.from(e.children).filter(c=>c.tagName==='DT').map(dt=>({status:dt.textContent,tags:dt.nextElementSibling?.textContent||''}))));
  const registered=new Set(groups.filter(g=>/등록되어 있습니다|등록됨/.test(g.status)&&!/등록되어 있지|미등록/.test(g.status)).flatMap(g=>g.tags.split('#').map(s=>s.trim()).filter(Boolean)));
  verified=tags.filter(t=>registered.has(t.name));
  check();await dialog.getByRole('button',{name:'확인',exact:true}).click();
  for(let i=tags.length-1;i>=0;i--)if(!registered.has(tags[i].name)){check();rejected.add(tags[i].id);await selected.nth(i).getByRole('button').click();log('검색 미적용 태그 생략: '+tags[i].name);}
  if(verified.length===tags.length||exhausted)break;
 }
 await field.fill('');await field.press('Escape');await field.press('Tab');
 const actual=await read();if(actual.some(t=>!verified.some(v=>v.id===t.id&&v.name===t.name)))throw Error('태그 검색 적용 검증을 마치지 못했습니다.');
 const count=actual.length;
 log('조사 태그 '+count+'개 검색 적용 확인 · 기존 '+retained.size+'개 재사용 · 검색 '+searches+'회 · '+((Date.now()-started)/1000).toFixed(1)+'초 · 상품 저장 안 함');
 return {tagsTouched:true,tagMode:'research',tagCount:count,selectedTags:actual,searchTagsVerified:count>0,tagStatus:count===10?'complete':'partial',rejectedIds:[...rejected],searches,retained:retained.size};
}
