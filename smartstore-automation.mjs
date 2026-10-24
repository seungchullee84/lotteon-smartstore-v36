import {prepareCareLabelImages} from './smartstore-care-label.mjs';
import {BrowserAutomation} from './browser-connection.mjs';
import {fillSmartstore,smartstorePlan,isSmartstoreInputUrl} from './smartstore-form.mjs';
import {prepareListingImages} from './smartstore-listing-images.mjs';
import path from 'node:path';
export const SMARTSTORE_HOME='https://sell.smartstore.naver.com/';
import {uploadSmartstoreDetail} from './smartstore-detail-upload.mjs';
export class SmartstoreAutomation extends BrowserAutomation{
  async preflight(){
    this.stopped=false;await this.bindCopyForm();
    const notice=this.page.locator('.modal-content').filter({hasText:'판매상품이 안전기준 준수 대상'});
    if(await notice.isVisible())await notice.getByRole('button',{name:'확인',exact:true}).click();
    try{await this.page.locator('input[name="product.name"]').waitFor({state:'visible',timeout:10000});}catch{throw Error('전용 크롬에서 스마트스토어 로그인 후 복사등록 화면을 열어 주세요.');}
    if(!/\/products\/copy\/\d+/.test(this.page.url()))throw Error('복사등록 화면에서 실행해 주세요.');
  }
  async uploadPrepared(p,folder,{main,extras,detailParts,careLabels=[]}){
    this.check();const plan=smartstorePlan(p,p.consumerPrice);
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
  async bindCopyForm(){
    await this.connectChrome(SMARTSTORE_HOME);
    const copies=this.context.pages().filter(p=>!p.isClosed()&&/^https:\/\/sell\.smartstore\.naver\.com\/#\/products\/copy\/\d+(?:[?]|$)/.test(p.url()));
    if(copies.length!==1)throw Error(copies.length?'복사등록 창이 여러 개입니다. 사용할 창 하나만 남긴 뒤 시작을 눌러 주세요.':'스마트스토어에서 원하는 상품의 복사등록 화면을 직접 열고 시작을 눌러 주세요.');
    this.page=copies[0];this.page.setDefaultTimeout(8000);await this.page.bringToFront();
    this.copyFormUrl=this.page.url();
  }
  async run(p,folder,salePrice,includeImages=false){
    this.stopped=false;const plan=smartstorePlan(p,salePrice);
    await this.open();
    try{await this.page.locator('input[name="product.name"]').waitFor({state:'visible',timeout:8000});}catch{const url=new URL(this.page.url());throw Error('등록기 전용 크롬에서 네이버 로그인 후 상품 등록 화면을 열고 다시 실행해 주세요. 현재 화면: '+url.origin+url.pathname+url.hash.split('?')[0]);}
    const selected=includeImages?await prepareListingImages(p,folder,{dataRoot:this.root}):null;
    const assets={...(selected?{main:selected.main,extras:selected.extras,replaceImages:true}:{}),careLabels:await prepareCareLabelImages(p,folder,{dataRoot:this.root})};
    const report=await fillSmartstore({playwright:this.page,url:()=>this.page.url()},plan,assets,this.log,()=>this.check());
    const {writeFile}=await import('node:fs/promises');
    await writeFile(path.join(folder,'smartstore-test-result.json'),JSON.stringify(report,null,2));
  }
}
