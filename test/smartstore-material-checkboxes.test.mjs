import test from'node:test';import assert from'node:assert/strict';import{chromium}from'playwright';import{setAttributeCheckboxes}from'../smartstore-attribute-checkboxes.mjs';import{learnedFields}from'../smartstore-learned.mjs';
test('소재 선택은 순서가 바뀌고 클릭 후 늦게 갱신되어도 항목 이름으로 확인한다',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent(`<input id="cotton" type="checkbox"><label for="cotton">다른 영역</label><table aria-label="상품속성 선택 테이블"><tr><th>주요소재</th><td id="choices"></td></tr></table><script>
 window.materials=[{id:'cotton',name:'면',checked:false},{id:'poly',name:'폴리에스테르',checked:false},{id:'fleece',name:'기모',checked:true}];
 window.draw=()=>{document.querySelector('#choices').innerHTML=window.materials.map(m=>'<span><input type="checkbox" id="'+m.id+'" aria-label="'+m.name+'" '+(m.checked?'checked':'')+' onclick="return update(this.id)"><label for="'+m.id+'">'+m.name+'</label></span>').join('');};
 window.update=id=>{setTimeout(()=>{const m=window.materials.find(m=>m.id===id);m.checked=!m.checked;window.materials.reverse();draw();},120);return false;};draw();
 </script>`);
 const row=page.getByRole('table',{name:'상품속성 선택 테이블'}).getByRole('row');
 assert.deepEqual((await setAttributeCheckboxes(row,['면','폴리에스테르','기모'])).sort(),['기모','면','폴리에스테르'].sort());
 assert.equal(await page.locator('body>input').isChecked(),false,'같은 ID가 다른 영역에 있어도 클릭하지 않음');
 assert.deepEqual((await setAttributeCheckboxes(row,['면','폴리에스테르'])).sort(),['면','폴리에스테르'].sort());
 }finally{await browser.close();}
});
test('기모는 공식 원문 근거가 있을 때만 소재 선택 후보에 포함한다',()=>{
 assert(learnedFields({material:'면 60%, 폴리에스터 40%',officialDescription:'안쪽 기모 가공'}).materials.includes('기모'));
 assert(!learnedFields({name:'사용자가 입력한 기모',material:'면 60%, 폴리에스터 40%'}).materials.includes('기모'));
});
