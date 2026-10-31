function applyTemplateHeadlinePreview(){
 const input=document.getElementById('templateHeadline');if(!input||!product)return;
 for(const frame of document.querySelectorAll('#detailPreview iframe,#largeDetailPreview iframe')){
  try{
   const heading=frame.contentDocument?.querySelector('[data-template-main-title]');
   if(heading){
    heading.dataset.defaultMarkup??=heading.innerHTML;
    if(input.value.trim())heading.textContent=input.value.trim();
    else if(heading.dataset.templateDefaultTitle===heading.textContent||heading.dataset.defaultMarkup.includes('<span'))heading.innerHTML=heading.dataset.defaultMarkup;
    else heading.textContent=heading.dataset.templateDefaultTitle;
    heading.style.whiteSpace='pre-line';heading.style.overflowWrap='anywhere';
   }
   const url=new URL(frame.src,location.href),fields=JSON.parse(url.searchParams.get('fields')||'{}');
   fields.templateHeadline=input.value;url.searchParams.set('fields',JSON.stringify(fields));frame.dataset.previewUrl=url.href;
  }catch{}
 }
}
(()=>{
 const input=document.getElementById('templateHeadline'),reset=document.getElementById('resetTemplateHeadline'),status=document.getElementById('templateHeadlineStatus');
 let timer,pending=null,writes=Promise.resolve(),editing=false;
 function schedule(){clearTimeout(timer);timer=setTimeout(save,450);}
 function save(){
  clearTimeout(timer);if(!pending)return;
  if(serverBusy||requestLock){status.textContent='미리보기 반영됨 · 작업 종료 후 자동 저장';schedule();return;}
  const request=pending;pending=null;
  writes=writes.catch(()=>{}).then(async()=>{
   try{
    await post('smartstore-template-headline',{...request,channel:'smartstore'});
    if(product?.style===request.style&&input.value===request.title&&!pending)status.textContent='미리보기 반영 · 품번 '+request.style+' 저장됨';
   }catch(error){if(product?.style===request.style&&input.value===request.title&&!pending)status.textContent='이 브라우저에 보관됨 · 서버 저장 확인 필요: '+error.message;}
  });
 }
 function changed(event){
  if(!product)return;
  rememberProductField('templateHeadline',input.value);product.templateHeadline=input.value;
  pending={style:product.style,sourceUrl:product.sourceUrl,title:input.value};
  applyTemplateHeadlinePreview();status.textContent=(input.value.trim()?'직접 입력한 제목 반영':'자동 제목 반영')+' · 저장 중…';
  if(!editing&&!event?.isComposing)schedule();
 }
 input.addEventListener('compositionstart',()=>{editing=true;clearTimeout(timer);});
 input.addEventListener('compositionend',()=>{editing=false;changed();});
 input.addEventListener('input',changed);input.addEventListener('blur',save);
 reset.onclick=()=>{input.value='';changed();save();input.focus();};
 const previousPopulate=populate;
 populate=function(p){
  if(pending&&pending.style!==p.style)save();
  previousPopulate(p);status.textContent=(input.value.trim()?'직접 입력한 제목':'자동 제목')+' · 품번 '+p.style;
  applyTemplateHeadlinePreview();
 };
 if(product){input.value=editedValuesFor(product).templateHeadline??product.templateHeadline??'';applyTemplateHeadlinePreview();}
})();
