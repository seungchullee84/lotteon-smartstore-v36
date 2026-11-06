import {isSmartstoreDetailEditUrl,readDetailOnlySellerCode} from './smartstore-detail-only.mjs';
export function isSmartstoreInputUrl(url){return /^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/(?:create(?:[?]|$)|(?:copy|edit)\/\d+(?:[?]|$))/.test(url);}
import {buildSmartstoreDetail} from './smartstore-detail.mjs';
import {fillProductAttributes} from './smartstore-attributes.mjs';
import {smartstoreTitle,assertSmartstoreInputTitle} from './smartstore-title.mjs';
import {learnedFields,sellerProductCode} from './smartstore-learned.mjs';
import {researchForProduct} from './apparel-tag-research.mjs';
import {fillResearchTags} from './smartstore-research-tags.mjs';
import path from 'node:path';

export function smartstorePlan(p,salePrice){
  if(!/^\d{6}$/.test(p?.style))throw Error('먼저 상품을 수집해 주세요.');
  if(!Number.isSafeInteger(+salePrice)||+salePrice<10||+salePrice%10)throw Error('스마트스토어 테스트 판매가는 10원 단위로 입력해 주세요.');
  for(const key of ['name','country','material','washing','manufactured'])if(!p[key])throw Error('수집 정보를 확인해 주세요: '+key);
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.manufactured))throw Error('제조연월은 YYYY-MM 형식이어야 합니다.');
  if(!p.colors?.length||!p.sizes?.length)throw Error('색상과 사이즈가 필요합니다.');
  const category=null; // Keep the category selected in the copy form.
  const country=String(p.country).trim();
  if(!['미얀마','중국','베트남','방글라데시','인도네시아','캄보디아','인도','태국','필리핀','파키스탄','스리랑카','일본','대한민국','한국'].includes(country))throw Error('스마트스토어 제조국 선택을 먼저 검증해야 합니다.');
  return {style:p.style,rawName:p.rawName,officialDescription:p.officialDescription,sourceUrl:p.sourceUrl,reviewedGarmentAttributes:p.reviewedGarmentAttributes,name:smartstoreTitle(p),nameUserEdited:!!p.smartstoreNameUserEdited,salePrice:+salePrice,consumerPrice:+p.consumerPrice,category,colors:[...p.colors],sizes:[...p.sizes],stockPerOption:10,expectedOptions:p.colors.length*p.sizes.length,material:p.material,country,washing:p.washing,manufactured:p.manufactured,html:buildSmartstoreDetail(p).html,keywords:false,save:false};
}

export function verifySmartstoreOptions(plan,rows){
  const seen=new Map();
  for(const row of rows){const key=row.color+'\t'+row.size;if(seen.has(key))throw Error('중복 옵션: '+key);seen.set(key,row.stock);}
  if(seen.size!==plan.expectedOptions)throw Error('옵션 개수가 다릅니다. 예상 '+plan.expectedOptions+'개 / 확인 '+seen.size+'개');
  for(const color of plan.colors)for(const size of plan.sizes)if(seen.get(color+'\t'+size)!==plan.stockPerOption)throw Error('옵션 재고 확인 실패: '+color+' / '+size);
  return seen.size;
}

