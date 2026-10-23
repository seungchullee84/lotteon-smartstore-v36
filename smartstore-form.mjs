export function isSmartstoreInputUrl(url){return /^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/(?:create(?:[?]|$)|copy\/\d+(?:[?]|$))/.test(url);}
import {buildDetailContent} from './detail-html.mjs';
import {smartstoreTitle} from './smartstore-title.mjs';
import {learnedFields,fillLearnedAttributes,fillDictionaryTags,sellerProductCode} from './smartstore-learned.mjs';

export function smartstorePlan(p,salePrice){
  if(!/^\d{6}$/.test(p?.style))throw Error('먼저 상품을 수집해 주세요.');
  if(!Number.isSafeInteger(+salePrice)||+salePrice<10||+salePrice%10)throw Error('스마트스토어 테스트 판매가는 10원 단위로 입력해 주세요.');
  for(const key of ['name','country','material','washing','manufactured'])if(!p[key])throw Error('수집 정보를 확인해 주세요: '+key);
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.manufactured))throw Error('제조연월은 YYYY-MM 형식이어야 합니다.');
  if(!p.colors?.length||!p.sizes?.length)throw Error('색상과 사이즈가 필요합니다.');
  const category=null; // Keep the category selected in the copy form.
  if(!['미얀마','중국','베트남','방글라데시','인도네시아','캄보디아','인도','태국','필리핀','파키스탄','스리랑카','일본','대한민국','한국'].includes(p.country))throw Error('스마트스토어 제조국 선택을 먼저 검증해야 합니다.');
  return {style:p.style,name:smartstoreTitle(p),salePrice:+salePrice,consumerPrice:+p.consumerPrice,category,colors:[...p.colors],sizes:[...p.sizes],stockPerOption:10,expectedOptions:p.colors.length*p.sizes.length,material:p.material,country:p.country,washing:p.washing,manufactured:p.manufactured,html:buildDetailContent(p.images,p.colors,p.colorImages,p.originalDetailUrl).html.replace('max-width:900px','max-width:848px'),keywords:false,save:false};
}

export function verifySmartstoreOptions(plan,rows){
  const seen=new Map();
  for(const row of rows){const key=row.color+'\t'+row.size;if(seen.has(key))throw Error('중복 옵션: '+key);seen.set(key,row.stock);}
  if(seen.size!==plan.expectedOptions)throw Error('옵션 개수가 다릅니다.');
  for(const color of plan.colors)for(const size of plan.sizes)if(seen.get(color+'\t'+size)!==plan.stockPerOption)throw Error('옵션 재고 확인 실패: '+color+' / '+size);
  return seen.size;
}

