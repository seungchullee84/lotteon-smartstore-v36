// Inline registrar edits only; the collected automatic category remains the default.
(()=>{
 const byId=id=>document.getElementById(id),panel=byId('lotteCategoryValidation');if(!panel)return;
 const labels=['대분류','중분류','소분류','세분류'],commonKeys=['commonMajor','commonMiddle','commonSmall'];
 const channelKeys=['channelMajor','channelMiddle','channelSmall','channelDetail'],levels=['major','middle','small','detail'];
 const clean=value=>String(value||'').replace(/^[A-Z0-9]+\s*[:：]\s*/i,'').replace(/\s/g,'');
 const controls={common:[],channel:[]};
 let catalog=null,loading=false,loadError='',snapshot=null,signature='',automatic=null;
 let draft={common:[],channel:[]},dirty=false,pending=false,saving=false,epoch=0,operation=null,saveError='';
 const note=document.createElement('div');note.className='lotte-category-inline-note';
 const hint=document.createElement('p');hint.id='lotteCategoryInlineMessage';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='선택 취소';
 const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='다시 반영';
 note.append(hint,cancel,retry);panel.querySelector('.lotte-category-flow')?.after(note);if(!note.isConnected)panel.append(note);
 for(const [kind,count,id] of [['common',3,'lotteCategoryCommonPath'],['channel',4,'lotteCategoryChannelPath']]){
  const container=byId(id);container.replaceChildren();container.classList.add('lotte-category-levels');container.dataset.inlineCategory='true';container.removeAttribute('title');
  for(let index=0;index<count;index++){
   const field=document.createElement('label');field.className='lotte-category-level';
   const label=document.createElement('span');label.className='lotte-category-level-label';label.textContent=labels[index];
   const select=document.createElement('select');select.id='lotteCategory'+(kind==='common'?'Common':'Channel')+index;
   select.className='lotte-category-inline-select';select.setAttribute('aria-label',(kind==='common'?'1차 ':'2차 ')+labels[index]);
   select.setAttribute('aria-describedby',hint.id);select.addEventListener('change',()=>change(kind,index,select.value));
   const choice=document.createElement('span');choice.className='lotte-category-inline-choice';
   const value=document.createElement('span');value.className='lotte-category-inline-value';value.setAttribute('aria-hidden','true');
   choice.append(value,select);field.append(label,choice);container.append(field);controls[kind].push(select);
  }
 }
 function editable(){
  const now=lotteCategorySnapshot(),input=String(now?.input||'').trim();
  return !!now&&activeChannel()==='lotte'&&!serverBusy&&(!/^\d{6}$/.test(input)||input===now.style);
 }
 function current(){
  if(!snapshot||!editable())return false;
  const now=lotteCategorySnapshot();if(JSON.stringify(now)===signature)return true;
  // Polling can receive our own saved category before the POST acknowledgement.
  if(!saving||['style','sourceUrl','input','gender','name'].some(key=>now[key]!==snapshot[key])||!now.category.manualSelection)return false;
  return commonKeys.every((key,i)=>(String(now.category[key]||'').match(/^([A-Z0-9]+)\s*[:：]/i)?.[1]||'')===draft.common[i])&&
   levels.every((key,i)=>(now.category.channelCodes?.[key]||'')===(draft.channel[i]||''));
 }
 function stopAutomaticCheck(){clearTimeout(lotteCategoryTimer);++lotteCategoryRequest;lotteCategoryPending=false;}
 function selectedNodes(kind){
  const nodes=[];let siblings=catalog?.[kind]||[];
  for(const code of draft[kind]){const node=siblings.find(item=>item.code===code);if(!node)break;nodes.push(node);siblings=node.children||[];}
  return nodes;
 }
 function complete(kind){const nodes=selectedNodes(kind);return kind==='common'?nodes.length===3:nodes.length>=3&&!(nodes.at(-1)?.children||[]).length;}
 function readPath(kind,category){
  let siblings=catalog?.[kind]||[];draft[kind]=[];
  for(const [index,key] of (kind==='common'?commonKeys:channelKeys).entries()){
   const value=category[key]||(kind==='common'&&index===0?snapshot?.gender+'의류':'');
   const code=kind==='common'?String(value).match(/^([A-Z0-9]+)\s*[:：]/i)?.[1]:category.channelCodes?.[levels[index]];
   const item=siblings.find(node=>(!code||node.code===code)&&(!value||clean(node.name)===clean(value))&&(code||value));
   if(!item)break;draft[kind].push(item.code);siblings=item.children||[];
  }
 }
 function render(){
  for(const kind of ['common','channel']){
   let siblings=catalog?.[kind]||[];
   for(const [index,select] of controls[kind].entries()){
    const selected=siblings.find(node=>node.code===draft[kind][index]);
    const optionKey=JSON.stringify(siblings.map(node=>[node.code,node.name]));
    // Keep the native dropdown and keyboard focus stable during state polling.
    if(select.dataset.options!==optionKey){select.replaceChildren(new Option(labels[index]+' 선택',''),...siblings.map(node=>new Option(node.name,node.code)));select.dataset.options=optionKey;}
    const value=selected?.code||'';if(select.value!==value)select.value=value;
    select.title=selected?selected.code+' : '+selected.name:labels[index]+' 선택';
    select.previousElementSibling.textContent=selected?.name||labels[index]+' 선택';
    select.disabled=!editable()||!catalog||saving||!siblings.length||(kind==='channel'&&pending);
    select.parentElement.classList.toggle('is-disabled',select.disabled);
    select.closest('.lotte-category-level').hidden=kind==='channel'&&index===3&&!siblings.length;
    siblings=selected?.children||[];
   }
  }
  cancel.hidden=!dirty;cancel.disabled=saving;
  retry.hidden=!loadError&&!saveError;retry.disabled=loading||pending||saving||(!loadError&&!editable());retry.textContent=loadError?'목록 다시 불러오기':'다시 반영';
  panel.setAttribute('aria-busy',String(pending||saving));
 }
 function message(text,error=false){hint.textContent=text;hint.classList.toggle('is-error',error);}
 function draftStatus(text,status='pending'){panel.dataset.status=status;byId('lotteCategoryValidationSummary').textContent=text;byId('lotteCategoryValidationMessage').hidden=true;byId('lotteCategoryValidationIssues').hidden=true;}
 function idleMessage(){message(loadError||(loading?'분류 목록을 불러오고 있어요.':snapshot?.category.manualSelection?'직접 수정한 분류를 유지해요. 필요한 항목만 바꾸세요.':'상품에 맞춰 자동 선택돼요. 필요한 항목만 바로 수정하세요.'),!!loadError);}
 function sync(){
  const now=lotteCategorySnapshot(),next=JSON.stringify(now);
  if((dirty||pending||saving)&&!current()){
   ++epoch;dirty=false;pending=false;saving=false;operation=null;saveError='';signature='';
   stopAutomaticCheck();
   queueMicrotask(()=>scheduleLotteCategoryCheck());
  }
  if(!dirty&&!pending&&!saving&&next!==signature){
   snapshot=now;signature=next;saveError='';
   const category=automatic?.signature===signature?automatic.category:now?.category||{};
   readPath('common',category);readPath('channel',category);idleMessage();
  }
  render();
 }
 function showAutomatic(category){
  if(dirty||pending||saving)return;
  snapshot=lotteCategorySnapshot();signature=JSON.stringify(snapshot);automatic={signature,category};
  readPath('common',category);readPath('channel',category);idleMessage();render();
 }
 function draftCategory(){
  const category={...snapshot.category,manualSelection:null,channelCodes:{},channelMajor:'',channelMiddle:'',channelSmall:'',channelDetail:''};
  for(const [index,node] of selectedNodes('common').entries())category[commonKeys[index]]=node.code+' : '+node.name;
  return category;
 }
 async function apply(id){
  if(id!==epoch||!current()||!complete('common')||!complete('channel'))return false;
  saving=true;saveError='';draftStatus('분류 반영 중…');message('선택한 분류를 등록기에 반영하고 있어요.');render();
  try{
   const {input,...body}=snapshot;
   const result=await post('lotte-category-selection',{...body,manualChoice:{common:[...draft.common],channel:[...draft.channel]}});
   if(id!==epoch||!current()){sync();return false;}
   if(!result.manualSupported||!result.selectionSaved||!result.bridge?.complete||!result.category?.manualSelection)throw Error('선택한 분류의 반영을 확인하지 못했어요. 다시 반영해 주세요.');
   product.category={...product.category,...result.category};
   for(const key of lotteCategoryFields){byId('form').elements[key].value=result.category[key]||'';rememberProductField(key,result.category[key]||'');}
   rememberProductField('lotteCategorySelection',JSON.stringify(result.category.manualSelection));
   dirty=false;pending=false;saving=false;stopAutomaticCheck();
   lotteCategoryChecked=JSON.stringify(lotteCategorySnapshot());
   showAutomatic(result.category);renderLotteCategoryValidation({...result.validation,summary:result.bridge.message},'manual');
   message('수정한 분류를 반영했어요. 다음 입력에도 이 선택을 유지해요.');highlightReviewFields();return true;
  }catch(error){
   if(id===epoch&&current()){saveError=error.message;draftStatus('반영 확인 필요','error');message(saveError,true);}
   else sync();return false;
  }finally{if(id===epoch){saving=false;render();}}
 }
 async function recommend(id){
  if(!current()||!complete('common'))return false;
  pending=true;draftStatus('2차 자동 연결 중…');message('선택한 1차 분류를 기준으로 2차를 자동 연결하고 있어요.');render();
  try{
   const {input,...body}=snapshot,result=await post('lotte-category-suggest',{...body,category:draftCategory(),validateOnly:true});
   if(id!==epoch||!current()){sync();return false;}
   readPath('channel',result.category||{});pending=false;
   if(result.bridge?.complete&&complete('channel'))return await apply(id);
   draftStatus('2차 분류 선택 필요');message('2차 분류를 끝까지 선택하면 자동 반영돼요.');return false;
  }catch(error){
   if(id===epoch&&current()){saveError=error.message;draftStatus('연결 확인 필요','error');message(saveError,true);}
   else sync();return false;
  }finally{if(id===epoch){pending=false;render();}}
 }
 function change(kind,index,value){
  if(saving||!editable()||!catalog)return;
  sync();stopAutomaticCheck();dirty=true;saveError='';pending=false;const id=++epoch;
  draft[kind]=[...draft[kind].slice(0,index),value];
  if(kind==='common')draft.channel=[];
  if(complete('common')&&(kind==='common'||complete('channel')))operation=kind==='common'?recommend(id):apply(id);
  else{operation=null;draftStatus('분류 선택 중');message(kind==='common'?'1차 소분류까지 선택하면 2차를 자동 연결하고 반영해요.':'2차 분류를 끝까지 선택하면 자동 반영돼요.');}
  render();
 }
 cancel.onclick=()=>{
  if(saving)return;++epoch;dirty=false;pending=false;saveError='';operation=null;signature='';sync();
  lotteCategoryChecked='';scheduleLotteCategoryCheck();
 };
 retry.onclick=()=>{
  if(loadError){void load();return;}
  if(!current()||saving||pending)return;
  const id=++epoch;saveError='';operation=complete('channel')?apply(id):recommend(id);
 };
 async function beforeInput(){
  const identity=lotteCategorySnapshot();sync();
  if(operation&&(pending||saving))await operation;
  sync();
  const now=lotteCategorySnapshot();
  if(!identity||!now||!editable()||['style','sourceUrl','input','gender','name'].some(key=>now[key]!==identity[key]))return false;
  if(!dirty&&!pending&&!saving)return true;
  message(saveError||'수정 중인 분류를 끝까지 선택하거나 선택 취소를 눌러 주세요.',true);
  return false;
 }
 window.lotteCategoryInline={sync,showAutomatic,beforeInput,isEditing:()=>dirty||pending||saving};
 async function load(){
  if(loading)return;loading=true;loadError='';idleMessage();render();
  try{
   const response=await fetch('/api/lotte-category-choices');if(!response.ok)throw Error('분류 목록을 불러오지 못했어요. 목록을 다시 불러와 주세요.');
   const data=await response.json();if(data.version!==1||!Array.isArray(data.common)||!Array.isArray(data.channel))throw Error('분류 목록 형식을 확인하지 못했어요.');
   catalog=data;signature='';sync();
   // Collection normally supplies both paths. Fill any incomplete automatic
   // defaults through the existing read-only suggestion endpoint, never a save.
   if(editable()&&(!complete('common')||!complete('channel')))void checkLotteCategory({fillMissing:true});
  }catch(error){loadError=error.message;}
  finally{loading=false;idleMessage();render();}
 }
 document.addEventListener('register-state',()=>queueMicrotask(sync));
 byId('style').addEventListener('input',()=>queueMicrotask(sync));
 for(const event of ['input','change'])byId('form').addEventListener(event,e=>{if(['name','gender',...lotteCategoryFields].includes(e.target.name))queueMicrotask(sync);});
 new MutationObserver(()=>sync()).observe(document.body,{attributes:true,attributeFilter:['data-channel']});
 // Keep the existing FormData and saved-edit contract without duplicate inputs.
 for(const key of lotteCategoryFields){const field=byId('form').elements[key];if(!field)continue;field.type='hidden';const label=field.closest('label');if(label){label.hidden=true;label.style.display='none';}}
 sync();void load();
})();
