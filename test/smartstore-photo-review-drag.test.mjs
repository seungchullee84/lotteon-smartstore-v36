import sharp from 'sharp';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('같은 색상 드래그는 순서를 저장·복원하며 1번은 정면으로 지정하고 다른 색상·대표 선택은 바꾸지 않는다',async()=>{
 const js=await readFile(new URL('../public/smartstore-photo-review.js',import.meta.url),'utf8'),css=await readFile(new URL('../public/smartstore-photo-review.css',import.meta.url),'utf8');
 const data={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=drag',revision:'test-revision',colors:['01화이트','02블랙'],mainId:'a',items:[{id:'a',name:'1.jpg',color:'01화이트',role:'detail',roleDefaulted:true,main:true},{id:'b',name:'2.jpg',color:'01화이트',role:'side',main:false},{id:'c',name:'3.jpg',color:'02블랙',role:'detail',roleDefaulted:true,main:false}]};let lastSaved;
 const chipBytes=await sharp({create:{width:12,height:12,channels:3,background:'white'}}).jpeg().toBuffer();data.colorChips={'01화이트':{color:'#ffffff',image:'data:image/jpeg;base64,'+chipBytes.toString('base64')},'02블랙':{color:'#000000',image:'data:image/jpeg;base64,'+chipBytes.toString('base64')}};
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://review.test/**',async route=>{const url=new URL(route.request().url());let body={},type='application/json';
 if(url.pathname==='/'){type='text/html';body='<meta charset="utf-8"><div id="photoPreparationStatus"></div><div id="error"></div><script>window.activeChannel=()=>"smartstore";</script><script src="/smartstore-photo-review.js"></script>';}
 else if(url.pathname==='/smartstore-photo-review.js'){body=js;type='text/javascript';}else if(url.pathname==='/smartstore-photo-review.css'){body=css;type='text/css';}
 else if(url.pathname==='/api/state')body={busy:false,product:{style:data.style}};
 else if(url.pathname==='/api/smartstore-photo-review')body=data;
 else if(url.pathname==='/api/smartstore-point-picker')body={style:data.style,candidates:[],selectedIds:[],message:''};
 else if(url.pathname==='/api/smartstore-photo-review-draft'){lastSaved=route.request().postDataJSON();data.items=lastSaved.items.map(i=>({...data.items.find(v=>v.id===i.id),...i}));data.selectionSavedAt=new Date().toISOString();body={savedAt:data.selectionSavedAt};}
 else if(url.pathname.startsWith('/smartstore-review-photo/')){type='image/png';body=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOt0AAAAASUVORK5CYII=','base64');}
 return route.fulfill({status:200,contentType:type,body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});});
 await page.goto('http://review.test/');await page.locator('#manualPhotoReviewOpen').click();const cards=page.locator('#manualPhotoReviewGrid > [data-photo-id]');await cards.first().waitFor();assert.equal(await cards.count(),3);assert.equal(await page.locator('#manualPhotoReviewLegend .photo-official-chip').count(),2);assert.equal(await page.locator('[data-photo-id="a"] .photo-color-badge .photo-official-chip').count(),1);assert.equal(await page.locator('[data-photo-id="c"]').evaluate(n=>n.style.getPropertyValue('--photo-accent')),'#000000');
 const ids=()=>cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.photoId));assert.deepEqual(await ids(),['a','b','c']);
 assert.equal(await page.locator('#manualPhotoSelectionSave').count(),0);assert.equal(await page.locator('#manualPhotoReviewApply').isVisible(),true);assert.equal(await page.locator('#manualPhotoReviewApply').count(),1);
 const autosaved=page.waitForResponse(r=>r.url().endsWith('/api/smartstore-photo-review-draft'));
 const target=page.locator('[data-photo-id="a"]'),box=await target.boundingBox();await page.locator('[data-photo-id="b"]').dragTo(target,{targetPosition:{x:10,y:Math.min(100,box.height/2)}});assert.deepEqual(await ids(),['b','a','c']);
 await autosaved;assert.deepEqual(lastSaved.items.map(i=>i.id),['b','a','c']);assert.equal(lastSaved.mainId,'a');assert.equal(lastSaved.items.find(i=>i.id==='b').role,'front');assert.equal(lastSaved.items.find(i=>i.id==='a').role,'side');
 await page.locator('[data-photo-id="b"]').dragTo(page.locator('[data-photo-id="c"]'));assert.deepEqual(await ids(),['b','a','c']);
 await page.locator('#manualPhotoReviewClose').click();await page.locator('#manualPhotoReviewOpen').click();await cards.first().waitFor();assert.deepEqual(await ids(),['b','a','c']);assert.equal(await page.locator('[data-photo-id="a"] input[type=radio]').isChecked(),true);await page.locator('[data-photo-id="a"]').dragTo(page.locator('[data-photo-id="b"]'),{targetPosition:{x:10,y:100}});assert.deepEqual(await ids(),['a','b','c']);assert.equal(await page.locator('[data-photo-id="a"] [data-field=role]').inputValue(),'front');assert.equal(await page.locator('[data-photo-id="c"] [data-field=role]').inputValue(),'front');await page.locator('[data-photo-id="a"] [data-field=role]').selectOption('back');assert.deepEqual(await ids(),['a','b','c']);assert.equal(await page.locator('[data-photo-id="b"] [data-field=role]').inputValue(),'side');assert.equal(await page.locator('[data-field=order]').count(),0);
 // A color edit updates only labels; the photo nodes, focus and viewport stay put.
 const colorSelect=page.locator('[data-photo-id="a"] [data-field=color]');await colorSelect.focus();
 const before=await cards.evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.photoId,x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
 await page.evaluate(()=>{window.cardMoves=0;window.watchCards=new MutationObserver(records=>{for(const r of records)for(const n of [...r.addedNodes,...r.removedNodes])if(n.nodeType===1&&n.matches('[data-photo-id]'))window.cardMoves++;});window.watchCards.observe(document.querySelector('#manualPhotoReviewGrid'),{childList:true});});
 const colorSaved=page.waitForResponse(r=>r.url().endsWith('/api/smartstore-photo-review-draft'));
 await colorSelect.selectOption('02블랙');assert.deepEqual(await ids(),['a','b','c']);
 assert.deepEqual(await cards.evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.photoId,x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y}))),before);
 assert.equal(await colorSelect.evaluate(n=>n===document.activeElement),true);assert.equal(await page.evaluate(()=>window.cardMoves),0);
 assert.equal(await page.locator('[data-photo-id="c"] [data-field=role]').inputValue(),'side');await colorSaved;
 await page.locator('#manualPhotoReviewClose').click();await page.locator('#manualPhotoReviewOpen').click();await cards.first().waitFor();assert.deepEqual(await ids(),['b','a','c']);
 await page.locator('[data-photo-id="b"] [data-field=color]').selectOption('02블랙');assert.match(await page.locator('#manualPhotoReviewLegend [data-color="01화이트"]').textContent(),/0장.*사진 없음/);
 // A late automatic label suggestion replaces an untouched default role, without moving cards.
 await page.locator('[data-photo-id="c"] [data-field=color]').selectOption('');
 await page.evaluate(()=>{const c=document.querySelector('[data-photo-id="c"]');c.dataset.colorOverride='false';c.dataset.roleOverride='false';});
 data.items.find(i=>i.id==='c').role='care-label';data.items.find(i=>i.id==='c').color='';
 await page.evaluate(style=>document.dispatchEvent(new CustomEvent('register-state',{detail:{photoColorDraft:{style,status:'ready',updatedAt:'test-ready',message:'자동 구분 완료'}}})),data.style);
 await page.waitForFunction(()=>document.querySelector('[data-photo-id="c"] [data-field=role]').value==='care-label');assert.deepEqual(await ids(),['b','a','c']);
 const headings=page.locator('#manualPhotoReviewGrid .photo-group-heading');
 await page.locator('#manualPhotoReviewSort').click();
 assert.deepEqual(await headings.allTextContents(),['02블랙','케어라벨']);

 // A saved list may interleave colors. A four-card row leaves the fifth on its own line.
 await page.locator('#manualPhotoReviewClose').click();
 data.revision='test-layout-revision';
 data.items=['a','b','c','d','e','f'].map((id,index)=>({
  id,name:id+'.jpg',color:index===1?'02블랙':'01화이트',role:'detail',main:index===0,
 }));
 await page.locator('#manualPhotoReviewOpen').click();await cards.first().waitFor();
 assert.deepEqual(await ids(),['a','c','d','e','f','b']);
 assert.deepEqual(await headings.allTextContents(),['01화이트','02블랙']);
 const layout=await cards.evaluateAll(nodes=>nodes.map(n=>({left:n.offsetLeft,top:n.offsetTop})));
 assert.equal(new Set(layout.slice(0,4).map(card=>card.top)).size,1);
 assert.equal(new Set(layout.slice(0,4).map(card=>card.left)).size,4);
 assert.equal(layout[4].left,layout[0].left);
 assert.ok(layout[4].top>layout[0].top&&layout[5].top>layout[4].top);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