// The same visible-UI driver runs in the app's Playwright browser and in CUA tests.
// No save, temporary-save or publish action. Unspecified copied settings stay intact.
export async function fillSmartstore(tab,plan,assets,log=()=>{},check=()=>{}){
  const page=tab.playwright;
  if(!isSmartstoreInputUrl(await tab.url()))throw Error('스마트스토어 로그인 후 상품 등록 화면을 열어 주세요.');
  if(!/\/products\/copy\/\d+/.test(await tab.url()))throw Error('기본설정을 복사한 복사등록 화면에서 실행해 주세요.');
  const learned=learnedFields(plan);
  if(learned.tags.length!==10||!learned.sleeve||!learned.neckline)throw Error('이 상품의 태그 10개·소매기장·네크라인 규칙을 먼저 검토해 주세요.');
  const fill=async(loc,value)=>{check();await loc.fill(String(value));await loc.press('Tab');const actual=await loc.evaluate(e=>e.value);if(actual!=='<redacted>'&&String(actual).replaceAll(',','')!==String(value).replaceAll(',',''))throw Error('입력값 확인 실패: '+String(value).slice(0,50));};
  const open=async(name,field)=>{if(!await field.isVisible())await page.getByRole('button',{name}).click();};
  const selectize=async(model,text)=>{
    check();const box=page.locator(`select[ng-model="${model}"]`).locator('..');
    const current=await box.locator('.selectize-input').innerText();
    if(current.trim()===text)return;
    await box.locator('.selectize-input').click();
    await box.locator('.selectize-dropdown-content').getByText(text,{exact:true}).click();
    if((await box.locator('.selectize-input').innerText()).trim()!==text)throw Error('선택 확인 실패: '+text);
  };
  log('스마트스토어 복사등록 입력 · 사전 태그 검증 · 저장/등록 안 함');
  log('카테고리 자동선택 중지 · 현재 선택된 분류 유지');
  await fill(page.locator('input[name="product.name"]'),plan.name);
  await fill(page.locator('#prd_price2'),plan.salePrice);
  log('상품명·테스트 판매가 '+plan.salePrice+'원 확인');
  const optionName=page.locator('#choice_option_name0');
  if(!await page.locator('#option_choice_type_true').isVisible())await page.getByRole('button',{name:/^옵션 도움말/}).click();
  if(!await page.locator('#option_choice_type_true').evaluate(e=>e.checked))await page.locator('label[for="option_choice_type_true"]').click();
  for(const name of ['직접 입력하기','조합형']){const radio=page.getByRole('radio',{name,exact:true});if(!await radio.evaluate(e=>e.checked))await radio.locator('..').click();}
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
  const readRows=()=>page.locator('[role="row"][row-index]').evaluateAll(es=>es.filter(e=>e.querySelector('[col-id="optionName1"]')).map(e=>({color:e.querySelector('[col-id="optionName1"]').textContent.trim(),size:e.querySelector('[col-id="optionName2"]').textContent.trim(),stock:Number(e.querySelector('[col-id="stockQuantity"]').textContent.trim())})));
  const seen=new Map();const remember=rows=>rows.forEach(r=>seen.set(r.color+'\t'+r.size,r.stock));
  let cell=page.locator('[role="gridcell"][col-id="optionName1"]').first();await cell.press('Control+Home');
  await page.locator('[role="row"][row-index="0"] [col-id="optionName1"]').waitFor({state:'visible',timeout:8000});
  remember(await readRows());
  cell=page.locator('[role="gridcell"][col-id="optionName1"]').first();await cell.press('Control+End');
  await page.locator('[role="row"][row-index="'+(plan.expectedOptions-1)+'"] [col-id="optionName1"]').waitFor({state:'visible',timeout:8000});
  remember(await readRows());
  verifySmartstoreOptions(plan,[...seen].map(([key,stock])=>{const [color,size]=key.split('\t');return {color,size,stock};}));
  log('색상 '+plan.colors.length+' × 사이즈 '+plan.sizes.length+' 옵션 조합 생성');
  // Uploads only attach product images to the unsaved form.
  async function upload(id,files){
    if(!files?.length)return;
    check();const container=page.locator('#'+id);
    if(await container.locator('img').count())throw Error('기존 '+id+' 이미지가 있어 덮어쓰지 않았습니다. 새 입력 화면에서 실행해 주세요.');
    await container.getByRole('button',{name:'이미지 등록',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'내 사진',exact:true}).waitFor({state:'visible',timeout:15000});
    const choosing=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'내 사진',exact:true}).click();
    await (await choosing).setFiles(files);
    await container.locator('img').first().waitFor({state:'visible',timeout:30000});
  }
  if(assets){await upload('representImage',[assets.main]);await upload('optionalImages',assets.extras);log('대표·추가 이미지 업로드 완료');}
  log('복사된 상세설명 유지 · 별도로 지시한 이미지 입력만 수행');
  await open(/^상품 주요정보/,page.getByRole('textbox',{name:'품번',exact:true}));
  await fillLearnedAttributes(page,learned,check);
  if(plan.country==='대한민국'||plan.country==='한국')await selectize('vm.viewData.originAreaInfo.originAreaExposureType','국산');
  // Preserve an existing matching direct-entry origin; otherwise choose the actual country.
  const originText=page.locator('input').filter({visible:true});
  const hasCountry=await originText.evaluateAll((es,country)=>es.some(e=>e.value===country),plan.country);
  if(!hasCountry&&plan.country!=='대한민국'&&plan.country!=='한국'){
    await selectize('vm.viewData.originAreaInfo.originAreaExposureType','수입산');
    await selectize('vm.viewData.originAreaInfo.firstSubOriginAreaType','아시아');
    await selectize('vm.viewData.originAreaInfo.secondSubOriginAreaType',plan.country);
  }
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
  const tags=await fillDictionaryTags(page,learned.tags,log,check);
  const sellerCode=sellerProductCode(plan);
  await open(/^판매자 코드/,page.locator('#seller-code1'));
  await fill(page.locator('#seller-code1'),sellerCode);
  log('판매자 상품코드 확인: '+sellerCode+' · 바코드·내부코드 유지');
  await open(/^노출 채널/,page.locator('#material-detail'));
  await fill(page.locator('#material-detail'),learned.material);
  log('소재(설명)에 현재 상품 소재·혼용률 입력 확인');
  log('소재·색상·치수·제조국·세탁방법 입력 · A/S·품질보증·미성년자 구매 기존값 유지');
  log('입력 테스트 완료 · '+seen.size+'개 옵션 각 '+plan.stockPerOption+'개 재고 확인 · 저장/등록은 하지 않았습니다.');
  return {style:plan.style,salePrice:plan.salePrice,verifiedOptions:seen.size,stockPerOption:plan.stockPerOption,manufactureDate,imagesSkipped:!assets,saved:false,keywordsTouched:false,tags,searchTagsVerified:true,sellerCode};
}
