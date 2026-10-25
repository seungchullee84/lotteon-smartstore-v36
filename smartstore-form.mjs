export function isSmartstoreInputUrl(url){return /^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/(?:create(?:[?]|$)|copy\/\d+(?:[?]|$))/.test(url);}
import {buildSmartstoreDetail} from './smartstore-detail.mjs';
import {fillProductAttributes} from './smartstore-attributes.mjs';
import {smartstoreTitle,assertSmartstoreInputTitle} from './smartstore-title.mjs';
import {learnedFields,sellerProductCode} from './smartstore-learned.mjs';
import {researchForProduct} from './apparel-tag-research.mjs';
import {fillResearchTags} from './smartstore-research-tags.mjs';

export function smartstorePlan(p,salePrice){
  if(!/^\d{6}$/.test(p?.style))throw Error('먼저 상품을 수집해 주세요.');
  if(!Number.isSafeInteger(+salePrice)||+salePrice<10||+salePrice%10)throw Error('스마트스토어 테스트 판매가는 10원 단위로 입력해 주세요.');
  for(const key of ['name','country','material','washing','manufactured'])if(!p[key])throw Error('수집 정보를 확인해 주세요: '+key);
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.manufactured))throw Error('제조연월은 YYYY-MM 형식이어야 합니다.');
  if(!p.colors?.length||!p.sizes?.length)throw Error('색상과 사이즈가 필요합니다.');
  const category=null; // Keep the category selected in the copy form.
  if(!['미얀마','중국','베트남','방글라데시','인도네시아','캄보디아','인도','태국','필리핀','파키스탄','스리랑카','일본','대한민국','한국'].includes(p.country))throw Error('스마트스토어 제조국 선택을 먼저 검증해야 합니다.');
  return {style:p.style,rawName:p.rawName,officialDescription:p.officialDescription,sourceUrl:p.sourceUrl,reviewedGarmentAttributes:p.reviewedGarmentAttributes,name:smartstoreTitle(p),nameUserEdited:!!p.smartstoreNameUserEdited,salePrice:+salePrice,consumerPrice:+p.consumerPrice,category,colors:[...p.colors],sizes:[...p.sizes],stockPerOption:10,expectedOptions:p.colors.length*p.sizes.length,material:p.material,country:p.country,washing:p.washing,manufactured:p.manufactured,html:buildSmartstoreDetail(p).html,keywords:false,save:false};
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
  check();await page.locator('[role="gridcell"][col-id="optionName1"]').first().press('Control+Home');
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
export async function ensureSmartstoreOptionMode(page,check=()=>{}){
 const panel=page.locator('ui-view[name="option"]');
 const enabled=panel.locator('#option_choice_type_true'),enabledLabel=panel.locator('label[for="option_choice_type_true"]');
 // The styled radio itself can be hidden even when the whole option panel is open.
 if(!await enabledLabel.isVisible()){check();await panel.getByRole('button',{name:/^옵션 도움말/}).click();}
 await enabledLabel.waitFor({state:'visible'});
 if(!await enabled.isChecked()){check();await enabledLabel.click();}
 for(const name of ['직접 입력하기','조합형']){
  const radio=panel.getByRole('radio',{name,exact:true});await radio.waitFor({state:'attached'});
  if(!await radio.isChecked()){check();await radio.locator('..').click();}
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
 if(current===expected||current!=='<redacted>'&&String(current).replaceAll(',','')===expected.replaceAll(',','')&&/^\d[\d,]*$/.test(expected))return false;
 await loc.fill(expected);await loc.press('Tab');check();
 const actual=await loc.evaluate(e=>e.value);
 if(actual!=='<redacted>'&&String(actual).replaceAll(',','')!==expected.replaceAll(',',''))throw Error('입력값 확인 실패: '+expected.slice(0,50));
 return true;
}
export async function fillSmartstore(tab,plan,assets,log=()=>{},check=()=>{}){
  assertSmartstoreInputTitle(plan.name,plan.nameUserEdited);
  const page=tab.playwright;
  if(!isSmartstoreInputUrl(await tab.url()))throw Error('스마트스토어 로그인 후 상품 등록 화면을 열어 주세요.');
  if(!/\/products\/copy\/\d+/.test(await tab.url()))throw Error('기본설정을 복사한 복사등록 화면에서 실행해 주세요.');
  const learned=learnedFields(plan);
  const fill=(loc,value)=>fillSmartstoreValue(loc,value,check);
  const open=async(name,field)=>{if(!await field.isVisible())await page.getByRole('button',{name}).click();};
  log('스마트스토어 복사등록 입력 · 조사 자료 태그 자동입력 · 상품 저장/등록 안 함');
  log('카테고리 자동선택 중지 · 현재 선택된 분류 유지');
  await fill(page.locator('input[name="product.name"]'),plan.name);
  await fill(page.locator('#prd_price2'),plan.salePrice);
  log('상품명·테스트 판매가 '+plan.salePrice+'원 확인');
  const optionName=page.locator('#choice_option_name0');
  await ensureSmartstoreOptionMode(page,check);
  const optionCount=page.locator('input[ng-model="vm.choiceOptionNameCount"]').locator('..');
  if((await optionCount.locator('.selectize-input').innerText()).trim()!=='2개'){
    await optionCount.locator('.selectize-input').click();await optionCount.locator('.selectize-dropdown-content').getByText('2개',{exact:true}).click();
  }
  const same=await page.locator('#choice_option_value0').evaluate((e,values)=>e.value===values,plan.colors.join(','))&&await page.locator('#choice_option_value1').evaluate((e,values)=>e.value===values,plan.sizes.join(','))&&Number(await page.getByRole('grid').getAttribute('aria-rowcount'))===plan.expectedOptions+2;
  if(!same){
  await fill(optionName,'색상');await fill(page.locator('#choice_option_value0'),plan.colors.join(','));
  await fill(page.locator('#choice_option_name1'),'사이즈');await fill(page.locator('#choice_option_value1'),plan.sizes.join(','));
  await page.getByRole('button',{name:'옵션목록으로 적용',exact:true}).click();
  }
  const header=page.getByRole('grid').getByRole('checkbox');
  if(!await header.evaluate(e=>e.checked))await header.press('Space');
  if(!await header.evaluate(e=>e.checked))throw Error('옵션 전체선택 확인 실패');
  await fill(page.locator('input[ng-model="vm.bulkStockQuantity"]'),plan.stockPerOption);
  await page.getByRole('button',{name:'선택목록 일괄수정',exact:true}).click();
  const rows=await readSmartstoreOptionRows(page,plan,check);
  const verifiedOptions=verifySmartstoreOptions(plan,rows);
  log('색상 '+plan.colors.length+' × 사이즈 '+plan.sizes.length+' 옵션 조합 생성');
  if(assets&&(assets.main||Array.isArray(assets.extras))){await uploadSmartstoreImages(page,assets,check);log(assets.main?'대표·추가 이미지 업로드 완료':'추가이미지 정리 완료 · 대표이미지 교체 제외');}
  if(!assets?.detail)log('복사된 상세설명 유지 · 별도로 지시한 이미지 입력만 수행');
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
  const tagReport=await fillResearchTags(page,plan.tagResearch||researchForProduct(plan),log,check);
  const sellerCode=sellerProductCode(plan);
  await open(/^판매자 코드/,page.locator('#seller-code1'));
  await fill(page.locator('#seller-code1'),sellerCode);
  log('판매자 상품코드 확인: '+sellerCode+' · 바코드·내부코드 유지');
  await open(/^노출 채널/,page.locator('#material-detail'));
  await fill(page.locator('#material-detail'),learned.material);
  if(Object.hasOwn(assets||{},'careLabels')){await uploadSmartstoreImageSlot(page,'tagImages',assets.careLabels,{replaceImages:true},check);log(assets.careLabels.length?'현재 품번 택/케어라벨 '+assets.careLabels.length+'장 교체 완료':'품번 폴더에 택/케어라벨 없음 · 복사된 기존 라벨 삭제 완료');}
  log('소재(설명)에 현재 상품 소재·혼용률 입력 확인');
  log('소재·색상·치수·제조국·세탁방법 입력 · A/S·품질보증·미성년자 구매 기존값 유지');
  log('입력 테스트 완료 · '+verifiedOptions+'개 옵션 각 '+plan.stockPerOption+'개 재고 확인 · 저장/등록은 하지 않았습니다.');
  return {style:plan.style,salePrice:plan.salePrice,verifiedOptions,stockPerOption:plan.stockPerOption,manufactureDate,imagesSkipped:!assets,saved:false,keywordsTouched:false,...tagReport,sellerCode,origin};
}

export async function uploadSmartstoreImages(page,assets,check=()=>{}){
 const upload=(id,files)=>uploadSmartstoreImageSlot(page,id,files,assets,check);
 if(assets.main)await upload('representImage',[assets.main]);
 await upload('optionalImages',assets.extras);
}

export async function uploadSmartstoreImageSlot(page,id,files,{replaceImages=false}={},check=()=>{}){
    if(!files?.length&&!replaceImages)return;
    check();const container=page.locator('ncp-product-temp-photo-infra-image-upload#'+id);
    if(replaceImages===true){
      while(await container.locator('img').count()){
        check();const count=await container.locator('img').count();
        await container.getByRole('button',{name:'이미지 삭제',exact:true}).first().click();
        await page.waitForFunction(({id,count})=>document.querySelector('ncp-product-temp-photo-infra-image-upload#'+id).querySelectorAll('img').length<count,{id,count});
      }
    }else if(await container.locator('img').count())throw Error('기존 '+id+' 이미지가 있어 덮어쓰지 않았습니다. 새 입력 화면에서 실행해 주세요.');
    if(!files?.length)return;
    await container.getByRole('button',{name:'이미지 등록',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'내 사진',exact:true}).waitFor({state:'visible',timeout:15000});
    const choosing=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'내 사진',exact:true}).click();
    await (await choosing).setFiles(files);
    await container.locator('img').first().waitFor({state:'visible',timeout:30000});
    await page.waitForFunction(({id,count})=>{const images=[...document.querySelector('ncp-product-temp-photo-infra-image-upload#'+id).querySelectorAll('img')];return images.length===count&&images.every(n=>/naver\.net|pstatic\.net/.test(n.src));},{id,count:files.length},{timeout:60000});
    if(id==='tagImages'){
      const progress=page.locator('.modal-content').filter({hasText:'상품정보 추출 중입니다.'});
      if(await progress.isVisible())await progress.getByRole('button',{name:'확인',exact:true}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('.modal-content')].some(e=>e.getBoundingClientRect().height&&e.textContent.includes('택/케어라벨 이미지 분석 추출 결과'))||/분석실패|결과없음/.test(document.querySelector('ncp-product-temp-photo-infra-image-upload#tagImages')?.textContent||''),null,{timeout:60000});
      const result=page.locator('.modal-content').filter({hasText:'택/케어라벨 이미지 분석 추출 결과'});
      if(await result.isVisible()){check();await result.getByRole('button',{name:'닫기',exact:true}).click();await result.waitFor({state:'hidden'});}
    }
  }