export async function readSmartstoreOptionRows(page,plan,check=()=>{}){
  const rows=new Map();
  const cell=index=>page.locator('[role="row"][row-index="'+index+'"] [col-id="optionName1"]');
  const remember=async()=>{
    const rendered=await page.locator('[role="row"][row-index]').evaluateAll(es=>es.filter(e=>e.querySelector('[col-id="optionName1"]')&&e.querySelector('[col-id="optionName2"]')&&e.querySelector('[col-id="stockQuantity"]')).map(e=>({index:Number(e.getAttribute('row-index')),color:e.querySelector('[col-id="optionName1"]').textContent.trim(),size:e.querySelector('[col-id="optionName2"]').textContent.trim(),stock:Number(e.querySelector('[col-id="stockQuantity"]').textContent.trim())})));
    for(const row of rendered)rows.set(row.index,row);
  };
  check();await remember();
  if(rows.size===plan.expectedOptions&&Array.from({length:plan.expectedOptions},(_,index)=>index).every(index=>rows.has(index)))return [...rows.values()];
  await page.locator('[role="gridcell"][col-id="optionName1"]').first().press('Control+Home');
  await cell(0).waitFor({state:'visible',timeout:8000});await remember();
  // Virtual grids remove off-screen rows. Move through each missing range instead
  // of jumping straight to the end and losing the middle combinations.
  for(let index=1;index<plan.expectedOptions;index++){
    check();if(rows.has(index))continue;
    await cell(index-1).press('ArrowDown');
    await cell(index).waitFor({state:'visible',timeout:8000});await remember();
  }
  return [...rows.values()];
}

