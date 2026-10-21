import {connectAudit} from './audit-connection.mjs';
import {writeFile,readFile} from 'node:fs/promises';
const bot=await connectAudit();
let catalog={version:1,source:bot.page.url(),collectedAt:new Date().toISOString(),scope:'브랜드여성의류·브랜드남성의류 중·소·세분류',complete:false,majors:[]};
const file='data/category-catalog-standard.json';
try{const existing=JSON.parse(await readFile(file,'utf8'));if(!existing.complete){catalog=existing;delete catalog.error;}}catch{}
const grid=level=>bot.page.locator('[id$="grd_Dspctgr'+level+'_body"]').filter({visible:true}).last();
async function move(level,mode){
 const bar=bot.locator('grd_Dspctgr'+level+'_vscrollbar'),thumb=bot.locator('grd_Dspctgr'+level+'_vscrollbar_trackbar');
 if(!await bar.count()||!await thumb.count())return false;
 const b=await bar.boundingBox(),t=await thumb.boundingBox();if(!b||!t)return false;
 const min=b.y+13+t.height/2,max=b.y+b.height-13-t.height/2,from=t.y+t.height/2;
 if(max<=min)return false;
 const to=mode==='top'?min:Math.min(max,from+Math.max(10,t.height*.8));
 if(Math.abs(to-from)<1)return false;
 const before=await grid(level).innerText();
 await bot.smoothDrag(t.x+t.width/2,from,to,true);
 for(let n=0;n<8;n++){await bot.page.waitForTimeout(100);if(await grid(level).innerText()!==before)break;}
 return true;
}
function parse(text){const lines=text.split(/\n/).map(s=>s.trim()).filter(Boolean),out=[];for(let i=0;i<lines.length-1;i++)if(/^BC\d+$/.test(lines[i])&&!/^BC\d+$/.test(lines[i+1]))out.push({code:lines[i],name:lines[i+1]});return out;}
async function scan(level,select=null){
 const head=bot.locator('grd_Dspctgr'+level+'_head');await bot.reveal(head);
 await move(level,'top');const seen=new Map();let prev='',stale=0;
 for(let n=0;n<120;n++){
  const text=await grid(level).innerText();for(const item of parse(text))seen.set(item.code,item);
  if(select){const targets=grid(level).getByText(select.name,{exact:true});for(let i=0;i<await targets.count();i++){const target=targets.nth(i);const ready=await target.evaluate(e=>{const r=e.getBoundingClientRect(),hit=e.ownerDocument.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&!!hit&&(hit===e||e.contains(hit)||hit.contains(e));});if(ready){await target.click();await bot.settle();await bot.page.waitForTimeout(180);return;}}}
  stale=text===prev?stale+1:0;prev=text;
  if(stale>3)throw Error('목록 갱신 중단: '+level);
  if(!await move(level,'next')){if(select)throw Error('선택 항목 누락: '+select.name);return [...seen.values()];}
 }
 throw Error('목록 스캔 한도 초과: '+level);
}
try{
 for(const major of [{code:'BC34000000',name:'브랜드여성의류'},{code:'BC31000000',name:'브랜드남성의류'}]){
  await scan('L',major);let entry=catalog.majors.find(x=>x.code===major.code);if(!entry){entry={...major,middles:[]};catalog.majors.push(entry);}
  const middles=await scan('M');
  for(const middle of middles){
   let m=entry.middles.find(x=>x.code===middle.code);if(m?.complete)continue;await scan('M',middle);if(!m){m={...middle,smalls:[]};entry.middles.push(m);}
   const smalls=await scan('S');
   for(const small of smalls){
    if(m.smalls.some(x=>x.code===small.code))continue;
    await scan('S',small);const details=await scan('D');
    m.smalls.push({...small,details});
    await writeFile(file,JSON.stringify(catalog,null,2));
   }
   m.complete=true;await writeFile(file,JSON.stringify(catalog,null,2));console.log(major.name+' / '+middle.name+' / 소분류 '+m.smalls.length+'개');
  }
 }
 catalog.complete=true;catalog.completedAt=new Date().toISOString();
 await writeFile(file,JSON.stringify(catalog,null,2));
 // Restore the selection controls to the existing product's path; do not press Add/Save.
 await scan('L',{name:'브랜드남성의류'});await scan('M',{name:'점퍼/패딩/야상'});await scan('S',{name:'바람막이점퍼'});
 console.log('STANDARD_COMPLETE');process.exit(0);
}catch(e){catalog.error=e.message;await writeFile(file,JSON.stringify(catalog,null,2));console.error(e.message);process.exit(1);}
