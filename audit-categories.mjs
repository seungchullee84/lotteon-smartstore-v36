import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {LotteAutomation} from './automation.mjs';

const root=path.resolve('data');
const port=Number((await readFile(path.join(root,'browser-profile-chrome-v2','DevToolsActivePort'),'utf8')).split('\n')[0]);
const bot=new LotteAutomation(root,console.log);
bot.browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
bot.context=bot.browser.contexts()[0];
bot.page=bot.context.pages().find(p=>p.url().startsWith('https://together.lotteshopping.com/'));
if(!bot.page)throw Error('로그인된 롯데 창 없음');
bot.page.setDefaultTimeout(8000);
const output=path.join(root,'category-catalog-common.json');
const catalog={collectedAt:new Date().toISOString(),source:bot.page.url(),kind:'공통 상품분류 드롭다운',genders:[]};
async function labels(suffix){
 const input=bot.locator(suffix+'_comboedit_input');await bot.reveal(input);
 await bot.locator(suffix+'_dropbutton').click();
 const list=bot.page.locator('[id$="'+suffix+'_combolistScrollableContainerElement"]').filter({visible:true}).last();
 await list.waitFor({state:'visible'});
 const seen=new Set();let unchanged=0;
 for(let n=0;n<120;n++){
  const before=seen.size;for(const label of await bot.comboLabels(list))seen.add(label);
  unchanged=seen.size===before?unchanged+1:0;
  if(unchanged>=3)throw Error('목록 갱신 확인 실패: '+suffix);
  if(!await bot.scrollComboList(list))break;
 }
 await bot.page.keyboard.press('Escape');
 return [...seen].filter(x=>!/^[-]*(전체|선택)[-]*$/.test(x));
}
try{
 let popup=bot.page.locator('[id$="rppluClsf"]').filter({visible:true});
 if(!await popup.count()){
  const button=bot.locator('btn_RppluClsfP');await bot.click(button);await bot.settle();
  if(!await popup.locator('input').count()){
   await bot.combo('cbo_Prdc','파트너오피스');await bot.textClick('신규');await bot.settle();await bot.click(button);await bot.settle();
  }
 }
 for(const [gender,major] of [['남성','L0014 : 남성의류'],['여성','L0011 : 여성의류']]){
  await bot.combo('cobPrdcClsfLCd',major);
  const middles=await labels('cobPrdcClsfMCd');
  const group={gender,major,middles:[]};catalog.genders.push(group);
  for(const middle of middles){
   await bot.combo('cobPrdcClsfMCd',middle);
   const children=await labels('cobPrdcClsfSCd');group.middles.push({middle,children});
   await writeFile(output,JSON.stringify(catalog,null,2));
   console.log(gender+' / '+middle+' / '+children.length+'개');
  }
 }
 await bot.textClick('취소',popup);
 console.log('COMMON_COMPLETE '+catalog.genders.reduce((n,g)=>n+g.middles.reduce((m,x)=>m+x.children.length,0),0));
 process.exit(0);
}catch(e){await writeFile(output,JSON.stringify({...catalog,incomplete:true,error:e.message},null,2));console.error(e.message);process.exit(1);}
