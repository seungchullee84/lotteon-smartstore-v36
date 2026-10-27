(()=>{
 const source=document.getElementById('detailPreview');if(!source)return;
 const button=document.createElement('button');button.id='openLargeDetailPreview';button.type='button';button.className='secondary detail-preview-enlarge';button.textContent='상세이미지 크게 보기 ↗';source.before(button);
 const dialog=document.createElement('dialog');dialog.id='largeDetailPreview';dialog.setAttribute('aria-labelledby','largeDetailPreviewTitle');
 const header=document.createElement('div');header.className='large-detail-header';const title=document.createElement('h2');title.id='largeDetailPreviewTitle';title.textContent='상세이미지 크게 보기';const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='닫기 ✕';close.setAttribute('aria-label','상세이미지 미리보기 닫기');header.append(title,close);
 const viewport=document.createElement('div');viewport.className='large-detail-viewport';dialog.append(header,viewport);document.body.append(dialog);
 let observer;
 const fit=()=>{const frame=viewport.querySelector('iframe');if(!frame)return;const scale=Math.min(1,viewport.clientWidth/860);if(!scale)return;frame.style.width='860px';frame.style.height=Math.ceil(viewport.clientHeight/scale)+'px';frame.style.transform='scale('+scale+')';};
 const bindEscape=frame=>{try{frame.contentDocument?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dialog.close();}});}catch{}};
 function open(){
  if(dialog.open||!source.children.length)return;
  viewport.replaceChildren();const frame=source.querySelector('iframe');
  if(frame){const large=document.createElement('iframe');large.title='확대된 상세이미지 미리보기';large.className='large-detail-frame';large.allow='autoplay; fullscreen; picture-in-picture';large.src=frame.src;large.onload=()=>bindEscape(large);viewport.append(large);}
  else for(const child of source.children){const clone=child.cloneNode(true);clone.removeAttribute('id');for(const image of [clone,...clone.querySelectorAll('img')])if(image.tagName==='IMG')image.loading='eager';viewport.append(clone);}
  dialog.showModal();close.focus();fit();observer=new ResizeObserver(fit);observer.observe(viewport);
 }
 button.onclick=open;close.onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>{observer?.disconnect();viewport.replaceChildren();button.focus({preventScroll:true});});
 source.addEventListener('click',event=>{if(event.target.closest('img'))open();});source.addEventListener('keydown',event=>{if(event.target===source&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open();}});
 const bound=new WeakSet();function bindFrames(){for(const frame of source.querySelectorAll('iframe')){if(bound.has(frame))continue;bound.add(frame);const bind=()=>{try{const doc=frame.contentDocument;if(!doc)return;doc.addEventListener('click',event=>{if(event.target.closest('img')){event.preventDefault();open();}});for(const image of doc.images)image.style.cursor='zoom-in';}catch{}};frame.addEventListener('load',bind);bind();}}
 new MutationObserver(()=>{if(dialog.open)dialog.close();bindFrames();}).observe(source,{childList:true});bindFrames();
})();
