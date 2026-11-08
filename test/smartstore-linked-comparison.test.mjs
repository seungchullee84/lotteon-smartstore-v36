import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { loadSmartstoreLinkedComparison, prependSmartstoreLinkedComparison, linkedComparisonPreview } from '../smartstore-linked-comparison.mjs';
import { commitSmartstoreEditor, validateSmartstoreProductPhotoLinks } from '../smartstore-detail-upload.mjs';

const urls = [
 'https://shopping.naver.com/window-products/department/12345678901',
 'https://shopping.naver.com/window-products/department/12345678902'
];
const styles = ['326921','326922'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('비교 제목과 사진을 별도 파일로 앞에 넣고 기존 영상·배너 위치를 보존한다', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(),'linked-comparison-test-'));
 const dir = path.join(root,'smartstore-details',styles[0],'linked-comparison');
 await mkdir(dir,{recursive:true});
 const base = {files:['detail.png','banner.png','footer.png'],videoAfterIndex:0,bannerLink:{index:1,file:'banner.png',url:'banner'},footerIndex:2,hash:'base'};
 assert.equal(prependSmartstoreLinkedComparison(base, await loadSmartstoreLinkedComparison(root,styles[1])),base);
 const parts = [];
 for (const [i, kind] of ['intro','photo','photo','detail'].entries()) {
  const bytes = await sharp({create:{width:100,height:100,channels:3,background:['white','red','blue','black'][i]}}).png().toBuffer();
  const name = 'comparison-'+i+'.png';
  await writeFile(path.join(dir,name),bytes);
  parts.push({kind,name,sha256:hash(bytes),...(kind==='photo'?{style:styles[i-1],purchaseLink:{style:styles[i-1],source:'user',url:urls[i-1]}}:{})});
 }
 const manifest = path.join(dir,'manifest.json');
 const save = () => writeFile(manifest,JSON.stringify({version:1,style:styles[0],parts}));
 await save();
 const bundle = await loadSmartstoreLinkedComparison(root,styles[0],{preview:true});
 const upload = prependSmartstoreLinkedComparison(base,bundle);
 assert.deepEqual(upload.files.map(file=>path.basename(file)),['comparison-0.png','comparison-1.png','comparison-2.png','comparison-3.png',...base.files]);
 assert.deepEqual([upload.videoAfterIndex,upload.bannerLink.index,upload.footerIndex],[4,5,6]);
 assert.deepEqual((await validateSmartstoreProductPhotoLinks(upload)).map(({index,style,url})=>[index,style,url]),[[1,styles[0],urls[0]],[2,styles[1],urls[1]]]);
 assert.notEqual(upload.hash,base.hash);
 const preview = linkedComparisonPreview(bundle);
 assert.match(preview, /사진을 누르면 해당 상품의 구매 페이지로 이동되요/);
 for(const url of urls)assert(preview.includes('href="'+url+'"'));
 parts[2].purchaseLink.url = urls[0]+'?NaPm=duplicate';
 await save();
 await assert.rejects(loadSmartstoreLinkedComparison(root,styles[0]),/같은 구매 주소/);
 parts[2].purchaseLink.url = urls[1];
 delete parts[1].purchaseLink;
 await save();
 const withoutSelfLink = await loadSmartstoreLinkedComparison(root,styles[0],{preview:true});
 const currentPage = prependSmartstoreLinkedComparison(base,withoutSelfLink);
 assert.deepEqual((await validateSmartstoreProductPhotoLinks(currentPage)).map(({index,style,url})=>[index,style,url]),[[2,styles[1],urls[1]]]);
 const currentPreview = linkedComparisonPreview(withoutSelfLink);
 assert.match(currentPreview,/aria-label="지금 보고 있는 상품 326921"/);
 assert(!currentPreview.includes('href="'+urls[0]+'"'));
 assert(currentPreview.includes('href="'+urls[1]+'"'));
 const alternativeLink = parts[2].purchaseLink;
 delete parts[2].purchaseLink;
 await save();
 await assert.rejects(loadSmartstoreLinkedComparison(root,styles[0]),/구매 주소 확인 자료/);
 parts[2].purchaseLink = alternativeLink;
 await save();
 await writeFile(path.join(dir,parts[2].name),'changed');
 await assert.rejects(loadSmartstoreLinkedComparison(root,styles[0]),/사진이 바뀌었습니다/);
 await assert.rejects(validateSmartstoreProductPhotoLinks(upload),/파일이 변경되었습니다/);
});

for (const visibleHref of [true,false]) test('독립 사진 두 장의 구매 링크를 확인하고 편집기를 열린 상태로 유지한다 ('+visibleHref+')', async () => {
 const browser=await chromium.launch({headless:true});
 try {
  const editor=await browser.newPage();
  await editor.route('https://example.test/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"/>'}));
  await editor.setContent(`
   <style>img{display:block;width:160px;height:100px}#panel{padding:10px;position:fixed;top:15px;left:100px;background:white}</style>
   <button data-name="image-link" onclick="panel.hidden=!panel.hidden;input.value=selected?.dataset.link||''">사진 링크</button>
   <div id="panel" hidden><input id="input" type="url" placeholder="URL"><button aria-label="적용" onclick="selected.dataset.link=input.value;if(${visibleHref})selected.parentElement.href=input.value;panel.hidden=true">적용</button></div>
   ${['intro',...styles].map(name=>`<div class="se-component se-image"><div class="se-component-content-fit"><a><img id="img${name}" src="https://example.test/${name}.png" onclick="event.preventDefault();selected=this;panel.hidden=true"></a></div></div>`).join('')}
   <button onclick="window.registered=true">등록</button><script>let selected;</script>`);
  const links = styles.map((style,i)=>({style,index:i+1,file:style+'.png',url:urls[i]}));
  const imageLinks=visibleHref ? links : links.slice(1);
  const result=await commitSmartstoreEditor(editor,editor,3,{imageLinks});
  assert.deepEqual(await editor.locator('img').evaluateAll(images=>images.map(img=>img.dataset.link||null)),[null,visibleHref ? urls[0] : null,urls[1]]);
  assert.equal(result.editorPrepared,true);
  assert.equal(result.editorApplied,false);
  assert.equal(result.saved,false);
  assert.equal(await editor.evaluate(()=>window.registered),undefined);
  assert.equal(editor.isClosed(),false);
 } finally { await browser.close(); }
});
