import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {LotteAutomation} from './automation.mjs';
export async function connectAudit(){
 const root=path.resolve('data');
 const port=Number((await readFile(path.join(root,'browser-profile-chrome-v2/DevToolsActivePort'),'utf8')).split('\n')[0]);
 const bot=new LotteAutomation(root,console.log);
 bot.browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 bot.context=bot.browser.contexts()[0];
 bot.page=bot.context.pages().find(p=>p.url().startsWith('https://together.lotteshopping.com/'));
 if(!bot.page)throw Error('로그인된 롯데 페이지 없음');
 bot.page.setDefaultTimeout(8000);
 return bot;
}
