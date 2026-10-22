import {BrowserAutomation} from './browser-connection.mjs';
import {fillSmartstore,smartstorePlan} from './smartstore-form.mjs';
import {prepareMainImage} from './main-image.mjs';
import path from 'node:path';
export class SmartstoreAutomation extends BrowserAutomation{
  async open(){
    await this.connectChrome('https://sell.smartstore.naver.com/#/products/create');
    const pages=this.context.pages().filter(p=>!p.isClosed());
    this.page=pages.find(p=>p.url().startsWith('https://sell.smartstore.naver.com/#/products/create'))||pages.find(p=>p.url().startsWith('https://accounts.commerce.naver.com/'))||pages.find(p=>p.url().startsWith('https://sell.smartstore.naver.com/'))||await this.context.newPage();
    if(!this.page.url().startsWith('https://sell.smartstore.naver.com/#/products/create')&&!this.page.url().startsWith('https://accounts.commerce.naver.com/')){
      if(/#\/products\/(?:update|edit)/.test(this.page.url()))throw Error('수정 중인 상품 화면이 있습니다. 별도 상품 등록 화면을 열어 주세요.');
      await this.page.goto('https://sell.smartstore.naver.com/#/products/create',{waitUntil:'domcontentloaded'});
    }
    this.page.setDefaultTimeout(8000);
    await this.page.bringToFront();this.log('스마트스토어 전용 크롬에 연결했습니다. 로그인 후 상품 등록 화면을 열어 주세요.');
  }
  async run(p,folder,salePrice,includeImages=false){
    this.stopped=false;const plan=smartstorePlan(p,salePrice);
    await this.open();
    try{await this.page.locator('input[name="product.name"]').waitFor({state:'visible',timeout:8000});}catch{const url=new URL(this.page.url());throw Error('등록기 전용 크롬에서 네이버 로그인 후 상품 등록 화면을 열고 다시 실행해 주세요. 현재 화면: '+url.origin+url.pathname+url.hash.split('?')[0]);}
    const assets=includeImages?{main:await prepareMainImage(folder),extras:[]}:null;
    for(const key of ['extra1','extra2'])if(assets&&p.images[key])assets.extras.push(await prepareMainImage(folder,key));
    const report=await fillSmartstore({playwright:this.page,url:()=>this.page.url()},plan,assets,this.log,()=>this.check());
    const {writeFile}=await import('node:fs/promises');
    await writeFile(path.join(folder,'smartstore-test-result.json'),JSON.stringify(report,null,2));
  }
}
