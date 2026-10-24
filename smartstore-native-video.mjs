import {requireBrandVideo} from './smartstore-brand-video.mjs';

export async function nativeVideoIdentity(component){
 return component.evaluate(node=>{
  const ids=new Set();
  const scan=value=>{if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(/^(vid|videoId)$/i.test(key)&&typeof v==='string'&&v)ids.add(v);else if(v&&typeof v==='object')scan(v);}};
  for(const n of [node,...node.querySelectorAll('[data-module],[data-video-id],iframe,video')]){
   if(n.getAttribute('data-video-id'))ids.add(n.getAttribute('data-video-id'));
   try{scan(JSON.parse(n.getAttribute('data-module')));}catch{}
   if(n.matches('iframe,video'))try{const u=new URL(n.getAttribute('src'),location.href);const vid=u.searchParams.get('vid')||u.searchParams.get('videoId');if(vid)ids.add(vid);}catch{}
  }
  return [...ids].sort();
 });
}
export async function assertNativeVideoToolbar(editor){
 const button=editor.getByRole('button',{name:/^동영상$/});
 if(await button.count()!==1||!await button.isVisible())throw Error('ONE의 동영상 첨부 버튼을 확인하지 못했습니다. 기존 상세를 교체하지 않았습니다.');
 return button;
}

// Use ONE's file attachment UI. Never convert a localhost/file URL into seller HTML.
// The live SmartStore uploader remains unverified until its native component is observed.
export async function insertNativeBrandVideo(editor,{check=()=>{},dataRoot,videoOptions,timeout=120000}={}){
 check();const {file,sha256}=await requireBrandVideo(dataRoot,videoOptions);
 const before=await editor.locator('.se-component.se-video').count();
 const originalPages=new Set(editor.context().pages());
 const button=await assertNativeVideoToolbar(editor);await button.click();
 const deadline=Date.now()+timeout;let attached=false,completed=false;
 while(Date.now()<deadline){
  check();
  const videos=editor.locator('.se-component.se-video');
  if(attached&&await videos.count()===before+1){
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
    const add=scope.getByRole('button',{name:'동영상 추가',exact:true});
    if(await add.count()===1&&await add.isVisible()){check();await add.click();break;}
   }else if(!completed){
    // Restrict completion to the upload dialog or popup, never the seller form's Register button.
    const areas=popupPages.includes(scope.page())?[scope]:await scope.getByRole('dialog').all();
    for(const area of areas){
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
}
