// Verified copy-form workflow. No save, publish, category, delivery or age actions.
export const copyStartUrl='https://sell.smartstore.naver.com/#/products/copy/13755624427';
export function sellerProductCode(p){
 if(!/^\d{6}$/.test(p.style||''))throw Error('판매자 상품코드 품번을 확인해 주세요.');
 const title=String(p.name||'').replace(/지오다노|여성|남성|남녀공용|NEW|\d{6}/gi,'').trim();
 const kind=title.match(/가디건|카디건|티셔츠|스웨터|원피스|스커트|슬랙스|청바지|맨투맨|조끼|베스트|자켓|재킷|점퍼|패딩|팬츠|바지|니트|셔츠|코트/)?.[0];
 const feature=title.match(/꽈배기|아가일|노르딕|브이넥|라운드|후드|기모|집업|와이드|슬림|경량|숏/)?.[0]||'';
 const short=p.style==='356944'?'꽈배기가디건':kind?(feature+kind):title.replace(/\s/g,'');
 const name=Array.from(short).slice(0,6).join('');
 if(!name)throw Error('판매자 상품코드용 간단한 상품명을 확인해 주세요.');
 return p.style+' '+name;
}
const verified={
 // 376921: official 05376921.jpg and Desktop/상품등록기사진폴더/376921 photos confirm full-length sleeves and a stand collar.
 '376921':{sleeve:'긴팔',neckline:'스텐드/차이나칼라'},
 // 076931: official 01076931.jpg confirms stand neck, long sleeves, faux suede and micro-ball padding.
 '076931':{neckline:'스텐드/차이나칼라',sleeve:'긴팔',attributes:{'총기장':'기본/하프','종류':['패딩/다운점퍼'],'핏':'루즈핏/오버핏','충전재':'솜/폴리에스테르','사용대상':'남성용','특징':['경량','방풍']},tags:["남성패딩","남자패딩","겨울패딩","남성겨울패딩","남자겨울패딩","솜패딩","스웨이드점퍼","패딩점퍼","남성패딩점퍼","남자패딩점퍼","겨울점퍼","남성점퍼","남자점퍼","남성겨울점퍼","남자겨울점퍼","캐주얼점퍼","남성아우터","남자아우터","겨울아우터","패딩","패딩코디"]},
 '356937':{neckline:'라운드넥',sleeve:'긴팔',tags:['여자니트','겨울니트','긴팔니트','긴팔가디건','라운드넥가디건','단추가디건','단추니트','데일리가디건','데일리니트','울가디건','울니트','겨울가디건','가을가디건','니트코디']},
 '356944':{neckline:'스텐드/차이나칼라',sleeve:'긴팔',material:'아크릴 54%, 폴리에스터 26%, 나일론 20%',washing:'손세탁, 표백제 금지, 천 대고 다림질(80~120℃), 뉘어서 그늘건조, 건조기 사용금지',tags:['여자니트','겨울니트','니트집업','꽈배기가디건','집업가디건','긴팔니트','긴팔가디건','니트집업가디건','꽈배기니트가디건','꽈배기니트']},
 '356938':{neckline:'칼라넥',sleeve:'긴팔',tags:['여자니트','겨울니트','긴팔니트','긴팔가디건','카라니트','카라넥니트','단추가디건','단추니트','데일리가디건','데일리니트']}
};
export function tagCandidates(p){
 const title=String(p.name||''),female=p.gender==='여성'||(!/남성|남자/.test(title)&&/여성|여자/.test(title)),male=p.gender==='남성'||(!female&&/남성|남자/.test(title));
 const cardigan=/가디건|카디건/.test(title),knit=cardigan||/니트|스웨터/.test(title),short=/반팔|민소매|슬리브리스/.test(title);
 // Season is based on product evidence, never on today's month or manufacture month.
 const winter=!short&&/겨울|기모|울|모\s*\d|패딩|다운|보온/.test(title+' '+(p.material||''));
 const summer=/여름|썸머|냉감|쿨링|린넨|리넨/.test(title);
 const gender=female?(knit?['여자니트','여성니트','여자니트가디건','여성가디건']:[]):male?(knit?['남자니트','남성니트','남성가디건']:[]):[];
 const season=winter?(knit?['겨울니트','겨울가디건']:[]):summer?(cardigan?['여름가디건']:[]):[];
 const known=verified[p.style]?.tags||[];
 const features=[...(/카라|칼라|폴로넥/.test(title)?['카라니트','카라넥니트']:[]),...(/단추|버튼/.test(title)?['단추가디건','단추니트']:[]),...(/집업|풀집/.test(title)?['니트집업','집업가디건','니트집업가디건']:[]),...(/꽈배기|케이블/.test(title)?['꽈배기가디건','꽈배기니트','꽈배기니트가디건']:[])];
 const basic=[...(/긴팔/.test(title)&&knit?['긴팔니트',...(cardigan?['긴팔가디건']:[])]:[]),...(cardigan?['데일리가디건']:[]),...(knit?['데일리니트','니트코디']:[])];
 // Verified style seasons are retained; new products need explicit evidence.
 return [...new Set([...(p.smartstoreTags||[]),...gender.slice(0,1),...season,...known,...features,...basic,...gender.slice(1)])];
}
export function planTagChanges(existing,candidates){
 const wanted=new Set(candidates.slice(0,10)),seen=new Set(),ids=new Set();
 return existing.map(t=>{const keep=wanted.has(t.name)&&/^\d+$/.test(t.id||'')&&!seen.has(t.name)&&!ids.has(t.id);if(keep){seen.add(t.name);ids.add(t.id);}return {...t,keep};});
}
export function learnedFields(p){
 const known=verified[p.style]||{},title=p.name||'';
 const material=p.material||known.material||'';
 const materials=[['인조가죽(합성피혁)',/인조가죽|합성피혁|합성가죽/],['아크릴',/아크릴/],['폴리에스테르',/폴리에[스]?터|폴리에스테르|플리에스터/],['나일론',/나일론/],['폴리우레탄',/폴리우레탄/],['면',/면\s*\d/],['울/모',/(?:울|모)\s*\d/],['레이온/인견',/레이온|인견/],['캐시미어',/캐시미어/]].filter(([,re])=>re.test(material)).map(([name])=>name);
 const sleeve=known.sleeve||(/긴팔/.test(title)?'긴팔':/반팔/.test(title)?'반팔':null);
 const neckline=known.neckline||(/카라|칼라|폴로넥/.test(title)?'칼라넥':/라운드/.test(title)?'라운드넥':/브이넥|V넥/i.test(title)?'V넥':/터틀넥/.test(title)?'터틀넥':/후드/.test(title)?'후드넥':null);
 // Tag candidates are deliberately excluded: the user handles tags manually.
 return {materials,sleeve,neckline,attributes:{...known.attributes,...(sleeve?{'소매기장':sleeve}:{}),...(neckline?{'네크라인':neckline}:{}),...(/남성|남자/.test(p.gender||title)?{'사용대상':'남성용'}:/여성|여자/.test(p.gender||title)?{'사용대상':'여성용'}:{})},manufactureDate:p.manufactured+'-01',material:material||known.material,washing:p.washing||known.washing};
}
export function assertLearnedFields(fields,attributeRows){
 if(!fields.materials.length)throw Error('상품 소재를 확인해 주세요.');
 for(const [label,key] of [['소매기장','sleeve'],['네크라인','neckline']]){
  if(attributeRows.some(row=>row.includes(label))&&!fields[key])throw Error(label+'을 상품 사진과 대조해 주세요.');
 }
 return fields;
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
  const row=table.getByRole('row').filter({hasText:label});
  if(!await row.count())continue; // Outerwear categories omit these selectors.
  if(!value)throw Error(label+'을 상품 사진과 대조해 주세요.');
  const input=row.locator('.selectize-input');
  if((await input.innerText()).trim()!==value){await input.click();await row.locator('.selectize-dropdown-content').getByText(value,{exact:true}).click();}
  if((await input.innerText()).trim()!==value)throw Error(label+' 선택 확인 실패');
 }
}
export async function openTagVerification(page,field){
 // Clearing text alone can leave an asynchronously loaded dropdown over the button.
 await field.fill('');await field.press('End');await field.press('Escape');await field.press('Tab');
 const button=page.getByText('검색에 적용되는 태그 확인',{exact:true});
 await button.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
 await button.click();
}
export async function fillDictionaryTags(page,candidates,log=()=>{},check=()=>{}){
 candidates=[...new Set(candidates)];
 if(candidates.length<10)throw Error('이 상품의 관련 태그 후보가 부족합니다. 상품 특성을 먼저 검토해 주세요.');
 const started=Date.now();let searches=0,retained=0;
 const field=page.getByRole('textbox',{name:'태그를 입력해주세요.',exact:true});
 if(!await field.isVisible())await page.getByRole('button',{name:/^검색설정 도움말/}).click();
 const selected=page.locator('span.choice-label').filter({has:page.locator('strong')});
 // Keep matching dictionary tags regardless of order; search only missing names.
 const existing=await selected.evaluateAll(es=>es.map(e=>({name:e.querySelector('strong')?.textContent.replace(/^#\s*/, '').trim(),id:e.querySelector('.sub-text')?.textContent.replace(/\D/g,'')})));
 const changes=planTagChanges(existing,candidates);
 for(let i=changes.length-1;i>=0;i--)if(!changes[i].keep){check();await selected.nth(i).getByRole('button').click();}
 const result=changes.filter(t=>t.keep);retained=result.length;
 const control=field.locator('../..');
 for(const name of candidates){
   if(result.length===10)break;
   if(result.some(t=>t.name===name))continue;
   check();await field.fill('');await field.pressSequentially(name,{delay:0});await field.press('End');searches++;
   const option=control.locator('.selectize-dropdown-content [data-selectable][data-value]').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
   try{await option.waitFor({state:'visible',timeout:1800});}catch{check();log('사전 후보 없음: '+name+' · 다음 관련 후보 확인');continue;}
   const id=await option.getAttribute('data-value');if(!/^\d+$/.test(id||'')||result.some(t=>t.id===id))continue;
   await option.click();
   await page.waitForFunction(name=>[...document.querySelectorAll('span.choice-label strong')].some(e=>e.textContent.replace(/^#\s*/,'').trim()===name)||[...document.querySelectorAll('.modal-content')].some(e=>e.getBoundingClientRect().height&&e.textContent.includes('태그로 등록할 수 없는 단어')),name,{timeout:5000});

   const rejected=page.locator('.modal-content').filter({hasText:'태그로 등록할 수 없는 단어'});
   if(await rejected.isVisible()){await rejected.getByRole('button',{name:'확인',exact:true}).click();log('사용 불가 태그 제외: '+name);continue;}
   const added=await selected.evaluateAll(es=>es.map(e=>e.querySelector('strong')?.textContent.replace(/^#\s*/,'').trim()));
   if(added.includes(name))result.push({name,id});
 }
 await field.fill('');assertDictionaryTags(result);
 const tags=assertDictionaryTags(await selected.evaluateAll(es=>es.map(e=>({name:e.querySelector('strong')?.textContent.replace(/^#\s*/, '').trim(),id:e.querySelector('.sub-text')?.textContent.replace(/\D/g,'')}))));
 await openTagVerification(page,field);
 const dialog=page.locator('.modal-content').filter({hasText:'검색 적용 태그 확인'});
 await dialog.getByRole('heading',{name:'검색 적용 태그 확인'}).waitFor({state:'visible'});
 const groups=await dialog.locator('dl').evaluateAll(es=>es.flatMap(e=>Array.from(e.children).filter(c=>c.tagName==='DT').map(dt=>({status:dt.textContent,tags:dt.nextElementSibling?.textContent||''}))));
 verifySearchTagGroups(tags,groups);
 await dialog.getByRole('button',{name:'확인',exact:true}).click();
 log('태그 10개 검색 적용 확인 · 기존 '+retained+'개 유지 · 검색 '+searches+'회 · '+((Date.now()-started)/1000).toFixed(1)+'초');return tags;
}
