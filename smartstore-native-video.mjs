import {requireBrandVideo} from './smartstore-brand-video.mjs';

export async function nativeVideoIdentity(component){
 return component.evaluate(node=>{
  // ONE retains its document component ID across reentry, including while the
  // transcoder is still replacing the temporary thumbnail with a hosted image.
  const componentId=node.getAttribute('data-compid')||node.id;
  if(/^SE-[a-f0-9-]{36}$/i.test(componentId||''))return ['component:'+componentId];
  const ids=new Set();
  const scan=value=>{if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(/^(vid|videoId)$/i.test(key)&&typeof v==='string'&&v)ids.add(v);else if(v&&typeof v==='object')scan(v);}};
  for(const n of [node,...node.querySelectorAll('[data-module],[data-video-id],iframe,video')]){
   if(n.getAttribute('data-video-id'))ids.add(n.getAttribute('data-video-id'));
   try{scan(JSON.parse(n.getAttribute('data-module')));}catch{}
   if(n.matches('iframe,video'))try{const u=new URL(n.getAttribute('src'),location.href);const vid=u.searchParams.get('vid')||u.searchParams.get('videoId');if(vid)ids.add(vid);}catch{}
  }
  // ONE's edit surface exposes a native thumbnail instead of a player/vid attribute.
  // Its uploaded public resource is stable when the same document is reopened.
  if(!ids.size)for(const image of node.querySelectorAll('img.se-video-thumbnail-resource'))try{
   const u=new URL(image.src);if(u.protocol==='https:'&&u.hostname.endsWith('.pstatic.net'))ids.add('thumbnail:'+u.origin+u.pathname);
  }catch{}
  return [...ids].sort();
 });
}
export async function assertNativeVideoToolbar(editor){
 const toolbar=editor.locator('button[data-name="video"][data-group="documentToolbar"]');
 const button=await toolbar.count()===1?toolbar:editor.getByRole('button',{name:/^동영상$/});
 if(await button.count()!==1||!await button.isVisible())throw Error('ONE의 동영상 첨부 버튼을 확인하지 못했습니다. 기존 상세를 교체하지 않았습니다.');
 return button;
}

// Use ONE's file attachment UI. Never convert a localhost/file URL into seller HTML.
// Report success only after ONE creates a native component with a stable identity.
export async function insertNativeBrandVideo(editor,{check=()=>{},dataRoot,videoOptions,timeout=120000}={}){
 check();const {file,sha256}=await requireBrandVideo(dataRoot,videoOptions);
 const before=await editor.locator('.se-component.se-video').count();
 const originalPages=new Set(editor.context().pages());
 const button=await assertNativeVideoToolbar(editor);
 let toolbarChooser=null;const captureChooser=chooser=>{toolbarChooser=chooser;};
 // Some ONE versions open the native file chooser directly from the toolbar.
 // Register before clicking so this event cannot be missed while polling dialogs.
 editor.on('filechooser',captureChooser);
 try{
 await button.click();
 const deadline=Date.now()+timeout;let attached=false,completed=false;
 while(Date.now()<deadline){
  check();
  if(!attached&&toolbarChooser){await toolbarChooser.setFiles(file);attached=true;}
  const videos=editor.locator('.se-component.se-video');
  if(attached&&await videos.count()===before+1){
   await videos.last().scrollIntoViewIfNeeded();
   const identity=await nativeVideoIdentity(videos.last());
   if(identity.length)return {sha256,identity,storePlayback:'unverified'};
  }
  const popupPages=editor.context().pages().filter(p=>!originalPages.has(p)&&!p.isClosed());
  const scopes=[...popupPages.flatMap(p=>p.frames()),...editor.frames()];
  for(const scope of scopes){
   if(!attached){
    let inputs=scope.locator('input[type="file"][accept*="video"],input[type="file"][accept*=".mp4"]');
    // Some upload windows expose an untyped single file input. Only use it in a new video popup.
    if(!await inputs.count()&&popupPages.includes(scope.page())&&/동영상/.test(await scope.locator('body').innerText().catch(()=>'')))inputs=scope.locator('input[type="file"]');
    if(await inputs.count()===1){check();await inputs.setInputFiles(file);attached=true;break;}
    const uploader=scope.locator('#video-uploader-wrap');
    const add=uploader.getByRole('button',{name:'동영상 추가',exact:true});
    if(await add.count()===1&&await add.isVisible()){
     check();const [chooser]=await Promise.all([scope.page().waitForEvent('filechooser',{timeout:10000}),add.click()]);
     await chooser.setFiles(file);attached=true;break;
    }
   }else if(!completed){
    // Restrict completion to the upload dialog or popup, never the seller form's Register button.
    const uploader=scope.locator('#video-uploader-wrap');
    const nativeUploader=await uploader.count()===1&&await uploader.isVisible();
    const areas=nativeUploader?[uploader]:popupPages.includes(scope.page())?[scope]:await scope.getByRole('dialog').all();
    for(const area of areas){
     if(nativeUploader&&!await area.getByText('업로드 완료',{exact:true}).isVisible())continue;
     const done=area.getByRole('button',{name:/^(완료|올리기|동영상 올리기|첨부)$/});
     if(await done.count()===1&&await done.isVisible()&&await done.isEnabled()){
      check();await done.click();completed=true;break;
     }
    }
   }
  }
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 throw Error(attached?'MP4 첨부 후 네이버 동영상 식별자를 확인하지 못했습니다. 상품은 저장하지 않았습니다.':'MP4 첨부 창을 확인하지 못했습니다. 편집기에서 동영상 첨부를 확인해 주세요. 상품은 저장하지 않았습니다.');
 }finally{editor.off('filechooser',captureChooser);}
}
