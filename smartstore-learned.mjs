// Verified copy-form workflow. No save, publish, category, delivery or age actions.
export const copyStartUrl='https://sell.smartstore.naver.com/#/products/copy/13755624427';
const verified={
 '356944':{neckline:'스텐드/차이나칼라',sleeve:'긴팔',material:'아크릴 54%, 폴리에스터 26%, 나일론 20%',washing:'손세탁, 표백제 금지, 천 대고 다림질(80~120℃), 뉘어서 그늘건조, 건조기 사용금지',tags:['니트집업','꽈배기가디건','집업가디건','긴팔니트','긴팔가디건','니트집업가디건','꽈배기니트가디건','꽈배기니트','집업니트','니트코디']}
};
export function learnedFields(p){
 const known=verified[p.style]||{},title=p.name||'';
 const material=p.material||known.material||'';
 const materials=[['아크릴',/아크릴/],['폴리에스테르',/폴리에[스]?터|폴리에스테르|플리에스터/],['나일론',/나일론/],['폴리우레탄',/폴리우레탄/],['면',/면\s*\d/],['울/모',/(?:울|모)\s*\d/],['레이온/인견',/레이온|인견/],['캐시미어',/캐시미어/]].filter(([,re])=>re.test(material)).map(([name])=>name);
 const sleeve=known.sleeve||(/긴팔/.test(title)?'긴팔':/반팔/.test(title)?'반팔':null);
 const neckline=known.neckline||(/라운드/.test(title)?'라운드넥':/브이넥|V넥/i.test(title)?'V넥':/터틀넥/.test(title)?'터틀넥':/후드/.test(title)?'후드넥':null);
 // Only verified candidates for this product. Other styles require review rather than unrelated filler.
 return {materials,sleeve,neckline,tags:p.smartstoreTags||known.tags||[],manufactureDate:p.manufactured+'-01',material:material||known.material,washing:p.washing||known.washing};
}
export function assertDictionaryTags(tags){
 if(tags.length!==10||new Set(tags.map(t=>t.name)).size!==10||new Set(tags.map(t=>t.id)).size!==10||tags.some(t=>!/^\d+$/.test(t.id)))throw Error('사전 태그 10개의 이름·숫자 ID·중복을 확인해 주세요.');
 return tags;
}
export function verifySearchTagGroups(tags,groups){
 assertDictionaryTags(tags);
 const registered=groups.filter(g=>/등록되어 있습니다|등록됨/.test(g.status)&&!/등록되어 있지|미등록/.test(g.status)).map(g=>g.tags).join(' ');
 for(const tag of tags)if(!registered.split('#').map(s=>s.trim()).includes(tag.name))throw Error('검색 적용 검증 실패: '+tag.name+' · 확인 창을 검토해 주세요.');
 return true;
}
export async function fillLearnedAttributes(page,fields,check=()=>{}){
 const table=page.getByRole('table',{name:'상품속성 선택 테이블'});
 const materialRow=table.getByRole('row').filter({hasText:'주요소재'});
 if(!fields.materials.length)throw Error('상품 소재를 확인해 주세요.');
 const boxes=materialRow.getByRole('checkbox');
 for(let i=0;i<await boxes.count();i++){
  check();const box=boxes.nth(i),name=await box.getAttribute('aria-label')||await box.evaluate(e=>e.labels?.[0]?.textContent?.trim()||e.parentElement.textContent.trim());
  const selected=await box.isChecked(),wanted=fields.materials.includes(name.trim());
  if(selected!==wanted){const id=await box.getAttribute('id');if(id)await page.locator('label[for="'+id+'"]').click();else await box.click({force:true});}
  if(await box.isChecked()!==wanted)throw Error('소재 선택 확인 실패: '+name);
 }
 for(const [label,value] of [['소매기장',fields.sleeve],['네크라인',fields.neckline]]){
  if(!value)throw Error(label+'을 상품 사진과 대조해 주세요.');
  const row=table.getByRole('row').filter({hasText:label}),input=row.locator('.selectize-input');
  if((await input.innerText()).trim()!==value){await input.click();await row.locator('.selectize-dropdown-content').getByText(value,{exact:true}).click();}
  if((await input.innerText()).trim()!==value)throw Error(label+' 선택 확인 실패');
 }
}
export async function fillDictionaryTags(page,candidates,log=()=>{},check=()=>{}){
 if(candidates.length!==10||new Set(candidates).size!==10)throw Error('이 상품의 사전 태그 후보 10개를 먼저 검토해 주세요.');
 const field=page.getByRole('textbox',{name:'태그를 입력해주세요.',exact:true});
 if(!await field.isVisible())await page.getByRole('button',{name:/^검색설정 도움말/}).click();
 const selected=page.locator('span.choice-label').filter({has:page.locator('strong')});
 // One UI loop; use the dropdown's existing cache and wait for exact dictionary results.
 const existing=await selected.evaluateAll(es=>es.map(e=>({name:e.querySelector('strong')?.textContent.replace(/^#\s*/, '').trim(),id:e.querySelector('.sub-text')?.textContent.replace(/\D/g,'')})));
 if(existing.length!==10||existing.some((t,i)=>t.name!==candidates[i]||!/^\d+$/.test(t.id||''))){
  for(let i=await selected.count();i>0;i--){check();await selected.first().getByRole('button').click();}
  const control=field.locator('../..'),result=[];
  for(const name of candidates){
   check();await field.fill('');await field.pressSequentially(name,{delay:35});
   const option=control.locator('.selectize-dropdown-content [data-selectable][data-value]').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
   await option.waitFor({state:'visible',timeout:6000});
   const id=await option.getAttribute('data-value');if(!/^\d+$/.test(id||''))throw Error('태그사전 검색 결과가 아닙니다: '+name);
   await option.click();result.push({name,id});
  }
  assertDictionaryTags(result);
 }
 const tags=assertDictionaryTags(await selected.evaluateAll(es=>es.map(e=>({name:e.querySelector('strong')?.textContent.replace(/^#\s*/, '').trim(),id:e.querySelector('.sub-text')?.textContent.replace(/\D/g,'')}))));
 await page.getByText('검색에 적용되는 태그 확인',{exact:true}).click();
 const dialog=page.locator('.modal-content').filter({hasText:'검색 적용 태그 확인'});
 await dialog.getByRole('heading',{name:'검색 적용 태그 확인'}).waitFor({state:'visible'});
 const groups=await dialog.locator('dl').evaluateAll(es=>es.flatMap(e=>Array.from(e.children).filter(c=>c.tagName==='DT').map(dt=>({status:dt.textContent,tags:dt.nextElementSibling?.textContent||''}))));
 verifySearchTagGroups(tags,groups);
 await dialog.getByRole('button',{name:'확인',exact:true}).click();
 log('태그사전 ID 10개 및 검색 적용 등록됨 확인');return tags;
}
