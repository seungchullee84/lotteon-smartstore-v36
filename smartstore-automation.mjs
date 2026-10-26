import {prepareCareLabelImages} from './smartstore-care-label.mjs';
import {BrowserAutomation} from './browser-connection.mjs';
import {fillSmartstore,smartstorePlan,isSmartstoreInputUrl} from './smartstore-form.mjs';
import {prepareListingImages} from './smartstore-listing-images.mjs';
import path from 'node:path';
import {researchForProduct} from './apparel-tag-research.mjs';
import {selectedProductTagResearch} from './smartstore-tag-selection.mjs';
import {fillResearchTags} from './smartstore-research-tags.mjs';
export const SMARTSTORE_HOME='https://sell.smartstore.naver.com/';
import {uploadSmartstoreDetail} from './smartstore-detail-upload.mjs';
import {readExistingPhotos} from './smartstore-photo-import.mjs';
import {bindSmartstoreDetailEdit,bindSmartstoreTwoChoiceEdit,twoChoiceSellerStyle,assertDetailOnlyProduct,readDetailOnlySellerCode,isSmartstoreDetailEditUrl} from './smartstore-detail-only.mjs';
export class SmartstoreAutomation extends BrowserAutomation{
  async uploadTwoChoiceDetail(bundle,{signal}={}){
    this.stopped=false;await this.connectChrome(SMARTSTORE_HOME);
    const {page,style}=await bindSmartstoreTwoChoiceEdit(this.context,bundle.manifest.products);this.page=page;const url=page.url();
    const check=()=>{this.check();signal?.throwIfAborted();if(page.isClosed()||page.url()!==url||!isSmartstoreDetailEditUrl(url))throw Error('조회/수정 화면이 변경되어 두 상품 상세 교체를 중단했습니다.');};
    check();if(twoChoiceSellerStyle(await readDetailOnlySellerCode(page),bundle.manifest.products)!==style)throw Error('판매자 상품코드가 변경되었습니다.');
    this.log('저장된 두 상품 상세 · 판매자 상품코드 '+style+' 일치 · 기존 구매옵션 유지');
    const result=await uploadSmartstoreDetail(page,bundle.parts,{check,log:this.log,mode:'edit',applyEditor:false});
    const {writeFile}=await import('node:fs/promises');await writeFile(path.join(bundle.folder,'last-upload-result.json'),JSON.stringify({...result,id:bundle.manifest.id,revision:bundle.manifest.revision,style,saved:false,published:false},null,2));return result;
  }
  async importExistingPhotos(product,{signal}={}){
    this.stopped=false;await this.connectChrome(SMARTSTORE_HOME);
    return readExistingPhotos(this.context,product,{log:this.log,check:()=>{this.check();signal?.throwIfAborted();}});
  }
  async preflightDetailOnly(product){
    this.stopped=false;await this.connectChrome(SMARTSTORE_HOME);
    this.page=await bindSmartstoreDetailEdit(this.context,product.style);
    this.detailOnlyFormUrl=this.page.url();
  }
  async updateDetailOnly(product,folder,parts){
    const page=this.page,url=this.detailOnlyFormUrl;
    const check=()=>{this.check();if(!page||page.isClosed()||page.url()!==url||!isSmartstoreDetailEditUrl(url))throw Error('조회/수정 화면이 변경되어 상세 교체를 중단했습니다.');};
    check();assertDetailOnlyProduct(await readDetailOnlySellerCode(page),product.style);
    this.log('상세 전용 상품 확인 · 판매자 상품코드 품번 '+product.style+' 일치 · 기존 코드 유지');
    const result=await uploadSmartstoreDetail(page,parts,{check,log:this.log,mode:'edit'});
    const {writeFile}=await import('node:fs/promises');
    await writeFile(path.join(folder,'smartstore-detail-only-result.json'),JSON.stringify({...result,style:product.style,detailOnly:true,saved:false,published:false},null,2));return result;
  }
  async preflight(){
    this.stopped=false;await this.bindCopyForm();
    const notice=this.page.locator('.modal-content').filter({hasText:'판매상품이 안전기준 준수 대상'});
    if(await notice.isVisible())await notice.getByRole('button',{name:'확인',exact:true}).click();
    try{await this.page.locator('input[name="product.name"]').waitFor({state:'visible',timeout:10000});}catch{throw Error('전용 크롬에서 스마트스토어 로그인 후 복사등록 화면을 열어 주세요.');}
    if(!/\/products\/copy\/\d+/.test(this.page.url()))throw Error('복사등록 화면에서 실행해 주세요.');
  }
  async uploadPrepared(p,folder,{main,extras,detailParts,careLabels=[]}){
    this.check();const plan={...smartstorePlan(p,p.consumerPrice),tagResearch:selectedProductTagResearch(p,{dataRoot:this.root})};
    if(!this.page||this.page.isClosed()||this.page.url()!==this.copyFormUrl||!/\/products\/copy\/\d+/.test(this.page.url()))throw Error('자동화 중 등록 화면이 변경됐습니다.');
    const check=()=>{this.check();if(this.page.isClosed()||this.page.url()!==this.copyFormUrl)throw Error('등록 화면이 변경되어 업로드를 중단했습니다.');};
    const report=await fillSmartstore({playwright:this.page,url:()=>this.page.url()},plan,{main,extras,careLabels,replaceImages:true,detail:true},this.log,check);
    check();const detail=await uploadSmartstoreDetail(this.page,detailParts,{check,log:this.log});
    const {writeFile}=await import('node:fs/promises');const result={...report,...detail,published:false};
    await writeFile(path.join(folder,'smartstore-auto-result.json'),JSON.stringify(result,null,2));return result;
  }
  async open(){
    await this.connectChrome(SMARTSTORE_HOME);
    const pages=this.context.pages().filter(p=>!p.isClosed());
    const previous=this.page&&!this.page.isClosed()&&this.page.url().startsWith(SMARTSTORE_HOME)?this.page:null;
    this.page=previous||pages.find(p=>p.url().startsWith(SMARTSTORE_HOME))||pages.find(p=>p.url().startsWith('https://accounts.commerce.naver.com/'))||await this.context.newPage();
    if(this.page.url()==='about:blank')await this.page.goto(SMARTSTORE_HOME,{waitUntil:'domcontentloaded'});
    this.page.setDefaultTimeout(8000);await this.page.bringToFront();
    this.log('스마트스토어 연결 · 원하는 상품의 복사등록 화면을 직접 선택한 뒤 등록기에서 시작을 누르세요.');
  }
  async runTags(product,{validateOnly=false,folder,research=selectedProductTagResearch(product,{dataRoot:this.root})}={}){
    this.stopped=false;await this.preflight();
    const url=this.copyFormUrl,check=()=>{this.check();if(this.page.isClosed()||this.page.url()!==url)throw Error('등록 화면이 변경되었습니다.');};
    const entered=await this.page.locator('input[name="product.name"]').inputValue();
    if(!validateOnly&&!entered.includes(product.style))throw Error('복사등록 화면의 상품명 품번이 현재 상품과 다릅니다. 태그 검증만 버튼으로 원래 태그를 보존하며 검증할 수 있습니다.');
    if(!validateOnly){const report=await fillResearchTags(this.page,research,this.log,check);return {...report,style:product.style,saved:false,published:false};}
    const tagField=this.page.getByRole('textbox',{name:'태그를 입력해주세요.',exact:true});
    if(!await tagField.isVisible()){check();await this.page.getByRole('button',{name:/^검색설정 도움말/}).click();}
    const selected=this.page.locator('span.choice-label').filter({has:this.page.locator('strong')});
    const read=()=>selected.evaluateAll(es=>es.map(e=>({name:e.querySelector('strong')?.textContent.replace(/^#\s*/,'').trim(),id:e.querySelector('.sub-text')?.textContent.replace(/\D/g,'')})));
    const original=await read();
    if(original.length>10||original.some(t=>!/^\d+$/.test(t.id)||!t.name))throw Error('원래 태그를 안전하게 복원할 수 있도록 사전 ID를 먼저 확인해 주세요.');
    const {writeFile}=await import('node:fs/promises');
    if(folder)await writeFile(path.join(folder,'tag-validation-original.json'),JSON.stringify({style:product.style,formTitle:entered,original},null,2));
    let report;
    try{report=await fillResearchTags(this.page,research,this.log,check);}
    finally{
      if(original.length)await fillResearchTags(this.page,{configured:true,candidates:original},()=>{},check,{verifySearch:false});
      else while(await selected.count()){check();await selected.last().getByRole('button').click();}
      const pairs=tags=>tags.map(t=>t.id+'\t'+t.name).sort();
      if(JSON.stringify(pairs(await read()))!==JSON.stringify(pairs(original)))throw Error('원래 태그 복원을 확인해 주세요. 복원 자료는 현재 상품 data 폴더에 보관했습니다.');
      if(await this.page.locator('input[name="product.name"]').inputValue()!==entered)throw Error('검증 중 상품명이 변경되었습니다.');
      this.log('태그 검증 종료 · 기존 폼의 태그 '+original.length+'개 복원 확인');
    }
    return {...report,style:product.style,validationOnly:true,originalTagsRestored:true,applied:false,saved:false,published:false};
  }
  async bindCopyForm(){
    await this.connectChrome(SMARTSTORE_HOME);
    const copies=this.context.pages().filter(p=>!p.isClosed()&&/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/copy\/\d+(?:[?]|$)/.test(p.url()));
    if(copies.length!==1)throw Error(copies.length?'복사등록 창이 여러 개입니다. 사용할 창 하나만 남긴 뒤 시작을 눌러 주세요.':'스마트스토어에서 원하는 상품의 복사등록 화면을 직접 열고 시작을 눌러 주세요.');
    this.page=copies[0];this.page.setDefaultTimeout(8000);await this.page.bringToFront();
    this.copyFormUrl=this.page.url();
  }
  async run(p,folder,salePrice,includeImages=false){
    this.stopped=false;const plan={...smartstorePlan(p,salePrice),tagResearch:selectedProductTagResearch(p,{dataRoot:this.root})};
    await this.open();
    try{await this.page.locator('input[name="product.name"]').waitFor({state:'visible',timeout:8000});}catch{const url=new URL(this.page.url());throw Error('등록기 전용 크롬에서 네이버 로그인 후 상품 등록 화면을 열고 다시 실행해 주세요. 현재 화면: '+url.origin+url.pathname+url.hash.split('?')[0]);}
    const selected=includeImages?await prepareListingImages(p,folder,{dataRoot:this.root}):null;
    const assets={...(selected?{main:selected.main,extras:selected.extras,replaceImages:true}:{}),careLabels:await prepareCareLabelImages(p,folder,{dataRoot:this.root})};
    const report=await fillSmartstore({playwright:this.page,url:()=>this.page.url()},plan,assets,this.log,()=>this.check());
    const {writeFile}=await import('node:fs/promises');
    await writeFile(path.join(folder,'smartstore-test-result.json'),JSON.stringify(report,null,2));
  }
}