// The same visible-UI driver runs in the app's Playwright browser and in CUA tests.
// No save, temporary-save or publish action. Unspecified copied settings stay intact.
const optionModes=[['직접 입력하기',/^직접\s*입력하기$/],['조합형',/^조합\s*형$/]];
const optionModeRadio=(panel,label)=>panel.getByLabel(label).and(panel.locator('input[type="radio"]'));
export async function ensureSmartstoreOptionMode(page,check=()=>{}){
 const panel=page.locator('ui-view[name="option"]');
 const enabled=panel.locator('#option_choice_type_true'),enabledLabel=panel.locator('label[for="option_choice_type_true"]');
 // The styled radio itself can be hidden even when the whole option panel is open.
 if(!await enabledLabel.isVisible()){check();await panel.getByRole('button',{name:/^옵션 도움말/}).click();}
 await enabledLabel.waitFor({state:'visible'});
 if(!await enabled.isChecked()){check();await enabledLabel.click();}
 for(const [name,labelText] of optionModes){
  const radio=optionModeRadio(panel,labelText);await radio.waitFor({state:'attached'});
  if(!await radio.isChecked()){
   const id=await radio.getAttribute('id'),associated=id?panel.locator('label[for='+JSON.stringify(id)+']'):null;
   const label=associated&&await associated.count()===1?associated:radio.locator('xpath=ancestor::label[1]');
   check();
   if(!await label.isVisible()&&await radio.isVisible())await radio.check();
   else await label.click();
  }
  if(!await radio.isChecked())throw Error('옵션 입력 방식 확인 실패: '+name);
 }
}
export async function fillSmartstoreOrigin(page,country,check=()=>{}){
 const select=async(field,text)=>{
  check();const box=page.locator('select[ng-model="vm.viewData.originAreaInfo.'+field+'"]').locator('..');
  const input=box.locator('.selectize-input');await input.waitFor({state:'visible'});
  if((await input.innerText()).trim()!==text){await input.click();await box.locator('.selectize-dropdown-content').getByText(text,{exact:true}).click();}
  if((await input.innerText()).trim()!==text)throw Error('원산지 선택 확인 실패: '+text);
 };
 if(country==='대한민국'||country==='한국'){await select('originAreaExposureType','국산');return {type:'국산',country:'대한민국'};}
 await select('originAreaExposureType','수입산');await select('firstSubOriginAreaType','아시아');await select('secondSubOriginAreaType',country);
 const importer=page.locator('input[ng-model="vm.viewData.originAreaInfo.importer"]');
 check();await importer.fill('지오다노');await importer.press('Tab');
 if(await importer.inputValue()!=='지오다노')throw Error('원산지 수입사 입력 확인 실패');
 await page.waitForFunction(()=>{const input=document.querySelector('input[ng-model="vm.viewData.originAreaInfo.importer"]');return input?.value==='지오다노'&&!input.classList.contains('ng-invalid');},null,{timeout:8000});
 return {type:'수입산',region:'아시아',country,importer:'지오다노'};
}
export async function fillSmartstoreValue(loc,value,check=()=>{}){
 check();const expected=String(value),current=await loc.evaluate(e=>e.value);
 if(current===expected)return false;
 await loc.fill(expected);await loc.press('Tab');check();
 const actual=await loc.evaluate(e=>e.value);
 if(actual!=='<redacted>'&&String(actual).replaceAll(',','')!==expected.replaceAll(',',''))throw Error('입력값 확인 실패: '+expected.slice(0,50));
 return true;
}
export async function fillSmartstoreOptions(page,plan,{check=()=>{},log=()=>{},completed=false,receipt}={}){
  const fill=(loc,value)=>fillSmartstoreValue(loc,value,check);
  const optionName=page.locator('#choice_option_name0');
  const changed=()=>Error('완료된 옵션 또는 재고가 바뀌었습니다. 현재 입력을 보존하고 이어서 진행을 멈췄습니다.');
  if(completed){
    const panel=page.locator('ui-view[name="option"]');
    if(!await panel.locator('#option_choice_type_true').isChecked())throw changed();
    for(const [,label] of optionModes)if(!await optionModeRadio(panel,label).isChecked())throw changed();
  }else await ensureSmartstoreOptionMode(page,check);
  const optionCount=page.locator('input[ng-model="vm.choiceOptionNameCount"]').locator('..');
  if((await optionCount.locator('.selectize-input').innerText()).trim()!=='2개'){
    if(completed)throw changed();
    const two=optionCount.locator('.selectize-dropdown-content').getByText('2개',{exact:true});
    check();if(!await two.isVisible())await optionCount.locator('.selectize-input').click();await two.click();
  }
  await page.locator('#choice_option_name1').waitFor({state:'visible'});
  if(receipt?.listRequested&&!completed){
    // A timed out response can leave the list still being built. Wait for it
    // once, then verify the actual pairs; never send a second list request.
    await page.waitForFunction(count=>Number(document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount'))===count+2,plan.expectedOptions,{timeout:4000})
     .catch(()=>{check();throw Error('이미 요청한 옵션 목록의 반영을 확인하지 못했습니다. 중복 생성하지 않았습니다.');});
  }
  const same=await optionName.inputValue()==='컬러'&&await page.locator('#choice_option_name1').inputValue()==='사이즈'&&await page.locator('#choice_option_value0').inputValue()===plan.colors.join(',')&&await page.locator('#choice_option_value1').inputValue()===plan.sizes.join(',')&&Number(await page.getByRole('grid').getAttribute('aria-rowcount'))===plan.expectedOptions+2;
  let pairsMatch=false;
  if(same){
    const rows=await readSmartstoreOptionRows(page,plan,check);
    try{
      const count=verifySmartstoreOptions(plan,rows);
      log('기존 옵션 조합·재고 '+count+'개 일치 · 다시 생성하거나 일괄수정하지 않았습니다.');
      return count;
    }catch{if(completed)throw changed();}
    try{verifySmartstoreOptions({...plan,stockPerOption:0},rows.map(row=>({...row,stock:0})));pairsMatch=true;}catch{}
  }else if(completed)throw changed();
  if(!pairsMatch){
    if(receipt?.listRequested)throw Error('이미 요청한 옵션 조합을 확인하지 못했습니다. 중복 생성하지 않았습니다.');
    await fill(optionName,'컬러');await fill(page.locator('#choice_option_value0'),plan.colors.join(','));
    await fill(page.locator('#choice_option_name1'),'사이즈');await fill(page.locator('#choice_option_value1'),plan.sizes.join(','));
    const apply=page.getByRole('button',{name:'옵션목록으로 적용',exact:true});
    await apply.click({trial:true});check();
    if(receipt)receipt.listRequested=true;
    await apply.click();
  }
  await applySmartstoreBulkStock(page,plan,check);
  const count=verifySmartstoreOptions(plan,await readSmartstoreOptionRows(page,plan,check));
  log('색상 '+plan.colors.length+' × 사이즈 '+plan.sizes.length+' 옵션 조합·재고 확인');
  return count;
}
const basicFields='input[name="product.name"],#prd_price2';
const noticeFields='#prd,#prd_col,#prd_size,#prd_caution,#seller-code1,#material-detail,input[name="product.detailAttribute.manufactureDate"],input[ng-model="vm.dateText"],[ng-model^="vm.viewData.originAreaInfo."]';
const readFields=(page,selector)=>page.locator(selector).evaluateAll(nodes=>nodes.map(n=>[n.id,n.name,n.getAttribute('ng-model'),n.value,n.type==='radio'||n.type==='checkbox'?n.checked:null]));
export async function fillSmartstore(tab,plan,assets,log=()=>{},check=()=>{},{measure=(_,fn)=>fn(),resume}={}){
  assertSmartstoreInputTitle(plan.name,plan.nameUserEdited);
  const page=tab.playwright;
  if(!isSmartstoreInputUrl(await tab.url()))throw Error('스마트스토어 로그인 후 상품 등록 화면을 열어 주세요.');
  const editing=isSmartstoreDetailEditUrl(await tab.url());
  if(!editing&&!/\/products\/copy\/\d+/.test(await tab.url()))throw Error('수정 또는 복사등록 화면에서 실행해 주세요.');
  if(editing&&!/^\d{6}$/.test(plan.style||''))throw Error('전체 입력할 현재 품번을 확인해 주세요.');
  const learned=learnedFields(plan);
  const fill=(loc,value)=>fillSmartstoreValue(loc,value,check);
  const open=async(name,field)=>{if(!await field.isVisible())await page.getByRole('button',{name}).click();};
  const phase=(name,fn,selector)=>measure(name,async()=>{
    check();const old=resume?.fields?.[name];
    if(old){
      if(JSON.stringify(await readFields(page,selector))!==old.snapshot)throw Error('이전에 완료한 상품 입력값이 바뀌었습니다. 현재 입력값을 그대로 두었습니다.');
      log('기존 반영 확인 · '+(name==='basic'?'상품명·가격':'상품정보·고시')+' 다시 입력하지 않았습니다.');
      return old.value;
    }
    const value=await fn();check();
    if(resume&&selector)(resume.fields||={})[name]={snapshot:JSON.stringify(await readFields(page,selector)),value};
    return value;
  });
  log('스마트스토어 '+(editing?'수정':'복사등록')+' 입력 · 상품 저장/등록 안 함');
  log('카테고리 자동선택 중지 · 현재 선택된 분류 유지');
  await phase('basic',async()=>{
    await fill(page.locator('input[name="product.name"]'),plan.name);
    await fill(page.locator('#prd_price2'),plan.salePrice);
    log('상품명·판매가 '+plan.salePrice+'원 확인');
  },basicFields);
  const verifiedOptions=await phase('options',()=>fillSmartstoreOptions(page,plan,{check,log,completed:resume?.options===true,receipt:resume?(resume.optionReceipt||={}):undefined}));
  if(resume)resume.options=true;
  const slots=resume?(resume.slots||={}):undefined;
  if(assets&&(assets.main||Array.isArray(assets.extras))){await uploadSmartstoreImages(page,assets,check,{measure:phase,slots,log});log(assets.main?'대표·추가 이미지 첨부 확인':'추가이미지 정리 완료 · 대표이미지 교체 제외');}
  if(!assets?.detail)log('복사된 상세설명 유지 · 별도로 지시한 이미지 입력만 수행');
  const {origin,manufactureDate,sellerCode,tagReport}=await phase('productInfo',async()=>{
  await open(/^상품 주요정보/,page.getByRole('textbox',{name:'품번',exact:true}));
  await fillProductAttributes(page,learned,log,check);
  const origin=await fillSmartstoreOrigin(page,plan.country,check);
  log('원산지 확인: '+origin.type+' · '+origin.country+(origin.importer?' · 수입사 '+origin.importer:''));
  const manufactureDate=learned.manufactureDate;
  const date=page.locator('input[name="product.detailAttribute.manufactureDate"]');
  const displayed=await date.evaluate(e=>e.value);
  if(displayed!==manufactureDate.replaceAll('-','.')+'.'){
    await date.click();
    const calendar=page.locator('.seller-datetime-picker').filter({has:date});
    await calendar.locator('.datetimepicker-header .title').click();
    await calendar.locator('.datetimepicker-header .title').click();
    const year=plan.manufactured.slice(0,4);
    for(let n=0;n<20&&!await calendar.getByText(year,{exact:true}).isVisible();n++){
      const range=await calendar.locator('.datetimepicker-header .title').innerText();
      await calendar.locator(Number(year)<Number(range.slice(0,4))?'.datetimepicker-header .prev button':'.datetimepicker-header .next button').click();
    }
    await calendar.getByText(year,{exact:true}).click();
    await calendar.getByText(Number(plan.manufactured.slice(5))+'월',{exact:true}).click();
    await calendar.locator('td.day:not(.past):not(.future)').getByText('1',{exact:true}).click();
    if(await date.evaluate(e=>e.value)!==manufactureDate.replaceAll('-','.')+'.')throw Error('제조일자 1일 입력 확인 실패');
  }
  await open(/^상품정보제공고시/,page.locator('#prd'));
  for(const [selector,value] of [['#prd',learned.material],['#prd_col',plan.colors.join(',')],['#prd_size',plan.sizes.join(',')],['#prd_caution',learned.washing]])await fill(page.locator(selector),value);
  const directDate=page.getByRole('radio',{name:'직접입력',exact:true}).filter({visible:true}).first();
  if(!await directDate.evaluate(e=>e.checked))await directDate.locator('..').click();
  await fill(page.locator('input[ng-model="vm.dateText"]'),plan.manufactured);
  const tagReport=assets?.preserveTags===true?{tagsTouched:false,tagStatus:'paused'}:await fillResearchTags(page,plan.tagResearch||researchForProduct(plan),log,check);
  await open(/^판매자 코드/,page.locator('#seller-code1'));
  const sellerCode=await fillSmartstoreSellerCode(page,plan,{check,log});
  log('판매자 상품코드 확인: '+sellerCode+' · 바코드·내부코드 유지');
  await open(/^노출 채널/,page.locator('#material-detail'));
  await fill(page.locator('#material-detail'),learned.material);
  return {origin,manufactureDate,sellerCode,tagReport};
  },noticeFields);
  if(Object.hasOwn(assets||{},'careLabels'))await phase('careLabels',async()=>{
    await uploadSmartstoreImageSlot(page,'tagImages',assets.careLabels,{replaceImages:true,receipt:slots?(slots.tagImages||={}):undefined,log},check);
    log(assets.careLabels.length?'현재 품번 택/케어라벨 '+assets.careLabels.length+'장 교체 확인':'품번 폴더에 택/케어라벨 없음 · 복사된 기존 라벨 확인');
  });
  log('소재(설명)에 현재 상품 소재·혼용률 입력 확인');
  log('소재·색상·치수·제조국·세탁방법 입력 · A/S·품질보증·미성년자 구매 기존값 유지');
  log('입력 테스트 완료 · '+verifiedOptions+'개 옵션 각 '+plan.stockPerOption+'개 재고 확인 · 저장/등록은 하지 않았습니다.');
  return {style:plan.style,salePrice:plan.salePrice,verifiedOptions,stockPerOption:plan.stockPerOption,manufactureDate,imagesSkipped:!assets,saved:false,keywordsTouched:false,...tagReport,sellerCode,origin};
}

export async function uploadSmartstoreImages(page,assets,check=()=>{},{measure=(_,fn)=>fn(),slots,log}={}){
 const upload=(id,files)=>uploadSmartstoreImageSlot(page,id,files,{...assets,receipt:slots?(slots[id]||={}):undefined,log},check);
 if(assets.main)await measure('mainImage',()=>upload('representImage',[assets.main]));
 if(Array.isArray(assets.extras))await measure('extraImages',()=>upload('optionalImages',assets.extras));
}

// Some seller screens emit a file chooser straight from "이미지 등록";
// others first open "내 사진". Keep the listener across both actions.
async function selectSmartstoreImageFile(page,container,{receipt,check,fileCount,log}){
 const dialogs=page.getByRole('dialog').filter({visible:true});
 const picker=dialogs.filter({has:page.getByRole('button',{name:'내 사진',exact:true})});
 let chooser,clickedAt=0;
 const capture=value=>{chooser=value;};
 page.on('filechooser',capture);
 try{
  if(!await picker.count()){
   check();if(receipt)receipt.picker=true;
   await container.getByRole('button',{name:'이미지 등록',exact:true}).click({timeout:5000});
  }else if(!receipt?.picker)throw Error('열려 있는 사진 선택 창을 먼저 확인해 주세요.');
  const openedAt=Date.now(),deadline=openedAt+10000;
  while(Date.now()<deadline){
   check();if(chooser)return files=>chooser.setFiles(files,{timeout:60000});
   const count=await picker.count();
   if(count>1)throw Error('사진 선택 창을 한 곳으로 확인하지 못했습니다.');
   if(count===1&&!clickedAt){
    check();await picker.getByRole('button',{name:'내 사진',exact:true}).click({timeout:4000});
    clickedAt=Date.now();continue;
   }
   if(Date.now()-(clickedAt||openedAt)>=450&&await dialogs.count()===count){
    const input=(count===1?picker:container).locator('input[type="file"]:enabled');
    if(await input.count()===1){
     const eligible=await input.evaluate((node,{fileCount,inDialog})=>
      (fileCount===1||node.multiple)&&((inDialog&&!node.accept)||/image\/|\.(?:jpe?g|png|webp)\b/i.test(node.accept)),{fileCount,inDialog:count===1});
     if(chooser)return files=>chooser.setFiles(files,{timeout:60000});
     if(eligible){
      log('파일 선택기 대신 현재 이미지 창의 파일 입력란 사용');
      return files=>input.setInputFiles(files,{timeout:60000});
     }
    }
   }
   await new Promise(resolve=>setTimeout(resolve,90));
  }
  throw Object.assign(Error('현재 이미지 파일 선택창이 응답하지 않습니다.'),{code:'SMARTSTORE_UI_DELAY'});
 }finally{page.off('filechooser',capture);}
}

export async function uploadSmartstoreImageSlot(page,id,files,{replaceImages=false,receipt,log=()=>{}}={},check=()=>{}){
 if(!files?.length&&!replaceImages)return;
 check();const container=page.locator('ncp-product-temp-photo-infra-image-upload#'+id);
 const sources=()=>container.locator('img').evaluateAll(images=>images.map(image=>image.currentSrc||image.src));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const label=({representImage:'대표사진',optionalImages:'추가사진',tagImages:'택·케어라벨'})[id]||'사진';
 const fail=()=>Error('첨부한 사진을 같은 파일로 확인하지 못했습니다. 중복 첨부를 막기 위해 현재 사진을 그대로 두었습니다.');
 const finish=async()=>{
  if(id==='tagImages'&&files?.length){
   const progress=page.locator('.modal-content').filter({hasText:'상품정보 추출 중입니다.'});
   if(await progress.isVisible()){check();await progress.getByRole('button',{name:'확인',exact:true}).click();}
   await page.waitForFunction(()=>[...document.querySelectorAll('.modal-content')].some(e=>e.getBoundingClientRect().height&&e.textContent.includes('택/케어라벨 이미지 분석 추출 결과'))||/분석실패|결과없음/.test(document.querySelector('ncp-product-temp-photo-infra-image-upload#tagImages')?.textContent||''),null,{timeout:60000});
   const result=page.locator('.modal-content').filter({hasText:'택/케어라벨 이미지 분석 추출 결과'});
   if(await result.isVisible()){check();await result.getByRole('button',{name:'닫기',exact:true}).click();await result.waitFor({state:'hidden'});}
  }
  if(receipt)receipt.done=true;
 };
 // Browser animation frames can pause when the dedicated window is minimized.
 // Read the slot from Node so attachment checks continue in the background.
 const waitForSources=async(matches,timeout,message)=>{
  const deadline=Date.now()+timeout;
  while(true){
   check();
   const observed=await sources();
   check();
   if(matches(observed))return observed;
   if(Date.now()>=deadline)throw Object.assign(Error(message(observed)),{code:'SMARTSTORE_UI_DELAY'});
   await new Promise(resolve=>setTimeout(resolve,150));
  }
 };
 const isHosted=(source,name)=>{
  try{
   const url=new URL(source);
   // Seller thumbnails can retain a legacy HTTP URL in the image attribute.
   // This checks the seller's existing thumbnail and does not fetch that URL.
   return ['https:','http:'].includes(url.protocol)&&/(^|\.)(naver|pstatic)\.net$/.test(url.hostname)&&
    (name===undefined||decodeURIComponent(url.pathname.split('/').at(-1))===name);
  }catch{return false;}
 };
 const describeSources=observed=>[...new Set(observed.map(source=>{
  try{
   const url=new URL(source);
   if(['blob:','data:'].includes(url.protocol))return '임시 미리보기';
   return url.hostname?`${url.protocol}//${url.hostname}`:url.protocol;
  }catch{return '주소 미확인';}
 }))].join(', ')||'사진 없음';
 const waitHosted=(timeout,names)=>waitForSources(
  observed=>observed.length===files.length&&observed.every((source,i)=>isHosted(source,names?.[i])),
  timeout,
  observed=>{
   const hosted=observed.filter(source=>isHosted(source)).length;
   return `${label} 반영 확인 지연 · 판매자 화면 ${observed.length}장 / 요청 ${files.length}장 · 네이버 주소 ${hosted}장`+
    (names&&hosted===files.length?' · 요청 파일명 일치 확인 실패':` · ${describeSources(observed)}`);
  }
 );
 if(receipt?.attached){
  if(!equal(await sources(),receipt.attached))throw fail();
  log('이미 첨부된 사진 '+receipt.attached.length+'장 확인 · 다시 올리지 않음');
  if(!receipt.done)await finish();
  return;
 }
 if(receipt?.submitted){
  // A chooser timeout can occur after submission. Do not infer which files
  // were applied from just the slot count or send the same batch blindly.
  receipt.attached=await waitHosted(4000,files.map(file=>path.basename(file))).catch(error=>{
   if(error.code!=='SMARTSTORE_UI_DELAY')throw error;
   log(error.message);throw fail();
  });
  await finish();
  log('이전 시도에서 첨부된 사진 '+receipt.attached.length+'장 확인 · 다시 올리지 않음');
  return;
 }
 let existing=await sources();
 if(receipt?.cleared&&existing.length)throw fail();
 if(!receipt?.cleared&&replaceImages===true){
  const original=receipt?(receipt.original??=existing):existing;
  if(existing.length>original.length||!equal(existing,original.slice(original.length-existing.length)))throw fail();
  while(existing.length){
   check();const count=existing.length;
   await container.getByRole('button',{name:'이미지 삭제',exact:true}).first().click();
   const remaining=await waitForSources(images=>images.length<count,8000,()=>label+' 기존 사진 정리 확인 지연');
   if(remaining.length!==count-1||!equal(remaining,existing.slice(1)))throw fail();
   existing=remaining;
  }
  if(receipt)receipt.cleared=true;
 }else if(existing.length)throw Error('기존 '+id+' 이미지가 있어 덮어쓰지 않았습니다. 새 입력 화면에서 실행해 주세요.');
 if(!files?.length){if(receipt)receipt.attached=[];await finish();return;}
 const attach=await selectSmartstoreImageFile(page,container,{receipt,check,fileCount:files.length,log});
 check();if(receipt)receipt.submitted=true;
 let attached;
 try{await attach(files);log(`${label} 파일 ${files.length}장 선택 · 판매자 화면 반영 확인 중`);}
 catch(error){
  check();
  try{attached=await waitHosted(3000,files.map(file=>path.basename(file)));}
  catch(verificationError){if(verificationError.code!=='SMARTSTORE_UI_DELAY')throw verificationError;throw error;}
 }
 attached??=await waitHosted(60000);
 if(receipt)receipt.attached=attached;
 await finish();
 log(`${label} ${attached.length}장 · 판매자 화면 첨부 확인`);
}

export async function fillSmartstoreSellerCode(page,plan,{check=()=>{},log=()=>{}}={}){
 check();
 if(isSmartstoreDetailEditUrl(page.url())){
  const code=await readDetailOnlySellerCode(page);
  if(!/^\d{6}$/.test(plan.style||''))throw Error('전체 입력할 현재 품번을 확인해 주세요.');
  const next=prependSmartstoreSellerStyle(plan.style,code);
  if(next===code)return code;
  await fillSmartstoreValue(page.locator('#seller-code1'),next,check);log('현재 품번을 판매자 코드 앞에 추가 · 기존 코드 전체는 뒤에 보존');return next;
 }
 if(!/\/products\/copy\/\d+(?:[?]|$)/.test(page.url())||!isSmartstoreInputUrl(page.url()))throw Error('수정 또는 복사등록 화면에서 실행해 주세요.');
 const code=sellerProductCode(plan);await fillSmartstoreValue(page.locator('#seller-code1'),code,check);return code;
}

export function prependSmartstoreSellerStyle(style,existing){
 if(!/^\d{6}$/.test(style||''))throw Error('현재 품번 6자리를 확인해 주세요.');
 const code=String(existing??'');
 if(new RegExp('^'+style+'(?:\\D|$)').test(code))return code;
 return code.trim()?style+' (구)'+code:style;
}

export async function waitSmartstoreOptionGrid(page,expectedOptions,check=()=>{}){
 check();
 await page.waitForFunction(count=>Number(document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount'))===count+2,expectedOptions,{timeout:30000});
 await page.getByRole('button',{name:'선택목록 일괄수정',exact:true}).waitFor({state:'visible',timeout:30000});
 check();
}

export async function applySmartstoreBulkStock(page,plan,check=()=>{}){
 await waitSmartstoreOptionGrid(page,plan.expectedOptions,check);
 // The visible checkbox left of option numbers is separate from AG Grid's
 // hidden built-in checkbox. Re-select after rebuilding the option rows.
 const header=page.locator('[role="grid"] .ag-header input.ag-selection-checkbox');
 await header.waitFor({state:'attached',timeout:10000});
 const label=header.locator('..');
 if(await header.isChecked()){check();await label.click();}
 check();await label.click();
 if(!await header.isChecked())throw Error('옵션 전체선택 확인 실패');
 await page.waitForFunction(()=>{
  const rows=[...document.querySelectorAll('[role="grid"] [role="row"][row-index]')];
  return rows.length>0&&rows.every(row=>row.classList.contains('ag-row-selected')||row.getAttribute('aria-selected')==='true');
 },null,{timeout:15000});
 check();const stock=page.locator('input[ng-model="vm.bulkStockQuantity"]');
 await stock.fill(String(plan.stockPerOption));await stock.press('Tab');
 if((await stock.inputValue()).replaceAll(',','')!==String(plan.stockPerOption))throw Error('일괄 재고수량 입력 확인 실패');
 check();await page.getByRole('button',{name:'선택목록 일괄수정',exact:true}).click();
 await page.waitForFunction(expected=>{
  const cells=[...document.querySelectorAll('[role="grid"] [role="row"][row-index] [col-id="stockQuantity"]')];
  return cells.length>0&&cells.every(cell=>Number(cell.textContent.replaceAll(',','').trim())===expected);
 },plan.stockPerOption,{timeout:15000});
 check();
}
