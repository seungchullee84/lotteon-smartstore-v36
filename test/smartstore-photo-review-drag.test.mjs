import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('같은 색상 드래그는 순서를 저장·복원하며 다른 색상으로 이동하거나 대표·구도를 바꾸지 않는다',async()=>{
 const js=await readFile(new URL('../public/smartstore-photo-review.js',import.meta.url),'utf8'),css=await readFile(new URL('../public/smartstore-photo-review.css',import.meta.url),'utf8');
 const data={style:'123456',sourceUrl:'https://www.giordano.co.kr/shop/detail.php?pno=drag',revision:'test-revision',colors:['01화이트','02블랙'],mainId:'a',items:[{id:'a',name:'1.jpg',color:'01화이트',role:'detail',roleDefaulted:true,main:true},{id:'b',name:'2.jpg',color:'01화이트',role:'front',main:false},{id:'c',name:'3.jpg',color:'02블랙',role:'detail',roleDefaulted:true,main:false}]};let lastSaved;
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
 await page.goto('http://review.test/');await page.locator('#manualPhotoReviewOpen').click();const cards=page.locator('#manualPhotoReviewGrid > [data-photo-id]');await cards.first().waitFor();assert.equal(await cards.count(),3);
 const ids=()=>cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.photoId));assert.deepEqual(await ids(),['a','b','c']);
 const target=page.locator('[data-photo-id="a"]'),box=await target.boundingBox();await page.locator('[data-photo-id="b"]').dragTo(target,{targetPosition:{x:10,y:Math.min(100,box.height/2)}});assert.deepEqual(await ids(),['b','a','c']);
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/smartstore-photo-review-draft')),page.locator('#manualPhotoSelectionSave').click()]);assert.deepEqual(lastSaved.items.map(i=>i.id),['b','a','c']);assert.equal(lastSaved.mainId,'a');assert.equal(lastSaved.items.find(i=>i.id==='b').role,'front');
 await page.locator('[data-photo-id="b"]').dragTo(page.locator('[data-photo-id="c"]'));assert.deepEqual(await ids(),['b','a','c']);
 await page.locator('#manualPhotoReviewClose').click();await page.locator('#manualPhotoReviewOpen').click();await cards.first().waitFor();assert.deepEqual(await ids(),['b','a','c']);assert.equal(await page.locator('[data-photo-id="a"] input[type=radio]').isChecked(),true);await page.locator('[data-photo-id="a"] [data-field=order]').selectOption('1');assert.deepEqual(await ids(),['a','b','c']);await page.locator('[data-photo-id="a"] [data-field=role]').selectOption('back');assert.deepEqual(await ids(),['b','a','c']);assert.equal(await page.locator('[data-photo-id="b"] .photo-order-number').textContent(),'상세 순서 1');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
