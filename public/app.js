let smartstoreListingState=null,tagResearchReady=false;
let lotteCategoryPickerLoading=false;
function loadLotteCategoryPicker(capabilities){
 if(capabilities?.lotteCategoryPicker!==1||lotteCategoryPickerLoading)return;
 lotteCategoryPickerLoading=true;const script=document.createElement("script");script.src="/lotte-category-picker.js";script.onerror=()=>{lotteCategoryPickerLoading=false;script.remove();};document.body.append(script);
}

const activeChannel=()=>document.body.dataset.channel==='smartstore'?'smartstore':'lotte';
let refreshTimer=null,refreshPending=false,refreshAgain=false,smartstoreDetailTimer,channelViewId=0;
let websiteSelection=null;
let lastWebsiteCheck=null;try{lastWebsiteCheck=JSON.parse(localStorage.getItem('registrar-website-check-v1')||'null');}catch{} 
function renderWebsiteUpdates(website,onDemand=false,folderResearch){
 const summary=$('websiteUpdateSummary'),list=$('websiteUpdateList');if(!summary||!list)return;
 if(onDemand){setText(summary,'전체 자동 조사·홈페이지 주기 확인 꺼짐 · 품번 수집 시 해당 상품만 조사');list.hidden=true;if(list.childNodes.length)list.replaceChildren();return;}
 const loading=!website?.checkedAt;if(loading)website=lastWebsiteCheck;if(!website?.checkedAt){if(!summary.querySelector('.website-update-count'))summary.textContent='홈페이지 기준선 확인 중 · 20분 간격';return;}
 summary.title=loading?'자료 불러오는 중 · 마지막 자료로 오늘 누적 건수를 표시합니다.':'한국 시간 오늘 누적 · 같은 상품은 유형별로 하루 한 번 집계합니다.';
 const time=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
 const daily=websiteDailySummary(website),events=daily.events;
 const stamp=daily.day+'|'+JSON.stringify([website,folderResearch]);if(list.dataset.stamp===stamp)return;list.dataset.stamp=stamp;
 if(!loading){lastWebsiteCheck={checkedAt:website.checkedAt,nextCheckAt:website.nextCheckAt,errors:website.errors,batches:website.batches||[]};try{localStorage.setItem('registrar-website-check-v1',JSON.stringify(lastWebsiteCheck));}catch{}}
 summary.classList.toggle('has-updates',events.some(event=>event.type==='new'||event.type==='changed'));
 summary.replaceChildren(document.createTextNode('홈페이지 오늘 누적 '+daily.day.slice(5).replace('-','.')+' · '));
 for(const [type,label,count] of [['new','신상품',daily.newCount],['changed','변경',daily.changedCount],['discovered','기존·미확인',daily.discoveredCount]]){
  const button=document.createElement('button');button.type='button';button.id={new:'websiteNewToggle',changed:'websiteChangedToggle',discovered:'websiteDiscoveredToggle'}[type];button.className='website-category-toggle';button.setAttribute('aria-pressed',String(websiteSelection===type));button.textContent=label+' '+count+'건';button.onclick=()=>{websiteSelection=websiteSelection===type?null:type;delete list.dataset.stamp;renderWebsiteUpdates(website,onDemand,folderResearch);};summary.append(button,document.createTextNode(' '));
 }
 summary.append(document.createTextNode(' · 마지막 확인 '+time(website.checkedAt)+' (한국 시간) · '+(website.intervalMinutes||20)+'분 간격'));list.hidden=!websiteSelection;
 list.replaceChildren();
 const heading=document.createElement('p');heading.className='website-current-heading';heading.textContent='오늘 누적 · '+daily.day.replaceAll('-','.')+' · 같은 상품 중복 제외';list.append(heading);
 function addProduct(parent,event,checkedAt){
  const card=document.createElement('article');card.className='website-product-card';
  const label=document.createElement('span');label.className='website-product-label';label.textContent=(event.type==='new'?'신상품':event.type==='discovered'?'기존·미확인':'상세 변경')+' · 품번 '+event.style;
  const link=document.createElement('a');link.className='website-product-link';link.textContent=event.name+' ↗';link.href=event.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.title='공식 상품페이지 열기';
  const reason=document.createElement('div');reason.className='website-product-reason';reason.textContent=event.type==='new'?'공식 신상품 목록에서 기준선 이후 신규 확인 · 사이트 출시일과 확인시각은 다릅니다.':event.type==='discovered'?'수집 보완으로 발견 · 신상품 근거 미확인 · 신상품 알림 제외':event.changes.join(' · ');
  const status=document.createElement('div');status.className='website-product-status';status.textContent='확인 '+time(event.firstCheckedAt||checkedAt)+(event.firstCheckedAt&&event.firstCheckedAt!==checkedAt?' · 최근 '+time(checkedAt):'')+' · '+({'on-demand':'품번 요청 시 소구점 조사',ready:'소구점 분석 완료',analyzing:'소구점 분석 중','needs-review':'소구점 추가 확인 필요',superseded:'이후 확인 기록 있음'}[event.status]||'소구점 확인 중');
  const saved=folderResearchStatus(event,folderResearch);
  if(saved?.style&&/^\d{6}$/.test(saved.style))label.textContent=(event.type==='new'?'신상품':event.type==='discovered'?'기존·미확인':'상세 변경')+' · 품번 '+saved.style;
  if(saved){status.textContent='발견 '+time(event.firstCheckedAt||checkedAt)+' · '+saved.label+(saved.finishedAt?' · 저장 '+time(saved.finishedAt):'');}
  card.append(label,link,reason,status);
  if(saved?.folder){const destination=document.createElement('div');destination.className='website-product-folder';destination.textContent='저장 폴더: '+saved.folder;card.append(destination);}
  if(saved?.error){const issue=document.createElement('div');issue.className='website-product-status';issue.textContent=saved.error;card.append(issue);}
  parent.append(card);
 }
 function addDayGroups(parent,dayRecord){
 const groups=document.createElement('div');groups.className='website-current-groups';
 for(const [type,title] of [['new','신상품'],['changed','상세이미지 추가·변경'],['discovered','기존·미확인 · 신상품 알림 제외']]){
  if(type!==websiteSelection)continue;
  const items=dayRecord.events.filter(event=>event.type===type),section=document.createElement('section'),titleNode=document.createElement('h3');section.className='website-current-group';titleNode.textContent=title+' '+items.length+'건';section.append(titleNode);
  for(const event of items)addProduct(section,event,event.checkedAt);
  if(!items.length){const empty=document.createElement('p');empty.className='website-group-empty';empty.textContent=dayRecord.hasCheck?'이 날짜에 확인된 해당 상품이 없습니다.':dayRecord.label==='오늘'?'오늘 홈페이지 확인 결과를 기다리고 있습니다.':'이 날짜의 저장된 확인 기록이 없습니다.';section.append(empty);}
  groups.append(section);
 }
 parent.append(groups);
 }
 addDayGroups(list,daily.days[0]);
 const next=document.createElement('p');next.className='website-check-note';next.textContent='마지막 확인 '+time(website.checkedAt)+' · 다음 확인 '+time(website.nextCheckAt)+' · 매일 00:00 한국 시간 기준으로 새로 집계'+(website.errors?' · 일부 원본 확인 실패: 다음 주기에 재확인':'');list.append(next);
 for(const dayRecord of daily.days.slice(1)){
  const older=document.createElement('details'),title=document.createElement('summary');older.className='website-older-history';older.dataset.day=dayRecord.day;
  title.append(document.createTextNode(dayRecord.label+' · '+dayRecord.day.replaceAll('-','.')+' · '));
  if(dayRecord.hasCheck){const added=document.createElement('strong'),changed=document.createElement('strong');added.className=changed.className='website-update-count';added.textContent=dayRecord.newCount+'건';changed.textContent=dayRecord.changedCount+'건';title.append(document.createTextNode('신상품 '),added,document.createTextNode(' · 변경 '),changed);}else title.append(document.createTextNode('확인 기록 없음'));
  older.append(title);addDayGroups(older,dayRecord);list.append(older);
 }
 const historyNote=document.createElement('p');historyNote.className='website-check-note';historyNote.textContent='최근 3일(오늘·어제·그제)까지 조회 · 건수는 날짜별 일일 누적';list.append(historyNote);
}
const $=id=>document.getElementById(id);let product=null,lastRevision=-1,appClosed=false,lastImageVersions={},selectedBackgroundImage='main';
function setText(element,value){
 const text=String(value??'');
 if(element.textContent!==text)element.textContent=text;
}
function showMissingStyle(message){
 const field=$('style');
 $('error').textContent=message;
 field.setAttribute('aria-invalid','true');
 field.setAttribute('aria-describedby','error');
 field.focus();
}
$('style').addEventListener('input',()=>{
 $('style').removeAttribute('aria-invalid');
 $('style').removeAttribute('aria-describedby');
});
renderWebsiteUpdates(null);
function applyReleaseColor(version){
 const badge=$('releaseVersion'),number=Number(version);
 if(!Number.isSafeInteger(number)||number<0||badge.dataset.version===String(number))return;
 const hue=(number*137)%360;
 badge.style.setProperty('--release-bg','hsl('+hue+' 65% 90%)');
 badge.style.setProperty('--release-text','hsl('+hue+' 55% 24%)');
 badge.style.setProperty('--release-border','hsl('+hue+' 45% 72%)');
 badge.dataset.version=String(number);
}
$('refreshPage').onclick=()=>window.location.reload();
let mainImageRetryCount=0,mainImageRetryStyle='';
$('main').onload=()=>{mainImageRetryCount=0;};
$('main').onerror=()=>{
 const style=product?.style||'';
 if(mainImageRetryStyle!==style){mainImageRetryStyle=style;mainImageRetryCount=0;}
 if(mainImageRetryCount>=3)return;
 const expected=$('main').getAttribute('src');if(!expected||activeChannel()==='smartstore'&&!expected.startsWith('/smartstore-listing/'))return;const attempt=++mainImageRetryCount;
 setTimeout(()=>{if(!appClosed&&$('main').getAttribute('src')===expected&&product?.style===style)$('main').src=expected?.startsWith('/smartstore-listing/')?expected+'&retry='+attempt:'/image/main?t='+Date.now();},attempt*700);
};

async function post(endpoint,data={}){
 const expected=({open:'lotte',run:'lotte','lotte-category-suggest':'lotte','lotte-category-selection':'lotte','smartstore-template':'smartstore','smartstore-template-headline':'smartstore','smartstore-open':'smartstore','smartstore-plan':'smartstore','smartstore-auto':'smartstore','smartstore-extra-only':'smartstore','smartstore-detail-only':'smartstore','smartstore-tags-validate':'smartstore','smartstore-tags':'smartstore','smartstore-tags-remove':'smartstore','smartstore-tags-search':'smartstore','smartstore-tags-selection':'smartstore','smartstore-tags-selected':'smartstore','smartstore-ai-settings':'smartstore','smartstore-optimize-title':'smartstore'})[endpoint];
 if(expected&&document.body.dataset.channel!==expected)throw Error('선택한 판매채널과 실행 버튼이 다릅니다. 판매채널을 확인해 주세요.');
 if(expected)data={...data,channel:document.body.dataset.channel};
 try{const r=await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(endpoint==='open'?120000:['smartstore-optimize-title','smartstore-open'].includes(endpoint)?60000:45000)});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 catch(e){if(e.name==='TimeoutError')throw Error('서버 응답 시간이 초과됐습니다. 진행 기록에서 작업 상태를 확인해 주세요.');if(e instanceof TypeError)throw Error('등록기 서버와 연결되지 않았습니다. 잠시 후 새로고침해 주세요.');throw e;}
}
let requestLock=false,serverBusy=false,serverPhase='idle',smartstoreStarting=false,smartstoreDetailStarting=false,smartstoreRequestAt=0,lotteRequestEpoch=0;
function openSellerCenter(channel){
 return post(channel==='smartstore'?'smartstore-open':'open');
}
function collectForReview(input,allowMissingDetail=false){
 return post('collect',{style:input,allowMissingDetail,channel:activeChannel(),edits:currentProductEdits()});
}
const buttonLabels={open:'1. 상품등록 화면 열기',collect:'2. 공식몰 정보 수집',run:'3. 검토한 내용으로 입력 시작'};
const busyLabels={open:'롯데 로그인·상품등록 화면 여는 중…',collect:'공식몰 정보 수집 중…',run:'작업 중 · 롯데ON 입력 준비…'};
const feedback=document.createElement('div');feedback.id='clickFeedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.body.append(feedback);
let feedbackTimer,feedbackJob=null,lotteMotionTimer=null,lotteMotionStartedAt=0,lotteMotionClockLabel='전체';
function updateLotteMotionClock(){
 const clock=feedback.querySelector('.upload-motion-clock');if(!clock)return;
 const seconds=Math.max(0,Math.floor((Date.now()-lotteMotionStartedAt)/1000));
 clock.textContent=lotteMotionClockLabel+' '+(seconds>=60?Math.floor(seconds/60)+'분 '+String(seconds%60).padStart(2,'0')+'초':seconds+'초');
}
function detailMotionContent(text,kind){
 const row=document.createElement('span');row.className='detail-motion '+kind;
 const scene=document.createElement('span');scene.className='detail-motion-scene';scene.setAttribute('aria-hidden','true');
 for(const [name,label] of [['rocket','🚀'],['check','✓'],['spark spark-one','✦'],['spark spark-two','✧'],['spark spark-three','✦']]){
  const item=document.createElement('span');item.className=name.split(' ').map(part=>'detail-motion-'+part).join(' ');item.textContent=label;scene.append(item);
 }
 const message=document.createElement('span');message.className='detail-motion-message';message.textContent=text;
 row.append(scene,message);return row;
}
function uploadMotionContent(text='시작 준비 중…'){
 const row=document.createElement('span');row.className='upload-motion';
 const scene=document.createElement('span');scene.className='upload-motion-scene';scene.setAttribute('aria-hidden','true');
 const rocket=document.createElement('span');rocket.className='upload-motion-rocket';rocket.textContent='🚀';scene.append(rocket);
 const body=document.createElement('span');body.className='upload-motion-body';
 const title=document.createElement('strong');title.textContent='작업 중';
 const clock=document.createElement('span');clock.className='upload-motion-clock';clock.textContent='전체 0초';clock.setAttribute('role','timer');clock.setAttribute('aria-live','off');
 const stage=document.createElement('span');stage.className='upload-motion-stage';stage.textContent=text;
 body.append(title,clock,stage);row.append(scene,body);return row;
}
function announce(text,kind='working'){
 const lotteWorking=kind==='working'&&/롯데ON 입력 준비|롯데ON 상품 입력/.test(text);
 if(!lotteWorking){clearInterval(lotteMotionTimer);lotteMotionTimer=null;lotteMotionStartedAt=0;}
 feedbackJob=null;clearTimeout(feedbackTimer);feedback.replaceChildren();
 if(/상세설명.*교체/.test(text)&&['working','success'].includes(kind)){
  feedback.append(detailMotionContent(kind==='working'?'상세설명 교체 중 · 새 옷으로 갈아입는 중이에요…':text,kind));
 }else if(lotteWorking||kind==='working'&&/시작 요청 접수|자동 작업 시작|스마트스토어 자동 작업/.test(text)){
  feedback.append(uploadMotionContent(lotteWorking?text.replace(' 한 번만 누르면 됩니다.',''):undefined));
 }else feedback.textContent=text;
 feedback.className='visible '+kind+(feedback.querySelector('.upload-motion')?' upload-working':'');
 if(lotteWorking){
  if(!lotteMotionStartedAt){lotteMotionStartedAt=Date.now();lotteMotionClockLabel=/입력 준비/.test(text)?'전체':'확인 후';}
  updateLotteMotionClock();if(!lotteMotionTimer)lotteMotionTimer=setInterval(updateLotteMotionClock,1000);
 }
 if(kind!=='working')feedbackTimer=setTimeout(()=>feedback.className='',4500);
}
function syncFeedbackWithState(state){
 if(state.busy){
  if(!feedback.classList.contains('working')||feedbackJob!==state.phase||state.phase==='register'&&/입력 준비/.test(feedback.textContent)){
   const label=({'lotte-open':busyLabels.open,collect:'공식몰 정보 수집 중…',register:'롯데ON 상품 입력 진행 중…',background:'배경 합성 중…',smartstore:'스마트스토어 입력 중…','smartstore-auto':'스마트스토어 자동 작업 진행 중…','smartstore-extra-only':'추가사진 교체 중…','smartstore-detail-only':'상세설명 교체 중…','smartstore-import-photos':'기존 상품 착용사진 가져오는 중…','smartstore-tags':'태그 자동입력 중…','smartstore-detail':'상세페이지 제작 중…',stopping:'작업 중단 중…'})[state.phase]||'작업 진행 중…';
   announce(label);
  }
  feedbackJob=state.phase;return;
 }
 if(!feedback.classList.contains('working')){feedbackJob=null;return;}
 if(requestLock)return;
 const job=feedbackJob||(serverBusy?serverPhase:null);
 if(!job)return;
 if(state.phase==='done'){
  if(['collect','smartstore-combine-photos','smartstore-import-photos'].includes(job)&&state.photoPreparation&&state.photoPreparation.status!=='ready'){
   announce('확인 필요 · '+(state.photoPreparation.message||'사진·소구점 보완이 남아 있습니다.'),'failed');return;
  }
  const label=({'smartstore-extra-only':'추가사진 교체 완료','smartstore-detail-only':'상세설명 교체 완료','smartstore-auto':'자동 작업 완료','smartstore-tags':'태그 작업 완료','smartstore-import-photos':'착용사진 가져오기 완료','smartstore-combine-photos':'사진·템플릿 준비 완료',collect:'정보 수집 완료',register:'입력 작업 완료'})[job]||'작업 완료';
  announce('✓ '+label+(job==='smartstore-detail-only'?' · 편집기에서 확인해 주세요. 상품 저장·등록 전입니다.':''),'success');
 }else if(state.phase==='error'){
  announce('확인 필요 · '+(state.error||'진행 기록을 확인해 주세요.'),'failed');
 }else if(state.phase==='stopped'){
  announce('작업이 중단되었습니다.','success');
 }
}
async function copyProgress(errorOnly=false){
 const error=$('error').textContent.trim();
 const logs=$('logs').textContent.trim();
 if(errorOnly&&!error){announce('복사할 오류가 없습니다.','success');return;}
 if(!errorOnly&&!error&&!logs){announce('복사할 진행 기록이 없습니다.','success');return;}
 const text=errorOnly?error:[`상태: ${$('status').textContent}`,error?'오류\n'+error:'',logs?'진행 기록\n'+logs:''].filter(Boolean).join('\n\n');
 const box=$('copyText');box.value=text;$('copyFallback').hidden=true;
 try{await navigator.clipboard.writeText(text);}
 catch{
  $('copyFallback').hidden=false;box.focus();box.select();
  let copied=false;try{copied=document.execCommand('copy');}catch{}
  if(!copied){announce('아래 선택된 내용을 Ctrl+C로 복사해 주세요.','failed');return;}
  $('copyFallback').hidden=true;
 }
 announce(errorOnly?'오류를 복사했습니다.':'진행 기록과 오류를 복사했습니다.','success');
}
$('copyError').onclick=()=>copyProgress(true);
function smartstoreRetry(){
 const retry=smartstoreListingState?.autoProgress?.retry;
 if(!retry||retry.style!==product?.style)return null;
 const input=$('style').value.trim()||product.style;
 return input===retry.style||input===retry.sourceUrl?retry:null;
}
function syncButtons(){if($('smartstoreDetailOnly')){const active=smartstoreDetailStarting||serverBusy&&serverPhase==='smartstore-detail-only';setText($('smartstoreDetailOnly'),active?'상세설명 교체 진행 중…':'상세설명만 교체 · 조회/수정');$('smartstoreDetailOnly').setAttribute('aria-busy',String(active));}if($('smartstoreStart')){const button=$('smartstoreStart'),active=smartstoreStarting||serverBusy&&serverPhase==='smartstore-auto';setText(button,smartstoreStarting?'작업 중 · 시작 준비…':active?'작업 중 · 입력·업로드…':smartstoreRetry()?'실패한 곳부터 이어서':'입력·업로드 시작');button.classList.toggle('working',active);button.setAttribute('aria-busy',String(active));}for(const id of ['open','collect','run']){const el=$(id);const active=el.dataset.pending==='true'||serverBusy&&((id==='open'&&serverPhase==='lotte-open')||(id==='collect'&&serverPhase==='collect')||(id==='run'&&serverPhase==='register'));el.disabled=requestLock||serverBusy;el.classList.toggle('working',active);el.setAttribute('aria-busy',String(active));setText(el,active?busyLabels[id]:buttonLabels[id]);}for(const id of ['smartstoreTemplate1','smartstoreTemplate2','smartstoreOpen','smartstoreOptimizeTitle','naverSettings','browserLoginSettings','smartstoreStart','smartstoreDetailOnly','smartstoreImportPhotos','smartstoreCombinePhotos','photoImportApply','smartstoreAutoTags'])if($(id))$(id).disabled=requestLock||serverBusy||['smartstoreAutoTags'].includes(id)&&!tagResearchReady||['smartstoreDetailOnly','smartstoreTemplate1','smartstoreTemplate2'].includes(id)&&!product;syncBackgroundControls();}
function action(id,fn){$(id).onclick=async()=>{
 const primary=id in buttonLabels;if(primary&&(requestLock||serverBusy))return;
 // The run callback fills and checks the category pair before required-field validation.
 if(id==='collect'&&!$('style').value.trim()){showMissingStyle('품번 6자리 또는 공식몰 상품 URL을 입력해 주세요.');announce('품번을 확인해 주세요','failed');return;}
 let runState=null;
 if(primary){requestLock=true;$(id).dataset.pending='true';if(id==='run')lotteRequestEpoch++;syncButtons();announce(busyLabels[id]+' 한 번만 누르면 됩니다.');}
 try{$('error').textContent='';if(id==='run')await paintSmartstoreStart();const result=await fn();
 if(id==='run'){
  lotteRequestEpoch++;
  if(result===false){announce('입력 내용을 확인해 주세요.','failed');return;}
  serverBusy=true;serverPhase='register';feedbackJob='register';
 }
 if(primary){
  const r=await fetch('/api/state?channel='+activeChannel());
  if(r.ok){const state=await r.json();serverBusy=state.busy;serverPhase=state.phase;if(id==='run')runState=state;}
  if(id==='open')announce(result.message||'롯데 전용 크롬에 연결했습니다.',result.registrationReady===false?'failed':'success');
  if(id==='collect')announce('✓ 수집 요청 접수 — 정보를 분석하고 있습니다','success');
 }
 }catch(e){$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');}
 finally{if(primary){requestLock=false;delete $(id).dataset.pending;syncButtons();if(runState)syncFeedbackWithState(runState);}}
 };}
action('open',()=>openSellerCenter('lotte'));action('collect',()=>collectForReview($('style').value.trim()));action('stop',async()=>{const b=$('stop');if(b.disabled)return;b.disabled=true;b.textContent='중단 중…';announce('중단 요청 중 — 추가 입력을 취소합니다');try{await post('stop');announce('중단 요청을 전달했습니다','success');}finally{b.disabled=false;b.textContent='중단';}});action('continue',()=>post('continue'));
$('style').addEventListener('keydown',event=>{
 if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
 event.preventDefault();
 if(!event.repeat)$('collect').click();
});
action('run',async()=>{if(!await fillMissingLotteCategory()){$('lotteCategoryValidation').focus();return false;}if(!$('form').reportValidity())return false;const f=new FormData($('form'));const p={...product};for(const key of ['name','gender','material','country','washing','manufactured','keywords'])p[key]=f.get(key).trim();p.consumerPrice=Number(f.get('consumerPrice'));p.colors=f.get('colors').split(',').map(x=>x.replace(/\s+/g,'')).filter(Boolean);p.sizes=f.get('sizes').split(',').map(x=>x.replace(/\s+/g,'')).filter(Boolean);p.category={...product.category,...Object.fromEntries(['commonMiddle','commonSmall','channelMiddle','channelSmall'].map(k=>[k,f.get(k).trim()]))};return post('run',{product:p,finalize:$('finalize').checked});});
const lotteCategoryFields=['commonMiddle','commonSmall','channelMiddle','channelSmall'];
let lotteCategoryTimer=null,lotteCategoryRequest=0,lotteCategoryPending=false,lotteCategoryChecked='';
function lotteCategorySnapshot(){
 if(!product)return null;
 const form=$('form');
 return {style:product.style,sourceUrl:product.sourceUrl,input:$('style').value,gender:form.elements.gender.value,name:form.elements.name.value.trim(),category:{...product.category,...Object.fromEntries(lotteCategoryFields.map(key=>[key,form.elements[key].value.trim()]))}};
}
function lotteCategoryGenderConflict(category,gender,sourceCategory=product?.sourceCategory||[]){
 const source=[...new Set(sourceCategory.map(value=>({MEN:'남성',WOMEN:'여성',남성:'남성',여성:'여성'}[String(value).trim().toUpperCase()])).filter(Boolean))];
 if(source.length===1&&source[0]!==gender)return '공식 상품 경로와 입력한 성별이 다릅니다.';
 if(!['남성','여성'].includes(gender))return '';
 for(const key of ['commonMajor','commonMiddle','commonSmall','channelMajor','channelMiddle','channelSmall','channelDetail']){
  const sex=String(category?.[key]||'').replace(/^[A-Z0-9]+\s*[:：]\s*/i,'').match(/^(?:브랜드)?(남성|여성)/)?.[1];
  if(sex&&sex!==gender)return gender+' 상품에는 '+sex+' 분류를 연결할 수 없습니다.';
 }
 return '';
}
function renderLotteCategoryPath(element,values){
 if(element.dataset.inlineCategory==='true')return;
 const path=values.map(value=>String(value||'미지정')),signature=JSON.stringify(path);
 if(element.dataset.path===signature)return;
 const names=path.map(value=>value.replace(/^[A-Z0-9]+\s*[:：]\s*/i,''));
 const levels=['대분류','중분류','소분류','세분류'];
 element.classList.add('lotte-category-levels');
 element.replaceChildren(...names.map((name,index)=>{
  const field=document.createElement('span');field.className='lotte-category-level';field.title=path[index];
  const label=document.createElement('span');label.className='lotte-category-level-label';label.textContent=levels[index]||'세부 분류';
  const value=document.createElement('strong');value.className='lotte-category-level-value';value.textContent=name;
  field.append(label,value);return field;
 }));
 element.title=path.join(' → ');element.dataset.path=signature;
}
function renderLotteCategoryValidation(validation,status=validation?.status||'pending'){
 if(window.lotteCategoryInline?.isEditing())return;
 const panel=$('lotteCategoryValidation'),snapshot=lotteCategorySnapshot(),category=snapshot?.category||{};
 panel.dataset.status=status;
 const label=status==='manual'?'직접 선택한 분류 유지':status==='ready'?'자동 연결 완료':status==='review'?'연결 완료 · 세부 확인':status==='loading'||status==='pending'?'분류 연결 중…':status==='error'?'연결 확인 필요':'1차 분류 선택 필요';
 setText($('lotteCategoryValidationSummary'),label);
 const message=$('lotteCategoryValidationMessage');
 setText(message,validation?.summary||'대분류부터 소분류까지 화면에서 선택해 주세요.');message.hidden=['ready','manual','loading','pending'].includes(status);
 const commonPath=validation?.commonPath||[category.commonMajor,category.commonMiddle,category.commonSmall];
 const channelPath=validation?.channelPath||[category.channelMajor,category.channelMiddle,category.channelSmall,...(category.channelDetail?[category.channelDetail]:[])];
 renderLotteCategoryPath($('lotteCategoryCommonPath'),commonPath);
 renderLotteCategoryPath($('lotteCategoryChannelPath'),channelPath);
 const issues=validation?.issues||[],list=$('lotteCategoryValidationIssues');
 if(list.dataset.issues!==JSON.stringify(issues)){
  list.replaceChildren(...issues.map(issue=>{const item=document.createElement('li');item.textContent=issue.message;return item;}));list.dataset.issues=JSON.stringify(issues);
 }
 list.hidden=!issues.length;
}
async function checkLotteCategory({fillMissing=false}={}){
 clearTimeout(lotteCategoryTimer);
 if(!product||activeChannel()!=='lotte'||window.lotteCategoryInline?.isEditing())return false;
 const snapshot=lotteCategorySnapshot(),signature=JSON.stringify(snapshot),request=++lotteCategoryRequest;
 const current=()=>request===lotteCategoryRequest&&activeChannel()==='lotte'&&JSON.stringify(lotteCategorySnapshot())===signature;
 lotteCategoryPending=true;renderLotteCategoryValidation(null,'loading');
 try{
  const {input,...body}=snapshot;
  body.category=window.lotteCategoryInline?.automaticCategory(snapshot)||body.category;
  const automaticChanged=JSON.stringify(body.category)!==JSON.stringify(snapshot.category);
  const result=await post('lotte-category-suggest',{...body,validateOnly:!fillMissing});
  if(!current())return false;
  if(snapshot.category.manualSelection&&!result.manualSupported)throw Error('직접 선택한 분류를 유지하려면 최신 등록기 서버를 실행해 주세요. 현재 선택은 그대로 보관했습니다.');
  if(!result.bridge){
   // Static files can update before the running server is restarted. Preserve
   // the previously working input flow while that older response is in use.
   const legacyCategory={...snapshot.category,...result.category};
   result.category=legacyCategory;
   result.bridge={complete:lotteCategoryFields.every(key=>String(legacyCategory[key]||'').trim()),review:true,message:'기존 입력 분류로 진행 · 새 연결 규칙은 서버 재시작 후 적용됩니다.'};
   result.validation=result.validation||{ready:false,issues:[]};
  }
  if(typeof result.bridge.complete!=='boolean')throw Error('분류 연결 결과를 받지 못했습니다. 다시 확인해 주세요.');
  const genderConflict=lotteCategoryGenderConflict(result.category,snapshot.gender);if(genderConflict)throw Error(genderConflict);
  if((fillMissing||automaticChanged&&result.bridge.complete)&&result.category){
   const category={...result.category};
   for(const key of lotteCategoryFields){
    category[key]=category[key]||snapshot.category[key]||'';
    const field=$('form').elements[key];if(field.value!==category[key])field.value=category[key];
    field.classList.toggle('field-missing',!category[key]);
   }
   product.category={...product.category,...category};
  }
  if(fillMissing&&result.bridge.complete)product.category={...product.category,...result.category};
  lotteCategoryChecked=JSON.stringify(lotteCategorySnapshot());
  window.lotteCategoryInline?.showAutomatic(result.category);
  const display={...result.validation,summary:result.bridge.message,commonPath:[result.category.commonMajor,result.category.commonMiddle,result.category.commonSmall],channelPath:[result.category.channelMajor,result.category.channelMiddle,result.category.channelSmall,...(result.category.channelDetail?[result.category.channelDetail]:[])]};
  renderLotteCategoryValidation(display,result.bridge.complete?(result.bridge.manual?'manual':result.bridge.review||!result.validation.ready?'review':'ready'):'blocked');
  return result.bridge.complete;
 }catch(error){
  if(current()){lotteCategoryChecked=signature;renderLotteCategoryValidation({summary:error.message,issues:[{code:'CHECK_FAILED',message:'분류 연결을 다시 시도해 주세요.'}]},'error');}
  return false;
 }finally{if(request===lotteCategoryRequest)lotteCategoryPending=false;}
}
function scheduleLotteCategoryCheck(){
 if(!product||activeChannel()!=='lotte'||window.lotteCategoryInline?.isEditing())return;
 const signature=JSON.stringify(lotteCategorySnapshot());
 if(signature===lotteCategoryChecked)return;
 clearTimeout(lotteCategoryTimer);lotteCategoryRequest++;lotteCategoryPending=false;
 renderLotteCategoryValidation(null,'pending');
 lotteCategoryTimer=setTimeout(()=>void checkLotteCategory(),350);
}
async function fillMissingLotteCategory(){if(window.lotteCategoryInline&&!await window.lotteCategoryInline.beforeInput())return false;return checkLotteCategory({fillMissing:true});}
$('form').addEventListener('input',event=>{
 if(!product||!['name','gender',...lotteCategoryFields].includes(event.target.name))return;
 const key=event.target.name;
 if(key==='gender'||lotteCategoryFields.includes(key)){delete product.category.manualSelection;if(typeof rememberProductField==='function')rememberProductField('lotteCategorySelection','');}
 if(key==='gender')product.category={...product.category,commonMajor:'',channelMajor:''};
 if(key==='gender'||key.startsWith('channel'))product.category={...product.category,channelDetail:'',channelCodes:{}};
 scheduleLotteCategoryCheck();
});
$('form').addEventListener('change',event=>{if(event.target.name==='gender')scheduleLotteCategoryCheck();});
$('style').addEventListener('input',()=>scheduleLotteCategoryCheck());
function populate(p){p.country=['대한민국','한국','중국','베트남','방글라데시','미얀마','인도네시아','캄보디아','인도','태국','필리핀','파키스탄','스리랑카','말레이시아','일본','이탈리아','포르투갈','튀르키예','터키','미국','프랑스','대만','네팔','라오스'].includes(p.country)?p.country:'';product=p;const form=$('form');for(const key of ['name','gender','consumerPrice','material','country','washing','manufactured','keywords','templateHeadline'])setProductInput(form.elements[key],p[key]||'',p);setProductInput(form.elements.colors,p.colors.join(','),p);setProductInput(form.elements.sizes,p.sizes.join(','),p);for(const key of ['commonMiddle','commonSmall','channelMiddle','channelSmall'])setProductInput(form.elements[key],p.category[key]||'',p);$('source').textContent='품번 '+p.style+' · '+p.rawName.replace(/\[[^\]]*\]/g,'').replace(/변우석|문가영|박현지/g,'').trim();$('warnings').textContent=(p.fieldStatus?Object.entries(p.fieldStatus).map(([k,v])=>({material:'소재',country:'제조국',washing:'세탁방법',category:'상품분류'}[k]||k)+': '+v).join(' / ')+' — ':'')+p.warnings.join(' ');for(const k of ['material','washing'])form.elements[k].placeholder='확인 필요 — 공식 고시 원본과 대조';$('ocr').textContent=p.ocrText;if(activeChannel()==='lotte'){$('main').src='/image/main?t='+Date.now();renderExtraImages(p,true);}$('review').hidden=false;syncNoticeCopy();}
const renderProduct=populate;
function renderWashingIcons(p){
 const list=$('washingIconList');list.replaceChildren();
 const icons=p.noticeAnalysis?.washingIcons||[];
 if(!icons.length){list.textContent='아이콘 분리 자료가 없습니다. 다음 정보 수집부터 분석합니다.';return;}
 for(const icon of icons){
  const row=document.createElement('div');row.className='washing-icon-row';
  const img=document.createElement('img');img.src='/image/'+icon.key+'?t='+Date.now();img.alt='확인할 세탁 아이콘';
  const input=document.createElement('input');input.value=icon.meaning||'';input.placeholder='예: 30℃ 중성세제 손세탁';input.maxLength=180;input.setAttribute('aria-label','세탁 아이콘 의미');
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=icon.known?'확인 완료':'의미 확인 후 저장';button.disabled=icon.known;input.readOnly=icon.known;
  button.onclick=async()=>{
   if(!input.value.trim())return announce('아이콘 의미를 입력해 주세요.','failed');
   if(!window.confirm('이 아이콘의 의미가 맞는지 확인하셨나요?\n'+input.value.trim()))return;
   button.disabled=true;
   try{const r=await post('learn-washing-icon',{key:icon.key,meaning:input.value});p.noticeAnalysis.washingIcons=r.icons;p.washing=r.washing;p.fieldStatus.washing=r.status;$('form').elements.washing.value=r.washing;renderWashingIcons(p);announce('아이콘 의미를 저장했습니다. 같은 형태를 다음 수집에서 재사용합니다.','success');}
   catch(e){button.disabled=false;announce(e.message,'failed');}
  };
  row.append(img,input,button);list.append(row);
 }
}

populate=function(p){renderProduct(p);$('categorySource').textContent='공식몰 상품 경로: '+(p.sourceCategory?.join(' → ')||'확인 필요');};
$('form').elements.gender.onchange=()=>{const f=$('form');const gender=f.elements.gender.value;f.elements.name.value=f.elements.name.value.replace(/^(남성|여성)\s+/,'');if(gender)f.elements.name.value=gender+' '+f.elements.name.value;for(const key of ['commonMiddle','commonSmall','channelMiddle','channelSmall'])f.elements[key].value='';};
function updateDetailOnlyCompletion(state){
 let banner=document.getElementById('detailOnlyCompletion');
 if(!banner){banner=document.createElement('p');banner.id='detailOnlyCompletion';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');$('smartstoreDetailOnly').insertAdjacentElement('afterend',banner);}
 const done=!state.busy&&state.phase==='done'&&state.completedJob==='smartstore-detail-only'&&!state.error;
 banner.hidden=!done;
 if(done&&banner.dataset.motionState!=='complete'){
  banner.replaceChildren(detailMotionContent('상세설명 교체 완료 · 편집기에서 확인해 주세요. 상품 저장·등록 전입니다.','success'));
  banner.dataset.motionState='complete';
 }else if(!done){banner.replaceChildren();delete banner.dataset.motionState;}
}
let statePollError=null;
async function refresh(){if(appClosed)return;if(refreshPending){refreshAgain=true;return;}refreshPending=true;clearTimeout(refreshTimer);const requestedChannel=activeChannel(),requestedView=channelViewId,requestedLotteEpoch=lotteRequestEpoch;try{const r=await fetch('/api/state?channel='+requestedChannel,{signal:AbortSignal.timeout(5000)});const s=await r.json();if(!r.ok)throw Error(s.error);if(requestedChannel!==activeChannel()||requestedView!==channelViewId||requestedLotteEpoch!==lotteRequestEpoch){refreshAgain=true;return;}if(requestedChannel==='smartstore'&&smartstoreRequestAt){if(!s.autoProgress||s.autoProgress.startedAt<smartstoreRequestAt)return;smartstoreRequestAt=0;}smartstoreListingState=s;loadLotteCategoryPicker(s.capabilities);document.dispatchEvent(new CustomEvent('register-state',{detail:{busy:s.busy,phase:s.phase,error:s.error,autoProgress:s.autoProgress,photoColorDraft:s.photoColorDraft,productStyle:s.product?.style}}));if(s.release){applyReleaseColor(s.release.version);setText($('releaseVersion'),'버전 '+s.release.version);setText($('releaseUpdated'),'최종 수정: '+s.release.displayDate);$('releaseUpdated').dateTime=s.release.updatedAt;}if(s.githubSync){setText($('githubSyncStatus'),s.githubSync.message);$('githubSyncStatus').dataset.status=s.githubSync.status;}if(s.benefitResearch&&$("benefitResearchStatus")){const benefitStatus=$("benefitResearchStatus"),benefit=s.benefitResearch;if(benefitStatus.textContent!==benefit.message)benefitStatus.textContent=benefit.message;$("benefitResearchStatus").dataset.status=s.benefitResearch.status;}renderWebsiteUpdates(s.benefitResearch?.website,s.benefitResearch?.status==='on-demand',s.benefitResearch?.folderResearch);syncFeedbackWithState(s);updateCollectionStatus(s);syncBackgroundWork(s);if(activeChannel()==='smartstore'){updateDetailOnlyCompletion(s);renderResearchTags(s);syncEnhancedFeatures(s);}else{updateMissingDetailChoice(s);syncBackgroundImage(s);syncExtraImages(s);}setText($('status'),({idle:'대기','lotte-open':busyLabels.open,collect:'정보 수집 중',register:'등록 중',background:'배경 합성 중',smartstore:'스마트스토어 입력 테스트 중','smartstore-extra-only':'추가사진 교체 중','smartstore-detail-only':'상세설명만 교체 중','smartstore-combine-photos':'마네킨샷+공홈 조합 중','smartstore-import-photos':'기존 상품 착용사진 가져오는 중','smartstore-auto':'자동 진행 · '+(autoStageLabels[s.autoStep]||'시작 중'),'smartstore-tags':'태그 자동입력 중','smartstore-detail':'스마트스토어 상세페이지 만드는 중',done:s.completedJob==='smartstore-extra-only'?'✓ 추가사진 교체 완료':s.completedJob==='smartstore-detail-only'?'✓ 상세설명 교체 완료':'작업 종료',error:'확인 필요',stopping:'중단 중…',stopped:'중단됨'})[s.phase]);const logText=s.logs.map(x=>x.time+' '+x.message).join('\n');if($('logs').textContent!==logText)$('logs').textContent=logText;if(s.error){$('error').textContent=s.error;statePollError=null;}else if(statePollError&&$('error').textContent===statePollError){$('error').textContent='';statePollError=null;}$('pause').hidden=!s.paused;setText($('pauseMessage'),s.paused||'');serverBusy=s.busy;serverPhase=s.phase;syncButtons();if(s.product&&lastRevision!==s.revision){populate(s.product);lastRevision=s.revision;setNoticeRegionSource(s.revision);}else if(product&&!$('detailPreview').children.length)renderDetailPreview(product);syncListingImages(s);if(activeChannel()==='smartstore')syncPhotoImport(s);}catch(e){const retryable=e.name==='TimeoutError'||e instanceof TypeError;const message=retryable?'진행 상태 응답이 늦어 다시 확인 중입니다. 진행 중인 작업은 계속됩니다.':e.message;if(retryable)statePollError=message;$('error').textContent=message;}finally{refreshPending=false;if(!appClosed){refreshTimer=setTimeout(refresh,refreshAgain?0:document.hidden?5000:serverBusy?1200:2500);refreshAgain=false;}}}refresh();

// Distinguish missing values from OCR values that still need review.
const reviewedFields=new Set();
function highlightReviewFields(){
 if(!product)return;
 for(const field of $('form').elements){
  if(!field.name||field.name==='templateHeadline')continue;
  const blank=!String(field.value).trim();
  const category=['commonMiddle','commonSmall','channelMiddle','channelSmall'].includes(field.name);
  const status=product.fieldStatus?.[category?'category':field.name]||'';
  const uncertain=/확인 필요|미확정|공란/.test(status)&&!reviewedFields.has(field.name);
  const label=field.closest('label');
  field.classList.toggle('field-missing',blank);
  field.classList.toggle('field-review',!blank&&uncertain);
  let badge=label?.querySelector('.review-badge');
  if((blank||uncertain)&&label){if(!badge){badge=document.createElement('span');badge.className='review-badge';label.insertBefore(badge,field);}badge.textContent=blank?'필수 · 공란':'원본 확인 필요';badge.classList.toggle('missing',blank);}
  else badge?.remove();
 }
}
const populateWithPreviews=populate;
populate=function(p){reviewedFields.clear();populateWithPreviews(p);highlightReviewFields();};
$('form').addEventListener('input',e=>{if(e.target.name)reviewedFields.add(e.target.name);highlightReviewFields();});
$('form').addEventListener('change',highlightReviewFields);
highlightReviewFields();
$('info').addEventListener('error',()=>{$('infoImageError').hidden=false;});
$('info').addEventListener('load',()=>{$('infoImageError').hidden=true;});
if($('info').src&&$('info').complete&&!$('info').naturalWidth)$('infoImageError').hidden=false;

async function saveSelectedImage(key,button){
 if(button.disabled)return;button.disabled=true;
 try{await post('save-main-image',{image:key,channel:document.body.dataset.channel});announce('선택한 이미지 1장을 바탕화면의 이미지저장 폴더에 저장했습니다.','success');}
 catch(e){announce(e.message,'failed');}finally{button.disabled=false;}
}
$('downloadMain1500').onclick=()=>saveSelectedImage('main',$('downloadMain1500'));
$('saveExtra1').onclick=()=>saveSelectedImage('extra1',$('saveExtra1'));
$('saveExtra2').onclick=()=>saveSelectedImage('extra2',$('saveExtra2'));
$('saveDetailImages').onclick=async()=>{
 const button=$('saveDetailImages');if(button.disabled)return;button.disabled=true;
 try{const smart=document.body.dataset.channel==='smartstore';await post('save-detail-images',smart?{channel:'smartstore',product:smartstoreDetailFields()}:{});announce(smart?'스마트스토어 템플릿 상세이미지·HTML·영상 코드를 바탕화면 이미지저장에 저장했습니다.':'상세이미지를 긴 사진 한 장으로 바탕화면의 이미지저장 폴더에 저장했습니다.','success');}
 catch(e){announce(e.message,'failed');}finally{button.disabled=false;}
};

$('openPriceChanger').onclick=async()=>{
 const button=$('openPriceChanger');if(button.disabled)return;
 const destination=window.open('about:blank','_blank');
 if(!destination){announce('가격변경기를 열려면 이 사이트의 팝업을 허용해 주세요.','failed');return;}
 destination.opener=null;destination.document.title='가격변경기 연결 중';destination.document.body.textContent='가격변경기를 연결하고 있습니다…';
 button.disabled=true;button.setAttribute('aria-busy','true');
 try{
  const result=await post('price-changer/open'),url=new URL(result.url);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/')throw Error('가격변경기 연결 주소를 확인해 주세요.');
  if(!destination.closed)destination.location.replace(url.href);
 }catch(error){destination.close();announce(error.message,'failed');}
 finally{button.disabled=false;button.removeAttribute('aria-busy');}
};

$('shutdownApp').onclick=async()=>{
 if(serverBusy||requestLock){announce('진행 중인 작업이 있습니다. 중단 후 작업이 멈추면 종료해 주세요.','failed');return;}
 if(!window.confirm('등록기를 종료할까요? 현재 검토 내용은 작업 폴더에 보관됩니다. 다시 실행할 때는 바탕화면 전용 아이콘을 이용해 주세요.'))return;
 const button=$('shutdownApp');button.disabled=true;
 try{
  const form=product?Object.fromEntries(new FormData($('form'))):null;
  await post('shutdown',{form});appClosed=true;
  $('status').textContent='등록기 종료됨';
  for(const id of ['open','collect','run','stop','continue','downloadMain1500'])$(id).disabled=true;
  document.title='상품등록기 종료됨';
  document.body.replaceChildren();
  const closedMessage=document.createElement('p');
  closedMessage.textContent='상품등록기가 종료되었습니다. 이 탭은 닫아도 됩니다. 채팅은 그대로 유지됩니다.';
  closedMessage.style.cssText='margin:48px;font-size:18px;color:#111';
  document.body.append(closedMessage);
  window.close();
 }catch(e){button.disabled=false;announce(e.message,'failed');}
};

function smartstoreDetailFields(){
 const f=$('form').elements;return {style:product.style,templateHeadline:$('templateHeadline').value,detailTemplate:product.detailTemplate===2?2:1,name:f.name.value,gender:f.gender.value,material:f.material.value,colors:f.colors.value.split(',').map(v=>v.trim()).filter(Boolean),sizes:f.sizes.value.split(',').map(v=>v.trim()).filter(Boolean)};
}
let detailPreviewResizeObserver;
function renderDetailPreview(p){
 const signature=JSON.stringify([activeChannel(),p.style,smartstoreListingState?.revision,smartstoreListingState?.release?.version,smartstoreListingState?.smartstoreListing?.detailRevision,smartstoreDetailFields()]);
 if($('detailPreview').dataset.renderSignature===signature)return;
 $('detailPreview').dataset.renderSignature=signature;
 for(const n of [1,2]){const button=$('smartstoreTemplate'+n);if(button)button.setAttribute('aria-pressed',String((p.detailTemplate===2?2:1)===n));}
 detailPreviewResizeObserver?.disconnect();
 const box=$('detailPreview');box.replaceChildren();box.scrollTop=0;
 if(document.body.dataset.channel==='smartstore'){
  if(p.photoSelectionPending){
   $('detailPreviewStatus').textContent='사진 선택 대기';
   const note=document.createElement('p');
   note.textContent='사진 색상·구도 수정에서 사용할 사진을 고른 뒤 반영해 주세요.';
   const points=document.createElement('section');
   points.setAttribute('aria-live','polite');
   points.textContent='공식 소구점을 확인하고 있습니다.';
   box.append(note,points);
   void fetch('/api/smartstore-point-picker?channel=smartstore&style='+encodeURIComponent(p.style))
    .then(async response=>{
     const result=await response.json();
     if(!response.ok)throw Error(result.error);
     if(!points.isConnected||result.style!==p.style||result.sourceUrl!==p.sourceUrl)return;
     const selected=result.selectedIds.map(id=>result.candidates.find(point=>point.id===id)).filter(Boolean);
     const heading=document.createElement('h4');
     heading.textContent='공식 근거 소구점 '+selected.length+'개';
     const list=document.createElement('ol');
     for(const point of selected){
      const item=document.createElement('li'),title=document.createElement('strong');
      title.textContent=point.title;
      item.append(title,' · '+point.description);
      list.append(item);
     }
     points.replaceChildren(heading,list);
    }).catch(error=>{if(points.isConnected)points.textContent='공식 소구점 확인 필요 · '+error.message;});
   return;
  }
  $('detailPreviewStatus').textContent=p.smartstoreDetail?.sellingPointReview?.status==='needs-review'?(p.smartstoreDetail.sellingPointReview.message||'소구점 공식 근거 확인 필요'):'';
  const frame=document.createElement('iframe');frame.className='smartstore-template-preview';frame.title='스마트스토어 확정 템플릿 상세페이지';frame.allow='autoplay; fullscreen; picture-in-picture';
  frame.src='/smartstore-detail-preview.html?style='+encodeURIComponent(p.style)+'&v='+encodeURIComponent(smartstoreListingState?.release?.version||Date.now())+'&fields='+encodeURIComponent(JSON.stringify(smartstoreDetailFields()));box.append(frame);frame.addEventListener('load',()=>{if(typeof applyTemplateHeadlinePreview==='function')applyTemplateHeadlinePreview();});
  const fit=()=>{
   const scale=Math.min(1,box.clientWidth/860);if(!scale)return;
   frame.style.width='860px';frame.style.height=Math.ceil(box.clientHeight/scale)+'px';
   frame.style.transform='scale('+scale+')';
  };
  detailPreviewResizeObserver=new ResizeObserver(fit);detailPreviewResizeObserver.observe(box);fit();return;
 }
 const add=(key)=>{const image=document.createElement('img');image.src='/image/'+key+'?t='+Date.now();image.alt='상세 이미지 '+key;image.loading='lazy';image.onerror=()=>{image.remove();$('detailPreviewStatus').textContent='상세 원본 이미지를 불러오지 못했습니다. 원본 상태를 확인해 주세요.';};box.append(image);return image;};
 if(p.originalDetailUrl&&!p.images.detail){$('detailPreviewStatus').textContent='기존 상세 원본을 불러오지 못했습니다. 대체 이미지를 만들지 않습니다.';return;}
 if(p.images.detail){
  $('detailPreviewStatus').textContent='';
  const detail=add('detail');
  const remaining=['size','check','info'].filter(key=>p.images[key]&&p.images[key]!==p.images.detail);
  if(remaining.length){
   const appendSections=keys=>{
    if(box.dataset.renderSignature!==signature||detail.parentNode!==box)return;
    for(const key of remaining)if(keys.includes(key))add(key);
   };
   void fetch('/api/lotte-detail-preview?style='+encodeURIComponent(p.style))
    .then(async response=>{
     if(!response.ok)throw Error('상세 정보 대조 실패');
     const {keys}=await response.json();
     appendSections(keys);
    }).catch(()=>appendSections(remaining));
  }
  return;
 }
 $('detailPreviewStatus').textContent=p.detailFallbackApproved?'공식몰 상세 원본 누락 · 승인된 대표·색상별 사진 구성':'기존 상세 없음 · 색상 기재 순서대로 최대 2장씩 구성';
 let count=0;
 for(const color of p.colors||[]){const urls=[...new Set(p.colorImages?.[color]||[])].slice(0,2);if(!urls.length)continue;const heading=document.createElement('h4');heading.textContent=color;box.append(heading);for(const url of urls){const key=Object.keys(p.images).find(k=>p.images[k]===url);if(key){add(key);count++;}}}
 if(!count)for(const key of ['main','extra1','extra2'])if(p.images[key])add(key);
 for(const key of ['size','check','info'])if(p.images[key])add(key);
}
const populateWithDetailPreview=populate;
populate=function(p){populateWithDetailPreview(p);};
if(product)renderDetailPreview(product);

const populateWithImageButtons=populate;
populate=function(p){populateWithImageButtons(p);$('saveExtra1').hidden=!p.images.extra1;$('saveExtra2').hidden=!p.images.extra2;};
if(product){$('saveExtra1').hidden=!product.images.extra1;$('saveExtra2').hidden=!product.images.extra2;}

function updateCollectionStatus(s){
 updateCollectionAnimation(s);
 const badge=$('collectionStatus');
 if(s.phase==='collect'&&s.busy){badge.hidden=false;badge.className='collect-pending';badge.textContent='정보 수집 중… 잠시 기다려 주세요.';return;}
 if(s.phase==='error'){badge.hidden=false;badge.className='collect-failed';badge.textContent=s.product?'작업 확인 필요 · 기존 수집정보는 유지됩니다. 진행 기록을 확인해 주세요.':'정보 수집을 완료하지 못했습니다. 진행 기록을 확인해 주세요.';return;}
 if(activeChannel()==='smartstore'&&s.product?.smartstoreDetail?.pendingPhotoCount){badge.hidden=false;badge.className='collect-pending';badge.textContent='품번 '+s.product.style+' · 사진 '+s.product.smartstoreDetail.pendingPhotoCount+'장 색상 연결 확인 필요';return;}
 if(s.product){badge.hidden=false;badge.className='collect-complete';badge.textContent='✓ 수집 완료 · '+s.product.style;return;}
 badge.hidden=true;badge.textContent='';
}

const populateBeforeIcons=populate;
populate=function(p){populateBeforeIcons(p);renderWashingIcons(p);};
if(product)renderWashingIcons(product);



let missingDetailRequest=null;
function updateMissingDetailChoice(s){
 missingDetailRequest=s.detailFallbackRequest||null;
 $('missingDetailChoice').hidden=!missingDetailRequest||s.busy;
 $('retryMissingDetail').disabled=requestLock||s.busy;
}
$('retryMissingDetail').onclick=async()=>{
 if(!missingDetailRequest||requestLock||serverBusy)return;
 if(!window.confirm('상세 원본 누락이 확인된 상품만 대표·색상별 사진으로 구성합니다. 진행할까요?'))return;
 const input=missingDetailRequest.input;requestLock=true;$('retryMissingDetail').disabled=true;syncButtons();
 try{await collectForReview(input,true);serverBusy=true;serverPhase='collect';$('missingDetailChoice').hidden=true;announce('승인한 상품을 대체 구성으로 다시 수집합니다.');}
 catch(e){$('error').textContent=e.message;announce(e.message,'failed');}
 finally{requestLock=false;syncButtons();}
};

function updateCollectionAnimation(s){
 const box=document.querySelector('.workspace-moment');if(!box)return;
 const state=s.phase==='collect'&&s.busy?'collecting':s.phase==='error'?'error':s.product?'complete':'idle';
 if(box.dataset.state===state)return;
 const justFinished=box.dataset.state==='collecting'&&state==='complete';
 box.classList.remove('completion-flight');box.dataset.state=state;
 if(justFinished)box.classList.add('completion-flight');
 const text={idle:['한 벌씩, 차근차근','오늘도 기분 좋은 작업실'],collecting:['상품정보 모으는 중','사진과 정보를 데려오고 있어요'],complete:['수집 완료! 준비됐어요','아래 상품정보를 확인해 주세요'],error:['잠깐, 확인이 필요해요','진행 기록의 안내를 확인해 주세요']}[state];
 const p=box.querySelector('p');p.replaceChildren(document.createTextNode(text[0]));const span=document.createElement('span');span.textContent=text[1];p.append(span);
 box.querySelector('.moment-star.star-two').textContent=state==='complete'?'✓':state==='error'?'!':'✧';
}


let brandingCurrent=null;
function applyBranding(b){brandingCurrent=b;const image=document.querySelector('.giordano-official-logo');image.hidden=!b.visible;image.src=b.logo||'/giordano-official-logo.png';document.querySelector('.lsc-mark').textContent=b.maker;document.querySelector('.lsc-mark').setAttribute('aria-label',b.maker);const date=document.querySelector('.maker-credit time');date.dateTime=b.date;date.textContent=b.date.replaceAll('-','.');}
async function fetchBranding(){const r=await fetch('/api/branding');if(!r.ok)throw Error('보호 설정을 불러오지 못했습니다.');return r.json();}
fetchBranding().then(applyBranding).catch(e=>{$('brandingSettings').textContent='보호 설정 확인 필요';$('brandingSettings').title=e.message;});
$('brandingSettings').onclick=async()=>{try{const b=await fetchBranding();applyBranding(b);$('brandingForm').reset();$('brandingError').textContent='';$('brandingHeading').textContent=b.configured?'로고·만든이 수정':'보호 비밀번호 처음 설정';$('brandingHint').textContent=b.configured?'변경할 때마다 비밀번호를 입력해야 저장됩니다.':'비밀번호를 8자 이상으로 설정하세요. 설정 후부터 로고·만든이 변경을 보호합니다.';$('brandingConfirmLabel').hidden=b.configured;$('brandingFields').hidden=!b.configured;$('brandingMaker').value=b.maker;$('brandingDate').value=b.date;$('brandingVisible').checked=b.visible;$('brandingDialog').showModal();$('brandingPassword').focus();}catch(e){announce(e.message,'failed');}};
$('brandingCancel').onclick=()=>{$('brandingPassword').value='';$('brandingConfirm').value='';$('brandingDialog').close();};
$('brandingForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const data={password:$('brandingPassword').value,confirmPassword:$('brandingConfirm').value,maker:$('brandingMaker').value,date:$('brandingDate').value,visible:$('brandingVisible').checked};const file=$('brandingLogo').files[0];if(file){if(file.size>1000000)throw Error('로고는 1MB 이하로 선택해 주세요.');data.logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}const b=await post('branding',data);applyBranding(b);$('brandingPassword').value='';$('brandingConfirm').value='';$('brandingDialog').close();announce('로고·만든이 보호 설정을 저장했습니다.','success');}catch(e){$('brandingError').textContent=e.message;}finally{button.disabled=false;}};

if(location.hash==='#branding-settings'){$('brandingSettings').click();}


function setupNoticeRegionCopy(){
 const image=$('info'),link=image.parentElement,area=$('noticeRegionSelection');
 const status=$('noticeRegionStatus'),result=$('noticeRegionText'),hint=status.textContent;
 let drag=null,request=null,skipClick=false;
 function clearSelection(){
  request?.abort();request=null;
  area.hidden=true;result.hidden=true;result.value='';status.textContent=hint;
 }
 async function readSelection(region,revision){
  const controller=new AbortController();
  request=controller;
  const focused=document.activeElement;
  status.textContent='선택한 글자를 읽고 있어요…';
  try{
   const response=await fetch('/api/notice-region-text',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({revision,region}),signal:controller.signal
   });
   const data=await response.json();
   if(request!==controller)return;
   if(!response.ok)throw Error(data.error||'선택한 글자를 읽지 못했어요.');
   if(!data.text){status.textContent='글자가 있는 부분을 다시 드래그해 주세요.';return;}
   result.value=data.text;
   result.hidden=false;
   status.textContent='읽은 글자를 확인하고 Ctrl+C로 복사하세요.';
   if(document.activeElement===focused){
    result.focus({preventScroll:true});
    result.select();
   }
  }catch(error){
   if(request===controller)status.textContent=error instanceof TypeError?'글자를 읽지 못했어요. 다시 드래그해 주세요.':error.message;
  }finally{
   if(request===controller)request=null;
  }
 }
 image.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0||event.pointerType==='touch'||!image.complete||!image.naturalWidth)return;
  skipClick=false;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,revision:Number(image.dataset.revision),region:null};
  image.setPointerCapture(event.pointerId);
 });
 image.addEventListener('pointermove',event=>{
  if(drag?.id!==event.pointerId)return;
  if(!drag.region){
   if(Math.max(Math.abs(event.clientX-drag.x),Math.abs(event.clientY-drag.y))<5)return;
   clearSelection();skipClick=true;
  }
  const rect=image.getBoundingClientRect();
  const clamp=value=>Math.max(0,Math.min(1,value));
  const x1=clamp((drag.x-rect.left)/rect.width),x2=clamp((event.clientX-rect.left)/rect.width);
  const y1=clamp((drag.y-rect.top)/rect.height),y2=clamp((event.clientY-rect.top)/rect.height);
  const left=Math.min(x1,x2),right=Math.max(x1,x2);
  const padding=Math.max(0,(24/image.naturalHeight-Math.abs(y2-y1))/2);
  const top=clamp(Math.min(y1,y2)-padding),bottom=clamp(Math.max(y1,y2)+padding);
  drag.region={left,top,right,bottom};
  area.style.left=left*100+'%';area.style.top=top*100+'%';
  area.style.width=(right-left)*100+'%';area.style.height=(bottom-top)*100+'%';
  area.hidden=false;
 });
 image.addEventListener('pointerup',event=>{
  if(drag?.id!==event.pointerId)return;
  const {region,revision}=drag;
  drag=null;
  if(!region)return;
  if((region.right-region.left)*image.naturalWidth<8){clearSelection();return;}
  void readSelection(region,revision);
 });
 image.addEventListener('lostpointercapture',event=>{
  if(drag?.id!==event.pointerId)return;
  if(drag.region)clearSelection();
  drag=null;
 });
 link.addEventListener('click',event=>{
  if(skipClick&&event.detail){event.preventDefault();skipClick=false;}
 });
 result.addEventListener('copy',()=>{status.textContent='선택한 글자를 복사했어요.';});
 result.addEventListener('keydown',event=>{
  if(event.key==='Escape'){clearSelection();link.focus({preventScroll:true});}
 });
 return revision=>{
  drag=null;clearSelection();
  image.dataset.revision=revision;
  link.href=image.src='/image/info?revision='+revision;
 };
}
const setNoticeRegionSource=setupNoticeRegionCopy();

const noticeLabels={material:'제품소재',colors:'색상',sizes:'치수',country:'제조국'};
function syncNoticeCopy(){for(const key of Object.keys(noticeLabels)){const value=$('form').elements[key]?.value?.trim()||'';$('noticeText-'+key).value=value||'확인 필요 — 수집된 값이 없습니다.';$('noticeText-'+key).dataset.missing=String(!value);}}
$('form').addEventListener('input',syncNoticeCopy);$('form').addEventListener('change',syncNoticeCopy);
async function copyNotice(keys){const values=keys.map(key=>{const box=$('noticeText-'+key);if(box.dataset.missing==='true')return null;return keys.length===1?box.value:noticeLabels[key]+': '+box.value;}).filter(Boolean);if(!values.length){$('noticeCopyStatus').textContent='복사할 값이 없습니다. 원본을 확인해 주세요.';return;}const text=values.join('\n');try{await navigator.clipboard.writeText(text);$('noticeCopyStatus').textContent='복사했습니다.';}catch{const box=$('noticeManualCopy');box.hidden=false;box.value=text;box.focus();box.select();let ok=false;try{ok=document.execCommand('copy');}catch{}if(ok){box.hidden=true;$('noticeCopyStatus').textContent='복사했습니다.';}else{$('noticeCopyStatus').textContent='아래 선택된 텍스트를 Ctrl+C로 복사해 주세요.';}}}
for(const button of document.querySelectorAll('.notice-copy'))button.onclick=()=>copyNotice([button.dataset.field]);$('copyNoticeAll').onclick=()=>copyNotice(Object.keys(noticeLabels));

$('openNoticeText').onclick=()=>{syncNoticeCopy();$('noticeCopyStatus').textContent='';$('noticeTextDialog').showModal();};$('closeNoticeText').onclick=()=>$('noticeTextDialog').close();

const backgroundLabels={main:'대표이미지',extra1:'추가이미지 1',extra2:'추가이미지 2'};
let backgroundRequest=null,backgroundEpoch=0,backgroundPreparing=false,backgroundSelectionPending=false,backgroundWorkActive=false;
let backgroundCancellation=Promise.resolve(),backgroundStyleInput=$('style').value;
let backgroundProgress=null,backgroundFailure=null,backgroundFailureApplying=false,backgroundTerminalNotice=null,backgroundTerminalTimer=null;
try{backgroundTerminalNotice=JSON.parse(sessionStorage.getItem('backgroundTerminalNotice')||'null');}catch{}
const cancelledBackgroundRequests=new Set();
const backgroundActiveStatuses=['preparing','waiting','generating','processing','review','applying-wait'];
const backgroundStageLabels={preparing:'원본 확인',waiting:'시작 대기',generating:'배경 생성',processing:'원본 합성',review:'완성본 검수','applying-wait':'적용 대기',complete:'합성 완료',error:'합성 확인 필요',cancelled:'합성 취소'};
function showBackgroundProgress(work){
 backgroundProgress={requestId:backgroundRequest?.requestId,jobId:backgroundRequest?.jobId,sourceUrl:backgroundRequest?.sourceUrl||backgroundProgress?.sourceUrl,key:backgroundRequest?.key||backgroundProgress?.key,...work};
 if(!backgroundActiveStatuses.includes(work.status)){
  const key=(backgroundProgress.requestId||backgroundProgress.jobId||work.style||'local')+':'+work.status;
  if(backgroundTerminalNotice?.key!==key){
   backgroundTerminalNotice={key,expiresAt:Date.now()+4000};
   try{sessionStorage.setItem('backgroundTerminalNotice',JSON.stringify(backgroundTerminalNotice));}catch{}
  }
  clearTimeout(backgroundTerminalTimer);
  backgroundTerminalTimer=setTimeout(syncBackgroundProgress,Math.max(0,backgroundTerminalNotice.expiresAt-Date.now()));
 }
 if(work.status==='error')syncBackgroundFailure(backgroundProgress);
 else if(work.status==='complete'&&work.manual&&backgroundFailure?.jobId===work.jobId){backgroundFailure=null;syncBackgroundFailure();}
 else if(backgroundFailure&&work.jobId&&backgroundFailure.jobId!==work.jobId){
  backgroundFailure.manualAvailable=false;backgroundFailure.manualUnavailableReason='새 합성 작업이 시작되어 이전 결과는 미리보기만 가능합니다.';syncBackgroundFailure();
 }
 syncBackgroundProgress();
}
function dismissBackgroundTerminalNotice(){
 if(!backgroundProgress||backgroundActiveStatuses.includes(backgroundProgress.status))return;
 if(backgroundTerminalNotice){backgroundTerminalNotice.expiresAt=Date.now();try{sessionStorage.setItem('backgroundTerminalNotice',JSON.stringify(backgroundTerminalNotice));}catch{}}
 syncBackgroundProgress();
}
function syncBackgroundProgress(){
 const panel=$('backgroundProgress');
 panel.hidden=!backgroundProgress;
 if(!backgroundProgress)return;
 const work=backgroundProgress,active=backgroundActiveStatuses.includes(work.status);
 panel.hidden=!active&&Date.now()>=(backgroundTerminalNotice?.expiresAt||0);
 panel.dataset.status=work.status;panel.classList.toggle('active',active);
 const retry=work.status==='generating'&&Number.isInteger(work.attempt)&&work.attempt>1;
 const heading=work.status==='applying-wait'?'합성 완료 · 적용 대기':retry?'합성 보정 재시도 중 · '+work.attempt+(Number.isInteger(work.maxAttempts)?'/'+work.maxAttempts:'')+'회':
  active?'합성 진행 중 · '+backgroundStageLabels[work.status]:backgroundStageLabels[work.status]||'합성 상태';
 setText($('backgroundProgressHeading'),heading);
 setText($('backgroundProgressMessage'),(work.style?'품번 '+work.style+' · ':'')+(work.message||''));
 $('backgroundProgressHint').hidden=!active;
 const startedAt=typeof work.startedAt==='number'?work.startedAt:Date.parse(work.startedAt);
 const elapsed=active&&Number.isFinite(startedAt)?Date.now()-startedAt:work.elapsedMs;
 const seconds=typeof elapsed==='number'&&Number.isFinite(elapsed)?Math.max(0,Math.floor(elapsed/1000)):null;
 $('backgroundProgressElapsed').hidden=seconds===null;
 setText($('backgroundProgressElapsed'),seconds===null?'':(active?'경과 ':'소요 ')+(seconds>=60?Math.floor(seconds/60)+'분 ':'')+seconds%60+'초');
}
setInterval(syncBackgroundProgress,1000);
function syncBackgroundFailure(work){
 if(work){
  const previews=(Array.isArray(work.previews)?work.previews:work.previewUrl?[{attempt:work.attempt,url:work.previewUrl}]:[]).filter(preview=>{
   try{const url=new URL(preview.url,location.href);return url.origin===location.origin&&url.pathname==='/api/background-preview'&&url.searchParams.get('jobId')===work.jobId&&Number.isInteger(preview.attempt)&&preview.attempt>0&&url.searchParams.get('attempt')===String(preview.attempt);}catch{return false;}
  });
  const previous=backgroundFailure;
  backgroundFailure={...work,previews,unavailableUrls:previous?.jobId===work.jobId?previous.unavailableUrls||[]:[],selectedAttempt:previous?.jobId===work.jobId&&previews.some(preview=>preview.attempt===previous.selectedAttempt)?previous.selectedAttempt:previews.at(-1)?.attempt};
 }
 $('backgroundFailureCard').hidden=!backgroundFailure;$('backgroundFailureReview').hidden=!backgroundFailure;
 if(!backgroundFailure)return;
 const failure=backgroundFailure,select=$('backgroundFailureAttempt'),preview=failure.previews.find(item=>item.attempt===failure.selectedAttempt);
 const options=failure.previews.map(item=>({value:String(item.attempt),label:item.attempt+'차 합성 결과'}));
 if(select.dataset.options!==JSON.stringify(options)){
  select.replaceChildren(...options.map(item=>{const option=document.createElement('option');option.value=item.value;option.textContent=item.label;return option;}));
  select.dataset.options=JSON.stringify(options);
 }
 select.value=String(failure.selectedAttempt||'');select.disabled=backgroundFailureApplying||options.length<2;
 const reason=preview?.reason||failure.message||'실패 사유를 확인해 주세요.';
 const unavailable=preview&&failure.unavailableUrls?.includes(preview.url);
 setText($('backgroundFailureSource'),'실패 결과에 사용한 사진: '+(backgroundLabels[failure.key]||'원본 사진'));
 setText($('backgroundFailureReason'),reason);setText($('backgroundFailureSummary'),(preview?preview.attempt+'차 · ':'')+(failure.message||reason));
 setText($('backgroundFailureLabel'),preview?'실패 결과 보기':'실패 사유 보기');
 for(const id of ['backgroundFailedImage','backgroundFailureThumbnail']){
  const img=$(id);img.hidden=!preview||!!unavailable;
  if(preview&&img.getAttribute('src')!==preview.url){img.src=preview.url;img.alt=preview.attempt+'차 검수에 실패한 합성 결과';}
  else if(!preview)img.removeAttribute('src');
 }
 $('backgroundFailureNoImage').hidden=!!preview&&!unavailable;
 setText($('backgroundFailureNoImage'),unavailable?'이 실패 결과의 미리보기를 더 이상 불러올 수 없습니다. 현재 원본으로 다시 합성해 주세요.':'이미지가 생성되기 전에 실패하여 표시할 결과가 없습니다.');
 $('applyBackgroundFailure').hidden=!preview;
 const canApply=failure.manualAvailable&&backgroundFailureIsCurrent(failure)&&!unavailable;
 $('applyBackgroundFailure').disabled=backgroundFailureApplying||backgroundWorkActive||backgroundPreparing||!canApply;
 $('backgroundFailureApplyStatus').hidden=!preview||!!canApply;
 setText($('backgroundFailureApplyStatus'),unavailable?'미리보기를 불러올 수 없어 이 결과를 적용할 수 없습니다.':failure.manualUnavailableReason||'품번 또는 선택 사진이 달라져 적용할 수 없습니다. 현재 원본으로 다시 합성해 주세요.');
 setText($('applyBackgroundFailure'),backgroundFailureApplying?'선택한 결과 적용 중…':'선택한 결과를 대표이미지에 적용');
}
function syncBackgroundControls(){
 const active=backgroundPreparing||backgroundWorkActive;
 $('openBackgroundRequest').disabled=activeChannel()!=='lotte'||backgroundPreparing||backgroundSelectionPending||backgroundWorkActive||serverBusy||requestLock;
 $('backgroundImageChoice').disabled=activeChannel()!=='lotte'||backgroundSelectionPending;
 $('openBackgroundRequest').setAttribute('aria-busy',String(active));
 setText($('openBackgroundRequest'),active?'합성 진행 중':'합성 진행');
 setText($('extendBackground'),active?'🖼 합성 진행 중':'🖼 배경 늘리기·합성');
 setText($('closeBackground'),active?'닫고 다른 작업하기':'닫기');
 $('extendBackground').classList.toggle('background-working',active);
 if(backgroundFailure)syncBackgroundFailure();
}
function cancelBackgroundRequest(){
 const request=backgroundRequest,wasActive=backgroundPreparing||backgroundWorkActive;
 backgroundEpoch++;
 backgroundRequest=null;
 backgroundPreparing=false;
 backgroundWorkActive=false;
 syncBackgroundControls();
 if(!request)return backgroundCancellation;
 cancelledBackgroundRequests.add(request.requestId);
 if(backgroundFailure&&backgroundFailure.jobId===request.jobId){backgroundFailure.manualAvailable=false;syncBackgroundFailure();}
 if(wasActive)showBackgroundProgress({...backgroundProgress,status:'cancelled',style:request.style,message:'상품·사진 또는 작업 조건이 바뀌어 합성 취소를 요청했습니다.'});
 backgroundCancellation=post('background-cancel',{requestId:request.requestId});
 backgroundCancellation.catch(error=>{
  if(!backgroundRequest){
   const message='이전 합성 요청 취소 확인이 필요합니다. '+error.message;
   $('backgroundStatus').textContent=message;showBackgroundProgress({status:'error',style:request.style,message});
  }
 });
 return backgroundCancellation;
}
function backgroundRequestIsCurrent(request){
 return backgroundRequest===request&&request.epoch===backgroundEpoch&&
  product?.style===request.style&&product?.sourceUrl===request.sourceUrl&&
  selectedBackgroundImage===request.key&&$('style').value===request.input;
}
function backgroundInputMatchesProduct(current=product){
 const input=$('style').value.trim();
 if(!input||input===current?.style)return true;
 try{return new URL(input).href===new URL(current.sourceUrl).href;}catch{return false;}
}
$('style').addEventListener('input',()=>{
 const value=$('style').value;
 if(value===backgroundStyleInput)return;
 backgroundStyleInput=value;
 void cancelBackgroundRequest();
});
document.addEventListener('register-state',event=>{
 if(backgroundRequest&&event.detail.productStyle!==backgroundRequest.style)void cancelBackgroundRequest();
 syncBackgroundControls();
});
function syncBackgroundImage(s){
 if(activeChannel()!=='lotte')return;
 const chip=s.colorChipStatus;
 $('colorChipStatus').textContent=chip?(chip.position?'색상칩 자동 배치: 오른쪽 '+(chip.position==='bottom-right'?'하단':'중단'):'여백 부족으로 색상칩 생략'):'공식 색상칩은 수집 후 여백이 있을 때 자동 배치합니다.';
 const versions=s.imageVersions||{main:s.mainImageVersion||null};
 for(const key of ['main','extra1','extra2']){
  const version=versions[key]||null;
  if(version===lastImageVersions[key])continue;
  lastImageVersions[key]=version;
  if(version){$(key).src='/image/'+key+'?t='+Date.now();$('backgroundStatus').textContent='합성 완료 — '+backgroundLabels[key]+'를 변경했습니다.';announce(backgroundLabels[key]+'를 변경했습니다.','success');}
 }
}
function syncBackgroundWork(s){
 if(backgroundFailure&&(backgroundFailure.style!==s.product?.style||backgroundFailure.sourceUrl!==s.product?.sourceUrl)){backgroundFailure=null;syncBackgroundFailure();}
 if(backgroundRequest&&(s.product?.sourceUrl!==backgroundRequest.sourceUrl||s.backgroundSelection&&s.backgroundSelection!==backgroundRequest.key))void cancelBackgroundRequest();
 if(!$('backgroundDialog').open){
  const next=s.backgroundSelection||'main';
  if(next!==selectedBackgroundImage){void cancelBackgroundRequest();selectedBackgroundImage=next;}
 }
 const work=s.backgroundWork;
 if(work?.status==='error'&&work.style===s.product?.style&&work.sourceUrl===s.product?.sourceUrl)syncBackgroundFailure(work);
 if(backgroundRequest&&!backgroundPreparing&&work?.jobId&&work.requestId&&!cancelledBackgroundRequests.has(work.requestId)&&
  work.jobId!==backgroundRequest.jobId&&Number.isFinite(work.startedAt)&&work.startedAt>(backgroundRequest.startedAt||backgroundRequest.createdAt||Infinity)&&
  work.style===s.product?.style&&work.sourceUrl===s.product?.sourceUrl&&work.key===selectedBackgroundImage&&
  [...backgroundActiveStatuses,'complete','error','cancelled'].includes(work.status)){
  backgroundRequest={requestId:work.requestId,jobId:work.jobId,epoch:++backgroundEpoch,style:work.style,key:work.key,sourceUrl:work.sourceUrl,startedAt:work.startedAt,input:$('style').value};
 }
 if(!backgroundRequest&&!backgroundSelectionPending&&work?.jobId&&work.requestId&&!cancelledBackgroundRequests.has(work.requestId)&&
  backgroundActiveStatuses.includes(work.status)){
  backgroundRequest={requestId:work.requestId,jobId:work.jobId,epoch:backgroundEpoch,style:work.style,key:work.key,sourceUrl:work.sourceUrl,startedAt:work.startedAt,input:$('style').value};
  backgroundStyleInput=backgroundRequest.input;
  if(work.style!==s.product?.style||work.sourceUrl!==s.product?.sourceUrl||work.key!==selectedBackgroundImage||!backgroundInputMatchesProduct(s.product))void cancelBackgroundRequest();
 }
 if(backgroundRequest&&!backgroundPreparing&&work?.jobId===backgroundRequest.jobId&&work.requestId===backgroundRequest.requestId&&
  work.style===backgroundRequest.style&&work.sourceUrl===backgroundRequest.sourceUrl&&work.key===backgroundRequest.key&&[...backgroundActiveStatuses,'complete','error','cancelled'].includes(work.status)){
  backgroundWorkActive=backgroundActiveStatuses.includes(work.status);
  backgroundRequest.startedAt=work.startedAt;
  backgroundRequest.message=work.message||'합성 작업 상태: '+work.status;
  $('backgroundStatus').textContent=backgroundRequest.message;
  showBackgroundProgress(work);
 }
 if(!backgroundRequest&&!backgroundSelectionPending&&work?.jobId&&work.requestId&&!cancelledBackgroundRequests.has(work.requestId)&&
  work.style===s.product?.style&&work.sourceUrl===s.product?.sourceUrl&&work.key===selectedBackgroundImage&&
  ['complete','error','cancelled'].includes(work.status)){
  showBackgroundProgress(work);
 }
 syncBackgroundControls();
}
function backgroundGuide(){return '선택한 사진: '+backgroundLabels[selectedBackgroundImage]+'. 합성 진행을 누르면 동일 원본의 완료된 결과를 확인하고, 새 합성이 필요하면 자동으로 진행합니다.';}
function showBackgroundChoice(){
 setText($('backgroundOriginalHeading'),'현재 선택 원본 · '+backgroundLabels[selectedBackgroundImage]);
 $('backgroundOriginal').src='/image/'+selectedBackgroundImage+'-original?t='+Date.now();
 $('backgroundOriginal').alt='합성할 '+backgroundLabels[selectedBackgroundImage]+' 원본';
 $('backgroundStatus').textContent=backgroundRequest?.message||backgroundProgress?.message||backgroundGuide();
}
$('extendBackground').onclick=()=>{
 if(!product){announce('먼저 상품을 수집해 주세요.','failed');return;}
 if(activeChannel()!=='lotte'&&!backgroundProgress||(serverBusy||requestLock)&&!backgroundWorkActive&&!backgroundPreparing){announce('롯데ON 작업이 끝난 뒤 사진을 선택해 주세요.','failed');return;}
 const choice=$('backgroundImageChoice');choice.replaceChildren();
 for(const key of ['main','extra1','extra2']){const option=document.createElement('option');option.value=key;option.textContent=backgroundLabels[key]+(product.images[key]?'':' (사진 없음)');option.disabled=!product.images[key];choice.append(option);}
 if(!product.images[selectedBackgroundImage])selectedBackgroundImage='main';
 choice.value=selectedBackgroundImage;showBackgroundChoice();syncBackgroundControls();$('backgroundDialog').showModal();
};
$('backgroundProgressOpen').onclick=()=>$('extendBackground').click();
function backgroundFailureIsCurrent(failure){
 return !!failure&&backgroundFailure===failure&&failure.style===product?.style&&failure.sourceUrl===product?.sourceUrl&&failure.key===selectedBackgroundImage&&backgroundInputMatchesProduct();
}
$('viewBackgroundFailure').onclick=()=>{
 if(!backgroundFailure||backgroundFailure.style!==product?.style||backgroundFailure.sourceUrl!==product?.sourceUrl)return;
 showBackgroundChoice();syncBackgroundControls();$('backgroundDialog').showModal();dismissBackgroundTerminalNotice();
 $('backgroundFailureReview').scrollIntoView({block:'start'});
};
for(const id of ['backgroundFailedImage','backgroundFailureThumbnail'])$(id).onerror=()=>{
 if(!backgroundFailure)return;
 const url=$(id).getAttribute('src');
 if(!backgroundFailure.previews.some(preview=>preview.url===url))return;
 if(!backgroundFailure.unavailableUrls.includes(url))backgroundFailure.unavailableUrls.push(url);
 syncBackgroundFailure();
};
$('backgroundFailureAttempt').onchange=()=>{
 if(!backgroundFailure||backgroundFailureApplying)return;
 const attempt=Number($('backgroundFailureAttempt').value);
 if(!backgroundFailure.previews.some(preview=>preview.attempt===attempt))return;
 backgroundFailure.selectedAttempt=attempt;syncBackgroundFailure();
};
$('applyBackgroundFailure').onclick=async()=>{
 const failure=backgroundFailure;
 if(!failure||!failure.manualAvailable||backgroundFailureApplying||backgroundPreparing||backgroundWorkActive||!backgroundFailureIsCurrent(failure))return;
 const attempt=failure.selectedAttempt;
 if(!failure.previews.some(preview=>preview.attempt===attempt))return;
 const request={requestId:failure.requestId,jobId:failure.jobId,epoch:backgroundEpoch,style:failure.style,key:failure.key,sourceUrl:failure.sourceUrl,input:$('style').value,startedAt:failure.startedAt};
 backgroundRequest=request;backgroundStyleInput=request.input;backgroundFailureApplying=true;backgroundPreparing=true;syncBackgroundControls();
 showBackgroundProgress({...failure,status:'processing',message:attempt+'차 결과를 대표이미지에 적용하고 있습니다…'});
 try{
  const result=await post('background-apply-preview',{jobId:failure.jobId,attempt,userApproved:true});
  if(!backgroundRequestIsCurrent(request))return;
  if(result.ok!==true)throw Error(result.message||'선택한 합성 결과를 적용하지 못했습니다.');
  backgroundPreparing=false;backgroundWorkActive=!!result.waiting;
  request.message=result.message||(result.waiting?'합성 완료 · 다른 작업이 끝나면 대표이미지에 적용합니다.':'선택한 결과를 대표이미지에 적용했습니다.');
  $('backgroundStatus').textContent=request.message;
  showBackgroundProgress({...failure,status:result.waiting?'applying-wait':'complete',message:request.message,elapsedMs:result.elapsedMs});
  if(!result.waiting){backgroundFailure=null;syncBackgroundFailure();}
  syncBackgroundControls();await refresh();
 }catch(error){
  if(backgroundRequestIsCurrent(request)){backgroundPreparing=false;backgroundWorkActive=false;showBackgroundProgress({...failure,status:'error',message:error.message});$('backgroundStatus').textContent=error.message;}
 }finally{
  backgroundFailureApplying=false;
  if(backgroundRequest===request)backgroundPreparing=false;
  syncBackgroundControls();
 }
};
$('backgroundImageChoice').onchange=async()=>{
 const choice=$('backgroundImageChoice'),previous=selectedBackgroundImage,key=choice.value;
 if(key===previous)return;
 const cancellation=cancelBackgroundRequest(),epoch=backgroundEpoch,style=product?.style;
 backgroundSelectionPending=true;choice.disabled=true;syncBackgroundControls();
 try{
  await cancellation;
  if(epoch!==backgroundEpoch||product?.style!==style||activeChannel()!=='lotte')return;
  await post('background-selection',{style,key});
  if(epoch!==backgroundEpoch||product?.style!==style||activeChannel()!=='lotte')return;
  selectedBackgroundImage=key;showBackgroundChoice();
 }catch(error){if(epoch===backgroundEpoch){choice.value=previous;$('backgroundStatus').textContent=error.message;}}
 finally{backgroundSelectionPending=false;choice.value=selectedBackgroundImage;choice.disabled=false;syncBackgroundControls();}
};
$('closeBackground').onclick=()=>$('backgroundDialog').close();
$('openBackgroundRequest').onclick=async()=>{
 if(backgroundPreparing||backgroundSelectionPending||backgroundWorkActive||requestLock||serverBusy)return;
 if(activeChannel()!=='lotte'||!product||!product.images[selectedBackgroundImage]){
  $('backgroundStatus').textContent='롯데ON에서 현재 상품의 원본 사진을 선택해 주세요.';return;
 }
 if(!backgroundInputMatchesProduct()){
  $('backgroundStatus').textContent='입력한 품번 또는 공식 URL의 상품을 먼저 수집해 주세요.';return;
 }
 const cancellation=cancelBackgroundRequest();
 const request={requestId:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),epoch:backgroundEpoch,
  style:product.style,key:selectedBackgroundImage,sourceUrl:product.sourceUrl,revision:lastRevision>=0?lastRevision:undefined,input:$('style').value,createdAt:Date.now()};
 backgroundStyleInput=request.input;backgroundRequest=request;backgroundPreparing=true;syncBackgroundControls();
 $('backgroundStatus').textContent='선택한 원본과 이전 합성 결과를 확인하고 있습니다…';
 showBackgroundProgress({status:'preparing',style:request.style,message:$('backgroundStatus').textContent});
 try{
  await cancellation;
  if(!backgroundRequestIsCurrent(request))return;
  await post('background-selection',{style:request.style,key:request.key});
  if(!backgroundRequestIsCurrent(request))return;
  const result=await post('background-prepare',{style:request.style,key:request.key,sourceUrl:request.sourceUrl,revision:request.revision,requestId:request.requestId});
  if(!backgroundRequestIsCurrent(request))return;
  if(result.ok!==true)throw Error(result.message||'합성 작업을 준비하지 못했습니다. 다시 눌러 주세요.');
  if(result.cached){
   if(result.applied!==false||typeof result.jobId!=='string'||!result.jobId)throw Error('이전 합성 결과의 적용 정보를 확인하지 못했습니다. 다시 눌러 주세요.');
   request.jobId=result.jobId;
   const completed=await post('background-complete',{jobId:result.jobId,reuse:true});
   if(!backgroundRequestIsCurrent(request))return;
   if(completed.ok!==true)throw Error(completed.message||'이전 합성 결과를 적용하지 못했습니다.');
   request.message=completed.message||'동일 원본의 완료된 합성을 대표이미지에 적용했습니다.';
   $('backgroundStatus').textContent=request.message;
   if(completed.waiting){
    backgroundWorkActive=true;backgroundPreparing=false;
    request.message=completed.message||'합성 완료 · 다른 작업이 끝나면 대표이미지에 적용합니다.';
    $('backgroundStatus').textContent=request.message;
    showBackgroundProgress({status:'applying-wait',style:request.style,message:request.message,startedAt:completed.startedAt});
    syncBackgroundControls();await refresh();return;
   }
   showBackgroundProgress({status:'complete',style:request.style,message:request.message,elapsedMs:completed.elapsedMs});
   announce($('backgroundStatus').textContent,'success');await refresh();return;
  }
  if(typeof result.jobId!=='string'||!result.jobId)throw Error('합성 작업 정보를 받지 못했습니다. 다시 눌러 주세요.');
  request.jobId=result.jobId;
  const dispatched=await post('background-dispatch',{jobId:request.jobId});
  if(!backgroundRequestIsCurrent(request))return;
  if(dispatched.ok!==true||dispatched.started!==true)throw Error(dispatched.message||'합성을 시작하지 못했습니다. 다시 눌러 주세요.');
  backgroundWorkActive=true;backgroundPreparing=false;
  request.message=dispatched.message||'합성을 시작했습니다. 생성·검수 후 대표이미지에 자동 적용합니다.';
  showBackgroundProgress({status:'waiting',style:request.style,message:request.message,startedAt:dispatched.startedAt});
  $('backgroundStatus').textContent=request.message;syncBackgroundControls();await refresh();
 }catch(error){if(backgroundRequestIsCurrent(request)){void cancelBackgroundRequest();$('backgroundStatus').textContent=error.message;showBackgroundProgress({status:'error',style:request.style,message:error.message});}}
 finally{
  if(backgroundRequest===request){
   if(!backgroundRequestIsCurrent(request))void cancelBackgroundRequest();
   else backgroundPreparing=false;
   syncBackgroundControls();
  }
 }
};

// SmartStore is a separate no-save path; Lotte controls retain their behavior.
let browserLoginStatus=null,browserLoginSaving=false,browserLoginChannel='lotte',browserLoginView=0;
function showBrowserLoginStatus(status){
 browserLoginStatus=status;
 $('browserLoginMessage').textContent=!status.supported?'자동 로그인 암호화 저장은 Windows에서 지원합니다.':status.configured?(status.enabled?'자동 로그인 사용 중':'자동 로그인 꺼짐')+' · 저장 계정 '+status.accountHint+' · 변경할 때만 아이디와 비밀번호를 모두 입력하세요.':'처음 한 번 아이디와 비밀번호를 입력해 저장하세요.';
 $('browserLoginEnabled').checked=status.configured?status.enabled:true;
 $('browserLoginType').value=status.loginType||'naver';
 $('deleteBrowserLogin').disabled=!status.configured;
}
$('browserLoginSettings').onclick=async()=>{
 const view=++browserLoginView;browserLoginChannel=activeChannel();browserLoginStatus=null;
 const smart=browserLoginChannel==='smartstore';
 $('browserLoginHeading').textContent=(smart?'스마트스토어':'롯데')+' 자동 로그인 설정';
 $('browserLoginIntro').textContent=(smart?'스마트스토어':'롯데')+' 전용 크롬 연결·상품 입력 시작 시, 로그인이 필요한 화면에서 저장한 계정으로 한 번 자동 로그인합니다. 이미 로그인되어 있으면 그대로 사용합니다.';
 $('browserLoginUsernameLabel').textContent=smart?'스마트스토어 로그인 아이디':'롯데 아이디';$('browserLoginPasswordLabel').textContent=smart?'스마트스토어 로그인 비밀번호':'롯데 비밀번호';
 $('browserLoginTypeLabel').hidden=!smart;
 $('browserLoginForm').reset();$('browserLoginMessage').textContent='저장 상태 확인 중…';$('saveBrowserLogin').disabled=true;$('deleteBrowserLogin').disabled=true;$('browserLoginDialog').showModal();
 try{const r=await fetch('/api/browser-login-status?channel='+browserLoginChannel);const status=await r.json();if(view!==browserLoginView)return;if(!r.ok)throw Error(status.error);showBrowserLoginStatus(status);$('saveBrowserLogin').disabled=!status.supported;}
 catch(error){if(view===browserLoginView)$('browserLoginMessage').textContent=error.message;}
};
$('closeBrowserLogin').onclick=()=>{if(!browserLoginSaving){browserLoginView++;$('browserLoginForm').reset();$('browserLoginDialog').close();}};
$('browserLoginDialog').addEventListener('cancel',event=>{if(browserLoginSaving)event.preventDefault();else{browserLoginView++;$('browserLoginForm').reset();}});
$('browserLoginDialog').addEventListener('close',()=>{if(!$('browserLoginDialog').open){browserLoginView++;$('browserLoginForm').reset();}});
async function saveBrowserLogin(action){
 browserLoginSaving=true;$('saveBrowserLogin').disabled=true;$('deleteBrowserLogin').disabled=true;$('closeBrowserLogin').disabled=true;
 try{const status=await post('browser-login-settings',{channel:browserLoginChannel,loginType:browserLoginChannel==='smartstore'?$('browserLoginType').value:undefined,action,enabled:$('browserLoginEnabled').checked,username:action==='save'?$('browserLoginUsername').value:'',password:action==='save'?$('browserLoginPassword').value:''});$('browserLoginForm').reset();showBrowserLoginStatus(status);$('browserLoginMessage').textContent=action==='delete'?'이 PC에 저장한 자동 로그인 정보를 삭제했습니다.':status.enabled?'이 PC에 암호화 저장했습니다. 크롬 연결·상품 입력 시작 시 로그인이 필요하면 자동으로 시도합니다.':'자동 로그인을 껐습니다. 저장 정보는 이 PC에 유지합니다.';}
 catch(error){$('browserLoginMessage').textContent=error.message;}
 finally{browserLoginSaving=false;$('browserLoginPassword').value='';$('saveBrowserLogin').disabled=!browserLoginStatus?.supported;$('deleteBrowserLogin').disabled=!browserLoginStatus?.configured;$('closeBrowserLogin').disabled=false;}
}
$('browserLoginForm').onsubmit=event=>{event.preventDefault();void saveBrowserLogin('save');};
$('deleteBrowserLogin').onclick=()=>void saveBrowserLogin('delete');
$('smartstoreOpen').onclick=async()=>{try{await openSellerCenter('smartstore');announce('로그인 후 원하는 상품의 복사등록 화면을 직접 열고 시작을 눌러 주세요.','success');}catch(e){$('error').textContent=e.message;}};
async function arrangeSmartstoreTitle(useCurrent=true){
 if(!product||activeChannel()!=='smartstore')return;
 if(product.smartstoreNameUserEdited&&useCurrent)return;
 const current=product,field=$('smartstoreName'),view=channelViewId;
 const {smartstoreTitle}=await import('/smartstore-title.mjs');
 if(product!==current||view!==channelViewId||activeChannel()!=='smartstore')return;
 field.value=smartstoreTitle({...current,name:$('form').elements.name.value,gender:$('form').elements.gender.value,smartstoreName:useCurrent?field.value:''});
 $('smartstoreNameStatus').textContent=smartstoreTitleStatus(field.value,'상품정보 기준 정리');
}
function smartstoreTitleStatus(title,note){
 const length=[...title].length;
 return length+'자 / 27~39자 · '+(length<27?'보강 필요 · ':length>39?'길이 초과 · ':'')+note;
}
$('smartstoreName').oninput=()=>{if(product){product.smartstoreNameUserEdited=true;product.smartstoreName=$('smartstoreName').value;}$('smartstoreNameStatus').textContent=[...$('smartstoreName').value].length+'자 · 수정한 상품명 그대로 사용';};
async function optimizeSmartstoreTitle({remember=false}={}){
 if(requestLock||serverBusy||!product)return;
 const current=product,field=$('smartstoreName');
 const snapshot={style:product.style,name:$('form').elements.name.value,gender:$('form').elements.gender.value,smartstoreName:field.value};
 requestLock=true;syncButtons();$('smartstoreOptimizeTitle').textContent='상품명 최적화 중…';$('naverTitleResult').textContent='네이버 검색 관심도를 조회하고 있습니다…';$('naverTitleCandidates').replaceChildren();
 try{
   const result=await post('smartstore-optimize-title',{product:snapshot});
   const stale=product!==current||field.value!==snapshot.smartstoreName||$('form').elements.name.value!==snapshot.name||$('form').elements.gender.value!==snapshot.gender;
   if(stale){$('naverTitleResult').textContent='조회 중 상품명이 바뀌어 제안값을 적용하지 않았습니다. 다시 조회해 주세요.';return;}
   if(result.hasData||result.researchUsed){current.smartstoreNameUserEdited=false;current.smartstoreName=result.title;field.value=result.title;$('smartstoreNameStatus').textContent=smartstoreTitleStatus(field.value,result.hasData?'네이버 검색 관심도 비교':'연결 자료·공식 상품 근거 참고');}
   if(remember&&(result.hasData||result.researchUsed))rememberProductField('smartstoreName',field.value);
   $('naverTitleDetail').textContent=result.period?result.source+' · '+result.period.startDate+' ~ '+result.period.endDate+(result.fromCache?' · 최근 조회 재사용':'')+' · '+(result.expanded?'인기 검색어 '+result.candidates.length+'개 비교 · '+result.length+'자':result.hasData?'성별 표현 비교 '+result.comparedDays+'일 / 특성 순서 비교 '+result.featureComparedDays+'일':'조회 자료가 없어 기존 상품명 유지')+' · '+result.note:result.source+' · '+result.note+' 참고 표현: '+(result.referenceTerms||[]).join(', ');
   $('naverTitleResult').textContent=result.period?result.period.startDate+' ~ '+result.period.endDate+' · 후보 '+result.candidates.length+'개 비교':result.source;
   for(const entry of result.candidates){const li=document.createElement('li');li.textContent=entry.keyword+': '+(result.expanded?'비교 기준 대비 검색 관심도 '+entry.score.toFixed(3):entry.mean===null?'자료 없음':'반환된 일별 상대지수 평균 '+entry.mean.toFixed(2)+' · '+entry.pointCount+'일');$('naverTitleCandidates').append(li);}
   $('error').textContent='';
 }catch(e){$('naverTitleResult').textContent='네이버 조회 실패 · 기존 상품명 유지 · '+e.message;}
 finally{requestLock=false;$('smartstoreOptimizeTitle').textContent='상품명 자동 최적화';syncButtons();}
}
$('smartstoreOptimizeTitle').onclick=async()=>{
 if(requestLock||serverBusy||!product)return;
 try{await arrangeSmartstoreTitle();await optimizeSmartstoreTitle({remember:true});}
 catch(e){$('naverTitleResult').textContent=e.message;}
};
const autoNaverProducts=new WeakSet();
async function autoOptimizeSmartstoreTitle(){
 if(!product||product.smartstoreNameUserEdited||document.body.dataset.channel!=='smartstore'||requestLock||serverBusy||autoNaverProducts.has(product))return;
 const current=product;
 autoNaverProducts.add(current);
 try{
   if(!$('smartstoreName').value.trim())await arrangeSmartstoreTitle();
   const before={name:$('form').elements.name.value,gender:$('form').elements.gender.value,title:$('smartstoreName').value};
   const response=await fetch('/api/naver-status',{signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('네이버 연결 상태를 확인하지 못했습니다. 제안 버튼으로 다시 조회해 주세요.');
   const status=await response.json();
   if(product!==current||document.body.dataset.channel!=='smartstore'||requestLock||serverBusy)return;
   if(before.name!==$('form').elements.name.value||before.gender!==$('form').elements.gender.value||before.title!==$('smartstoreName').value)return;
   if(!status.configured&&!status.researchConfigured){$('naverTitleResult').textContent='네이버 API 키를 처음 한 번 연결하면 상품 수집 후 상품명을 자동으로 제안합니다.';return;}
   await optimizeSmartstoreTitle();
 }catch(e){if(product===current&&document.body.dataset.channel==='smartstore')$('naverTitleResult').textContent=e.message;}
}
$('naverSettings').onclick=async()=>{
 $('naverSettingsForm').reset();$('naverSettingsMessage').textContent='';$('naverSettingsDialog').showModal();
 try{const r=await fetch('/api/naver-status');if(!r.ok)throw Error('연결 상태를 확인하지 못했습니다.');const s=await r.json();$('naverSettingsMessage').textContent=s.configured?'키가 설정되어 있습니다. 실제 조회 성공 여부는 상품명 제안 버튼으로 확인하세요.':'NAVER API HUB에서 발급한 Client ID와 Client Secret을 입력해 주세요.';}catch(e){$('naverSettingsMessage').textContent=e.message;}
};
$('closeNaverSettings').onclick=()=>{$('naverSettingsForm').reset();$('naverSettingsDialog').close();};
$('naverSettingsDialog').addEventListener('close',()=>$('naverSettingsForm').reset());
$('naverSettingsForm').onsubmit=async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{await post('naver-settings',{clientId:$('naverClientId').value,clientSecret:$('naverClientSecret').value});showNaverConnection(true);$('naverSettingsForm').reset();$('naverSettingsDialog').close();$('naverTitleResult').textContent='네이버 API 키 설정 완료';if(product)autoNaverProducts.delete(product);await autoOptimizeSmartstoreTitle();void writePopularKeywords();}
 catch(e){$('naverSettingsMessage').textContent=e.message;}
 finally{button.disabled=false;}
};
const beforeSmartstorePopulate=populate;populate=function(p){
 beforeSmartstorePopulate(p);if(activeChannel()!=='smartstore'){void writePopularKeywords();return;}populateSmartstoreFields(p);
};
function populateSmartstoreFields(p){$('smartstorePrice').value=p.consumerPrice||'';
 setProductInput($('smartstoreName'),p.smartstoreName||'',p);
 if(p.smartstoreNameUserEdited)$('smartstoreNameStatus').textContent=[...$('smartstoreName').value].length+'자 · 수정한 상품명 그대로 사용';
 $('naverTitleResult').textContent='네이버 데이터 조회 전';$('naverTitleDetail').textContent='';$('naverTitleCandidates').replaceChildren();
 arrangeSmartstoreTitle().then(autoOptimizeSmartstoreTitle).catch(e=>{$('smartstoreNameStatus').textContent=e.message;});
};

// Entering SmartStore may suggest a title; Lotte registration handlers stay unchanged.
function selectRegistrationChannel(channel){
 if(requestLock||serverBusy){announce('진행 중인 작업이 끝난 뒤 채널을 전환해 주세요.','failed');return;}
 const smart=channel==='smartstore';channelViewId++;
 buttonLabels.collect=smart?'공식몰 정보 가져오기':'2. 공식몰 정보 수집';
 busyLabels.collect='공식몰 정보 수집 중…';
 document.body.dataset.channel=smart?'smartstore':'lotte';
 $('channelLotte').setAttribute('aria-pressed',String(!smart));
 $('channelSmartstore').setAttribute('aria-pressed',String(smart));
 $('activeChannelName').textContent=smart?'스마트스토어':'롯데ON';
 $('activeChannelName').className=smart?'smartstore-brand':'lotteon-brand';
 document.title=smart?'스마트스토어 상품등록기':'롯데ON 상품등록기';
 try{sessionStorage.setItem('registrationChannel',smart?'smartstore':'lotte');}catch{}
 $('saveDetailImages').textContent=smart?'스마트스토어 상세페이지 만들기·저장':'상세이미지 저장';
 syncButtons();
 clearTimeout(smartstoreDetailTimer);detailPreviewResizeObserver?.disconnect();$('detailPreview').replaceChildren();delete $('detailPreview').dataset.renderSignature;delete $('detailPreview').dataset.photoRevision;
 $('smartstoreListingExtras').replaceChildren();delete $('smartstoreListingExtras').dataset.stamp;
 for(const key of ['main','extra1','extra2'])$(key).removeAttribute('src');
 if(product){if(smart){populateSmartstoreFields(product);$('detailPreviewStatus').textContent='스마트스토어 화면을 불러오는 중…';}else{renderExtraImages(product,true);$('main').hidden=false;$('main').src='/image/main?t='+Date.now();renderDetailPreview(product);}}
 if(smartstoreListingState){const view={...smartstoreListingState,smartstoreListing:null,tagResearch:null};syncListingImages(view);}
 scheduleLotteCategoryCheck();
 void refresh();
}
$('channelLotte').onclick=()=>selectRegistrationChannel('lotte');
$('channelSmartstore').onclick=()=>selectRegistrationChannel('smartstore');
// Give the busy indicator a frame before preparing the request payload.
function paintSmartstoreStart(){return new Promise(resolve=>{
 let frame,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(fallback);cancelAnimationFrame(frame);resolve();};
 const fallback=setTimeout(finish,100);frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(finish);});
});}
$('smartstoreStart').onclick=async()=>{
 if(requestLock||serverBusy)return;
 const style=$('style').value.trim()||product?.style;
 if(!style){showMissingStyle('품번 또는 공식몰 상품 URL을 먼저 입력해 주세요.');return;}
 smartstoreRequestAt=Date.now();document.dispatchEvent(new CustomEvent('smartstore-auto-request',{detail:{status:'starting'}}));
 requestLock=true;smartstoreStarting=true;$('error').textContent='';$('smartstoreStart').disabled=true;syncButtons();announce('시작 요청 접수 중 · 수정/복사등록 화면을 확인합니다.');
 const retry=smartstoreRetry();
 try{
  await paintSmartstoreStart();
  await post('smartstore-auto',{style,detailTemplate:product?.detailTemplate===2?2:1,selectedTitle:product?{style:product.style,title:$('smartstoreName').value}:undefined,edits:currentProductEdits(),selectedTags:currentManualTags(),resumeId:retry?.id});
  serverBusy=true;serverPhase='smartstore-auto';announce(retry?'이어서 진행 · 이전 입력 확인 중':'자동 작업 시작 · 선택한 수정/복사등록 화면에 업로드합니다.');void refresh();
 }catch(e){
  smartstoreRequestAt=0;document.dispatchEvent(new CustomEvent('smartstore-auto-request',{detail:{status:'failed',error:e.message}}));$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');void refresh();
 }finally{requestLock=false;smartstoreStarting=false;syncButtons();}
};
const styleInput=$('style');
const updateStyleDigits=()=>styleInput.toggleAttribute('data-numeric',/^\d+$/.test(styleInput.value.trim()));
styleInput.addEventListener('input',()=>{
 updateStyleDigits();
 syncButtons();
});
window.addEventListener('pageshow',updateStyleDigits);
$('smartstoreDetailOnly').onclick=async()=>{
 if(requestLock||serverBusy)return;
 if(!product){$('error').textContent='먼저 상품 정보와 상세 미리보기를 준비해 주세요.';return;}
 requestLock=true;smartstoreDetailStarting=true;$('error').textContent='';syncButtons();announce('상세설명 교체 중 · 실행을 시작합니다.');
 try{await post('smartstore-detail-only',{product:smartstoreDetailFields()});serverBusy=true;serverPhase='smartstore-detail-only';announce('상세설명만 교체 중 · 다른 항목과 상품 저장은 건드리지 않습니다.');}catch(e){$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');}finally{requestLock=false;smartstoreDetailStarting=false;syncButtons();}
};
const autoStageLabels={connect:'로그인 확인',collect:'공식몰 수집',prepare:'사진·색상 대조',compose:'사진 합성',detail:'상세페이지 제작',upload:'스마트스토어 업로드',done:'편집기 준비 완료'};
try{if(sessionStorage.getItem('registrationChannel')==='smartstore')selectRegistrationChannel('smartstore');}catch{}

function renderExtraImages(p,refresh=false){
 if(activeChannel()!=='lotte')return;
 $('extraImages').hidden=false;
 const count=['extra1','extra2'].filter(k=>p.images[k]).length;
 $('extraImageStatus').textContent=count?'추가이미지 '+count+'장':'추가이미지가 없습니다.';
 for(const key of ['extra1','extra2']){
  const present=!!p.images[key],number=key==='extra1'?'1':'2';
  $(key+'Card').hidden=!present;$(key).hidden=!present;$('saveExtra'+number).hidden=!present;
  if(present){if(refresh||!$(key).getAttribute('src'))$(key).src='/image/'+key+'?t='+Date.now();}
  else $(key).removeAttribute('src');
 }
}
function syncExtraImages(s){
 if(!product||product.style!==s.product?.style)return;
 if(['extra1','extra2'].some(key=>product.images[key]!==s.product.images[key])){
  product.images={...s.product.images};renderExtraImages(product);
 }
}
let removingExtra=false;
async function removeExtraImage(key){
 if(removingExtra||!product)return;removingExtra=true;
 $('removeExtra1').disabled=true;$('removeExtra2').disabled=true;
 try{const result=await post('exclude-extra-image',{style:product.style,key});product.images=result.images;renderExtraImages(product);announce((key==='extra1'?'추가이미지 1':'추가이미지 2')+'을 업로드 대상에서 제외했습니다.','success');}
 catch(e){announce(e.message,'failed');}
 finally{removingExtra=false;$('removeExtra1').disabled=false;$('removeExtra2').disabled=false;}
}
$('removeExtra1').onclick=()=>removeExtraImage('extra1');
$('removeExtra2').onclick=()=>removeExtraImage('extra2');

// Keyword requests never overwrite edits made while a request is running.
let keywordRequest=0;
async function writePopularKeywords(){
 if(!product||serverBusy||activeChannel()!=='lotte')return;
 if(Object.hasOwn(editedValuesFor(product),'keywords')){$('keywordStatus').textContent='직접 수정한 키워드 유지';return;}
 const current=product,field=$('form').elements.keywords,before=field.value,id=++keywordRequest,view=channelViewId;
 $('keywordStatus').textContent='네이버에서 상품 관련 키워드의 검색 관심도를 비교하고 있습니다…';
 try{
  const result=await post('naver-keywords',{style:current.style});
  if(view!==channelViewId||activeChannel()!=='lotte')return;if(id!==keywordRequest||product!==current||field.value!==before){if(id===keywordRequest)$('keywordStatus').textContent='조회 중 상품 또는 입력값이 바뀌어 자동 적용하지 않았습니다.';return;}
  field.value=result.keywords;product.keywords=result.keywords;
  const keywordLengthNote=result.needsMoreKeywords?' · 관련 검색자료 부족으로 35자 미만 (임의 보강 없음)':' · 지오다노 첫 번째 · 37자 내외 목표';
  $('keywordStatus').textContent=result.length+'자(쉼표 포함) · '+result.source+' · '+result.period.startDate+' ~ '+result.period.endDate+' · 월간 검색횟수 아님'+(result.categoryAudit?' · 카테고리 일치 '+result.categoryAudit.entries.filter(e=>e.status==='verified').length+'개 / 제외 '+result.categoryAudit.entries.filter(e=>e.status==='excluded'||e.status==='product-review').length+'개 / 미검증 '+result.categoryAudit.entries.filter(e=>e.status==='unverified').length+'개':'');
  $('keywordStatus').textContent+=keywordLengthNote;
 }catch(e){if(id===keywordRequest&&product===current)$('keywordStatus').textContent='기존 키워드 유지 · '+e.message;}
}
function showNaverConnection(connected,detail=''){
 $('naverConnectionStatus').textContent=connected?'네이버 API 연결됨':'네이버 연결 확인 필요';
 $('naverConnectionStatus').dataset.connected=String(connected);
 $('naverConnectionDetail').textContent=detail;
}
async function verifyNaverConnection(){
 $('naverVerify').disabled=true;
 $('naverConnectionStatus').textContent='네이버 인증 확인 중…';
 try{const result=await post('naver-verify',{});showNaverConnection(result.verified===true);return result.verified===true;}
 catch(e){showNaverConnection(false,e.message);return false;}
 finally{$('naverVerify').disabled=false;}
}
$('naverVerify').onclick=async()=>{await verifyNaverConnection();};
async function loadNaverConnection(){
 try{
  const response=await fetch('/api/naver-status',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('연결 상태를 확인하지 못했습니다.');
  const status=await response.json();
  if(!status.configured){$('naverConnectionStatus').textContent='네이버 연결 설정 필요';return;}
  if(status.verified)showNaverConnection(true);
  else if(!await verifyNaverConnection()){ $('naverConnectionDetail').textContent+=' · 15초 후 자동 재연결';setTimeout(loadNaverConnection,15000);}
 }catch(e){showNaverConnection(false,e.message+' · 15초 후 자동 재연결');setTimeout(loadNaverConnection,15000);}
};
void loadNaverConnection();
if(new URLSearchParams(location.search).get('settings')==='naver')$('naverSettings').click();


$('form').addEventListener('input',event=>{if(!['name','gender','material','colors','sizes'].includes(event.target.name)||document.body.dataset.channel!=='smartstore')return;clearTimeout(smartstoreDetailTimer);smartstoreDetailTimer=setTimeout(()=>{if(product&&!serverBusy&&document.body.dataset.channel==='smartstore')renderDetailPreview(product);},700);});

function syncListingImages(state){
 const custom=$('smartstoreListingExtras'),original=$('originalExtraPreviews');
 const listing=state.smartstoreListing,smart=document.body.dataset.channel==='smartstore';
 const note=$('mainSourceNote');if(!note.dataset.original)note.dataset.original=note.textContent;
 note.textContent=smart?(listing?listing.sourceNames[0]+' · '+listing.mainColor:'사진 색상·구도 수정에서 대표사진을 선택해 주세요.'):note.dataset.original;
 $('main').hidden=smart&&!listing;
 $('colorChipStatus').hidden=smart;$('extendBackground').hidden=smart;
 $('downloadMain1500').textContent=smart?'대표이미지 원본 저장':'대표이미지 1500×1500 저장';
 $('main').alt=smart?'선택한 대표사진 원본':'1500×1500 대표이미지';
 document.querySelector('.main-image-heading h3').textContent=smart?'대표이미지 · 선택한 사진':'대표이미지';

 custom.hidden=!smart||!listing;original.hidden=smart;
 const extraCount=listing?.extraColors.length||0;
 const extraHeading=$('extraImages').querySelector('h3');
 const extraTitle=smart?(extraCount?'추가이미지 '+extraCount+'장':'추가이미지'):'추가이미지 (최대 2장)';
 if(extraHeading.textContent!==extraTitle)extraHeading.textContent=extraTitle;
 if(!smart||!listing||!product||product.style!==state.product?.style)return;
 const base='/smartstore-listing/',query='?style='+encodeURIComponent(product.style)+'&v='+encodeURIComponent(listing.detailRevision||'');
 const main=base+'main'+query;if($('main').getAttribute('src')!==main)$('main').src=main;
 const stamp=product.style+'#template'+(product.detailTemplate===2?2:1)+JSON.stringify(listing)+'@'+String(state.release?.version||'');
 if(!state.busy&&$('detailPreview').dataset.photoRevision!==stamp){
  renderDetailPreview(product);$('detailPreview').dataset.photoRevision=stamp;
 }
 if(custom.dataset.stamp!==stamp){
  custom.dataset.stamp=stamp;custom.replaceChildren();
  listing.extraColors.forEach((color,i)=>{const card=document.createElement('div');card.className='extra-image-card';const img=document.createElement('img');img.src=base+'extra-'+i+query;const official=listing.extraRoles?.[i]==='official-main',angle=official||listing.extraRoles?.[i]==='provided'?'':listing.extraRoles?.[i]==='alternate'?'다른 구도':color===listing.mainColor?'옆면':'정면';img.alt=color+(angle?' '+angle:'');const name=document.createElement('p');name.textContent=official?'공식몰 대표사진 · 추가 1':color+(angle?' · '+angle:'');const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=official?'공식몰 원본 저장':'원본 저장';button.onclick=()=>saveSelectedImage('extra-'+i,button);card.append(img,name,button);custom.append(card);});
 }
 $('extraImageStatus').textContent=listing.previewOnly?'사진을 선택·반영하면 추가이미지가 표시됩니다.':extraCount?'':'추가이미지가 없습니다.';
 $('extraImages').hidden=false;
}

function renderResearchTags(state){
 if(activeChannel()!=='smartstore')return;
 const panel=$('researchTagStatus');if(!panel)return;
 const research=effectiveTagResearch(state),container=$('researchTagCandidates');tagResearchReady=!!research?.candidates?.length||!!research?.manual;
 $('smartstoreAutoTags').disabled=requestLock||state.busy||!tagResearchReady;
 const allowed=new Map((research?.candidates||[]).map(t=>[t.id,t.name]));
 const currentReport=result=>result&&result.style===state.product?.style&&Array.isArray(result.selectedTags)&&result.selectedTags.every(t=>allowed.get(t.id)===t.name)?result:null;
 const report=currentReport(state.tagResult),validation=currentReport(state.tagValidation);
 const verified=report?.selectedTags||validation?.selectedTags||[];
 const entries=(research?.manual?research.candidates:verified.length?verified:research?.candidates||[]).slice(0,10),names=entries.map(t=>t.name),key=JSON.stringify(entries.map(t=>[t.id,t.name]));
 if(container.dataset.names!==key){container.dataset.names=key;container.replaceChildren();for(const tag of entries){const chip=document.createElement('span');chip.append(document.createTextNode('#'+tag.name));const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.className='tag-remove';remove.setAttribute('aria-label',tag.name+' 추천에서 삭제');remove.onclick=()=>removeRecommendedTag(tag,remove);chip.append(remove);container.append(chip);}}
 for(const button of container.querySelectorAll('.tag-remove'))button.disabled=state.busy||!state.capabilities?.manualTags;
 panel.textContent=state.busy&&state.phase==='smartstore-tags'?'현재 상품의 태그를 입력·확인하고 있습니다…':report?'자동입력 '+report.tagCount+'/10개 · '+(report.tagCount<10?(10-report.tagCount)+'개 보강 필요':report.searchTagsVerified?'검색 적용 확인 완료':'진행 기록 확인'):validation?'검증 '+validation.tagCount+'/10개 · 기존 폼 태그 복원 완료':'조사 자료 '+(research?.count||0).toLocaleString()+'개 · '+(names.length?'상품 연관 후보 '+research.candidates.length+'개 · 상위 '+names.length+'개 표시':'확인 필요 · 상품 근거에 맞는 사전 후보 0개 · 태그 미적용');
}
$('smartstoreAutoTags').onclick=async()=>{
 if(requestLock||serverBusy||!product||document.body.dataset.channel!=='smartstore')return;
 requestLock=true;syncButtons();
 try{await flushManualTagSelection();await post('smartstore-tags',{style:product.style,selectedTags:currentManualTags()});serverBusy=true;serverPhase='smartstore-tags';$('error').textContent='';announce('선택 태그 입력 시작 · 상품 저장 없이 진행합니다.');}
 catch(e){$('error').textContent=e.message;}
 finally{requestLock=false;syncButtons();}
};


// Preserve deliberate edits per style; newly collected source images stay server-owned.
const manualProductFields=new Set(['name','gender','consumerPrice','colors','sizes','material','country','manufactured','washing','keywords','commonMiddle','commonSmall','channelMiddle','channelSmall','lotteCategorySelection','smartstoreName','templateHeadline','templateHeadline1','templateHeadline2']);
const localProductEdits=new Map();
let productInputComposition=null;
for(const control of [$('form'),$('smartstoreName')]){
 control.addEventListener('compositionstart',event=>{
  productInputComposition={field:event.target,style:product?.style};
 });
 control.addEventListener('compositionend',()=>{productInputComposition=null;});
}
function setProductInput(field,value,p){
 if(productInputComposition?.field===field&&productInputComposition.style===p.style)return;
 const key=field.id==='smartstoreName'?'smartstoreName':field.name;
 const edits=editedValuesFor(p);
 const next=String(Object.hasOwn(edits,key)?edits[key]:value??'');
 // Avoid normalizing and restoring an edited value, which moves its caret and interrupts IME.
 if(field.value!==next)field.value=next;
}
function editedValuesFor(p){
 if(!localProductEdits.has(p.style)){
  let saved={};try{saved=JSON.parse(localStorage.getItem('product-edits.v1.'+p.style)||'{}');}catch{}
  if(typeof saved?.material==='string'&&!saved.material.trim())delete saved.material;
  const fields={...p.userEditedFields,...saved};
  if(p.smartstoreNameUserEdited&&!Object.hasOwn(fields,'smartstoreName'))fields.smartstoreName=p.smartstoreName;
  localProductEdits.set(p.style,Object.fromEntries(Object.entries(fields).filter(([k,v])=>manualProductFields.has(k)&&typeof v==='string'&&v.length<=2000&&(k!=='material'||v.trim()))));
 }
 return localProductEdits.get(p.style);
}
function rememberProductField(key,value){
 if(!product||!manualProductFields.has(key))return;
 const fields=editedValuesFor(product);
 if(key==='material'&&!value.trim())delete fields.material;
 else fields[key]=value;
 try{localStorage.setItem('product-edits.v1.'+product.style,JSON.stringify(fields));}catch{}
}
function currentProductEdits(){
 if(!product)return undefined;
 const fields=editedValuesFor(product);return Object.keys(fields).length?{style:product.style,fields:{...fields}}:undefined;
}
function rememberProductInput(event){
 const key=event.target.id==='smartstoreName'?'smartstoreName':event.target.name;
 if(!manualProductFields.has(key))return;
 rememberProductField(key,event.target.value);
 if(key==='gender'&&event.type==='change')for(const dependent of ['name','commonMiddle','commonSmall','channelMiddle','channelSmall'])rememberProductField(dependent,$('form').elements[dependent].value);
}
$('form').addEventListener('input',rememberProductInput);$('form').addEventListener('change',rememberProductInput);
$('smartstoreName').addEventListener('input',rememberProductInput);
const populateWithManualEdits=populate;
populate=function(p){
 if(product?.style!==p.style)productInputComposition=null;
 const fields=editedValuesFor(p),reviewed={...p,category:{...p.category}};
 let manual=null,invalidManual=false;
 if(fields.lotteCategorySelection){try{const choice=JSON.parse(fields.lotteCategorySelection);if(choice.version!==1||choice.style!==p.style||choice.sourceUrl!==(p.sourceUrl||'')||choice.gender!==(fields.gender||p.gender)||!choice.category||lotteCategoryGenderConflict(choice.category,fields.gender||p.gender,p.sourceCategory||[]))throw Error('changed product');manual=choice;}catch{invalidManual=true;}}
 if(invalidManual){
  for(const key of [...lotteCategoryFields,'lotteCategorySelection'])delete fields[key];
  if(lotteCategoryGenderConflict(reviewed.category,fields.gender||p.gender,p.sourceCategory||[]))reviewed.category={...reviewed.category,manualSelection:null,channelMajor:'',channelMiddle:'',channelSmall:'',channelDetail:'',channelCodes:{}};
  try{localStorage.setItem('product-edits.v1.'+p.style,JSON.stringify(fields));}catch{}
 }
 for(const [key,value] of Object.entries(fields)){
  if(key==='lotteCategorySelection'||invalidManual&&lotteCategoryFields.includes(key))continue;
  if(['commonMiddle','commonSmall','channelMiddle','channelSmall'].includes(key))reviewed.category[key]=value;
  else if(key==='colors'||key==='sizes')reviewed[key]=value.split(',').map(s=>s.replace(/\s+/g,'')).filter(Boolean);
  else reviewed[key]=key==='consumerPrice'&&value!==''?Number(value):value;
 }
 if(manual)reviewed.category={...reviewed.category,...manual.category,manualSelection:manual};
 else if(Object.hasOwn(fields,'lotteCategorySelection'))delete reviewed.category.manualSelection;
 if(Object.hasOwn(fields,'smartstoreName'))reviewed.smartstoreNameUserEdited=true;
 populateWithManualEdits(reviewed);
 for(const [key,value] of Object.entries(fields)){
  if(key==='lotteCategorySelection'||invalidManual&&lotteCategoryFields.includes(key))continue;
  const field=key==='smartstoreName'?$('smartstoreName'):$('form').elements[key];if(field)setProductInput(field,value,p);
 }
 for(const key of Object.keys(fields))reviewedFields.add(key);
 highlightReviewFields();syncNoticeCopy();renderDetailPreview(reviewed);scheduleLotteCategoryCheck();
};

// Secure, optional photo-analysis setup.
const photoSettingsButton=document.createElement('button');photoSettingsButton.id='photoAnalysisSettingsButton';photoSettingsButton.type='button';photoSettingsButton.className='secondary';photoSettingsButton.textContent='사진 자동분석 연결';$('naverConnectionMenu').querySelector('.bar').append(photoSettingsButton);
const photoDialog=document.createElement('dialog');photoDialog.id='photoAnalysisDialog';photoDialog.innerHTML='<form id="photoAnalysisForm"><h3>사진 자동분석 연결</h3><p>새 품번의 사진을 공식 정보와 대조해 색상·각도·케어라벨을 자동 분류합니다.</p><label>OpenAI API 키<input id="photoAnalysisKey" type="password" autocomplete="off" spellcheck="false" required></label><small>키는 이 PC의 Windows 사용자 암호화로 보관하며 채팅이나 GitHub에 올리지 않습니다.</small><p id="photoAnalysisMessage" role="status"></p><div class="bar"><button type="submit">암호화 저장</button><button id="closePhotoAnalysis" class="secondary" type="button">닫기</button></div></form>';document.body.append(photoDialog);
photoSettingsButton.onclick=()=>{$('photoAnalysisForm').reset();$('photoAnalysisMessage').textContent=photoAnalysisConfigured?'연결키가 저장돼 있습니다. 실제 사진분석은 시작 버튼을 누를 때 실행합니다.':'한 번 연결하면 새 품번도 시작 버튼에서 사진을 자동 분류합니다.';photoDialog.showModal();};
$('closePhotoAnalysis').onclick=()=>photoDialog.close();photoDialog.addEventListener('close',()=>$('photoAnalysisForm').reset());
$('photoAnalysisForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await post('smartstore-ai-settings',{apiKey:$('photoAnalysisKey').value});photoAnalysisConfigured=true;$('photoAnalysisForm').reset();$('photoAnalysisMessage').textContent='암호화 저장 완료. 시작을 누르면 사진과 미리보기를 자동 준비합니다.';}catch(error){$('photoAnalysisMessage').textContent=error.message;}finally{button.disabled=false;}};
const photoPreparationStatus=document.createElement('p');photoPreparationStatus.id='photoPreparationStatus';photoPreparationStatus.className='note';photoPreparationStatus.setAttribute('role','status');$('mainSourceNote').insertAdjacentElement('afterend',photoPreparationStatus);
let photoAnalysisConfigured=false,manualTagStyle='',manualTagChoices=new Map(),manualTagHasSelection=false,tagSearchSequence=0,manualTagSaveQueue=Promise.resolve(),manualTagSaveVersion=0;
const tagTools=document.createElement('div');tagTools.className='manual-tag-tools';tagTools.innerHTML='<label class="sr-only" for="manualTagQuery">연관 태그 검색어</label><input id="manualTagQuery" type="search" maxlength="40" placeholder="예: 후드, 기모, 티셔츠" autocomplete="off"><button id="manualTagSearch" type="button" class="secondary">태그 찾기</button>';$('smartstoreAutoTags').insertAdjacentElement('afterend',tagTools);
const tagPicker=document.createElement('section');tagPicker.id='manualTagPicker';tagPicker.className='manual-tag-picker';tagPicker.hidden=true;tagPicker.innerHTML='<p id="manualTagSaveStatus" role="status"></p><p id="manualTagMessage" role="status"></p><div id="manualTagResults" class="manual-tag-results"></div><p id="manualTagSelectionStatus"></p><div id="manualTagChoices" class="manual-tag-choices"></div><button id="applyManualTags" type="button">선택 태그 검증·적용</button><small>체크·해제하면 등록기의 적용 태그에 바로 저장됩니다. 근거 없음 태그도 직접 선택할 수 있으며, 네이버 입력 시 검색 등록 여부를 확인합니다. 상품 저장은 하지 않습니다.</small>';$('researchTagCandidates').parentElement.append(tagPicker);
function drawManualTagChoices(){
 $('manualTagSelectionStatus').textContent='선택 '+manualTagChoices.size+'/10개 · 적용할 때 검색 등록 여부 확인';$('applyManualTags').disabled=!manualTagHasSelection||serverBusy;
 const list=$('manualTagChoices');list.replaceChildren();for(const tag of manualTagChoices.values()){const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='#'+tag.name+' ×';remove.setAttribute('aria-label',tag.name+' 선택 취소');remove.onclick=()=>{manualTagChoices.delete(tag.id);commitManualTagSelection();for(const box of $('manualTagResults').querySelectorAll('input[type=checkbox]'))if(box.dataset.id===tag.id)box.checked=false;};list.append(remove);}
}
function currentManualTags(){return manualTagStyle===product?.style&&manualTagHasSelection?[...manualTagChoices.values()]:undefined;}
function effectiveTagResearch(state){return manualTagStyle===state.product?.style&&manualTagHasSelection?{...state.tagResearch,manual:true,candidates:[...manualTagChoices.values()],manualTags:[...manualTagChoices.values()]}:state.tagResearch;}
function commitManualTagSelection(){
 manualTagHasSelection=true;drawManualTagChoices();if(smartstoreListingState)renderResearchTags(smartstoreListingState);
 const style=manualTagStyle,tags=[...manualTagChoices.values()],version=++manualTagSaveVersion;
 try{localStorage.setItem('smartstore-tags.v1.'+style,JSON.stringify({sourceUrl:product.sourceUrl,tags}));}catch{}
 $('manualTagSaveStatus').textContent='선택 태그를 저장 중…';
 manualTagSaveQueue=manualTagSaveQueue.catch(()=>{}).then(()=>post('smartstore-tags-selection',{style,tags}));
 manualTagSaveQueue.then(()=>{if(style===manualTagStyle&&version===manualTagSaveVersion)$('manualTagSaveStatus').textContent='선택한 '+tags.length+'개 태그가 등록기 적용 목록에 저장됐습니다. 네이버 입력은 태그 자동입력 또는 시작을 누르세요.';},error=>{if(style===manualTagStyle&&version===manualTagSaveVersion)$('manualTagSaveStatus').textContent='선택 저장 실패: '+error.message;});
}
async function flushManualTagSelection(){await manualTagSaveQueue;}
async function removeRecommendedTag(tag,button){
 if(!product||serverBusy||requestLock)return;
 if(!manualTagHasSelection){const tags=(smartstoreListingState?.tagResearch?.candidates||[]).slice(0,10);manualTagStyle=product.style;manualTagChoices=new Map(tags.map(t=>[t.id,{id:t.id,name:t.name}]));}
 manualTagChoices.delete(tag.id);tagPicker.hidden=false;commitManualTagSelection();
 for(const box of $('manualTagResults').querySelectorAll('input[type=checkbox]'))if(box.dataset.id===tag.id)box.checked=false;
}
function syncEnhancedFeatures(state){
 if(activeChannel()!=='smartstore')return;
 photoAnalysisConfigured=!!state.backgroundConfigured;const p=state.product;if(!p)return;
 const status=state.photoPreparation?.style===p.style?state.photoPreparation:null;
 photoPreparationStatus.textContent=status?.message||state.smartstoreListing?.photoReview?.message|| (status?.status==='ready'?'사진 연결 확인 · 대표 1장 · 추가 '+status.extraCount+'장 · 상세사진 '+status.detailCount+'장':status?.status==='preparing'?'품번 폴더 사진을 추가이미지·상세 미리보기에 연결 중…':status?.message||(!state.smartstoreListing?'현재 품번 폴더의 사진을 확인해 주세요.':state.smartstoreListing.previewOnly?'대표사진만 우선 표시 중 · 정보 수집 또는 시작을 누르면 추가·상세사진을 연결합니다.':'품번 폴더 사진을 추가이미지·상세 미리보기에 연결했습니다.'));
 if(manualTagStyle!==p.style){manualTagStyle=p.style;manualTagHasSelection=!!state.tagResearch?.manual;manualTagChoices=new Map((state.tagResearch?.manualTags||[]).map(t=>[t.id,t]));let saved;try{saved=JSON.parse(localStorage.getItem('smartstore-tags.v1.'+p.style));}catch{}if(saved?.sourceUrl===p.sourceUrl&&Array.isArray(saved.tags)&&saved.tags.length<=10){manualTagHasSelection=true;manualTagChoices=new Map(saved.tags.map(t=>[t.id,t]));}$('manualTagSaveStatus').textContent=manualTagHasSelection?'선택한 태그를 등록기에 적용했습니다. 네이버 입력은 태그 자동입력 또는 시작을 누르세요.':'';$('manualTagResults').replaceChildren();tagPicker.hidden=!manualTagHasSelection;drawManualTagChoices();}
 const selectedResearch=effectiveTagResearch(state);if(selectedResearch?.manual){const pairs=tags=>(tags||[]).map(t=>t.id+'\t'+t.name).sort().join('\n');const verified=state.tagResult?.searchTagsVerified&&pairs(state.tagResult.selectedTags)===pairs(selectedResearch.candidates);$('researchTagStatus').textContent='직접 선택한 태그 '+selectedResearch.candidates.length+'/10개 · '+(verified?'최근 검색 적용 확인':'입력 시 네이버 검색 적용 재검증');}
 $('manualTagSearch').disabled=!!state.busy||!state.capabilities?.manualTags;$('applyManualTags').disabled=!!state.busy||!manualTagHasSelection;
}
$('manualTagSearch').onclick=async()=>{
 if(!product||requestLock||serverBusy)return;const query=$('manualTagQuery').value.trim();if(!query)return $('manualTagQuery').focus();
 const current=product,sequence=++tagSearchSequence,button=$('manualTagSearch');button.disabled=true;tagPicker.hidden=false;$('manualTagMessage').textContent='연관 태그를 찾고 있습니다…';
 try{const result=await post('smartstore-tags-search',{style:current.style,query});if(sequence!==tagSearchSequence||product?.style!==current.style)return;
  const list=$('manualTagResults');list.replaceChildren();for(const item of result.items){const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span');box.type='checkbox';box.dataset.id=item.id;box.checked=manualTagChoices.has(item.id);box.disabled=false;box.setAttribute('aria-label',item.name+' 선택');text.textContent='#'+item.name+(item.related?'':' · 근거 없음 · 직접 선택 가능');box.onchange=()=>{if(box.checked&&manualTagChoices.size>=10){box.checked=false;$('manualTagMessage').textContent='최대 10개입니다. 기존 선택을 하나 취소해 주세요.';return;}if(box.checked)manualTagChoices.set(item.id,{id:item.id,name:item.name});else manualTagChoices.delete(item.id);commitManualTagSelection();};label.append(box,text);list.append(label);}
  $('manualTagMessage').textContent=result.items.length?'연관 후보 '+result.total+'개 · '+result.source:'해당 단어의 조사 태그가 없습니다. 품목이나 특징 단어로 다시 찾아 주세요.';drawManualTagChoices();
 }catch(error){$('manualTagMessage').textContent=error.message;}finally{button.disabled=false;}
};
$('manualTagQuery').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();$('manualTagSearch').click();}});
$('applyManualTags').onclick=async()=>{if(!product||requestLock||serverBusy||!manualTagHasSelection)return;const button=$('applyManualTags');button.disabled=true;try{await flushManualTagSelection();await post('smartstore-tags-selected',{style:product.style,tags:[...manualTagChoices.values()]});serverBusy=true;serverPhase='smartstore-tags';syncButtons();$('manualTagMessage').textContent='선택한 태그만 네이버에서 검증·적용 중 · 상품 저장 안 함';}catch(error){$('manualTagMessage').textContent=error.message;}finally{button.disabled=serverBusy;}};

$('smartstoreImportPhotos').onclick=async()=>{
 if(requestLock||serverBusy)return;
 const style=$('style').value.trim()||product?.style;if(!/^\d{6}$/.test(style||'')){$('error').textContent='사진을 가져올 품번 6자리를 입력해 주세요.';return;}
 requestLock=true;$('error').textContent='';syncButtons();announce('판매자상품코드로 조회 후 색상별 사진 전체를 상세 템플릿에 자동 반영합니다.');
 try{await post('smartstore-import-photos',{style,edits:currentProductEdits()});serverBusy=true;serverPhase='smartstore-import-photos';}catch(e){$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');}finally{requestLock=false;syncButtons();}
};
function syncPhotoImport(state){
 const stage=state.photoImport,p=state.product,box=$('photoImportReview');
 box.hidden=document.body.dataset.channel!=='smartstore'||!stage||stage.style!==p?.style||stage.status==='applied';
 if(box.hidden)return;
 $('photoImportMessage').textContent=stage.status==='applied'?'✓ 착용사진 '+stage.selectedCount+'장 · 추가이미지와 상세 템플릿에 반영했습니다.':'사진을 확인한 뒤 적용해 주세요.';
 const grid=$('photoImportCandidates'),stamp=stage.style+stage.createdAt;
 if(grid.dataset.stamp===stamp)return;grid.dataset.stamp=stamp;grid.replaceChildren();
 for(const item of stage.candidates){
  const card=document.createElement('article');card.className='photo-import-card';card.dataset.id=item.id;
  const img=document.createElement('img');img.src='/smartstore-import-photo/'+item.id;img.alt=item.colorHint+' 수집 사진';
  const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.className='photo-import-include';check.setAttribute('aria-label',item.id+' 사진 사용');label.append(check,document.createTextNode('이 사진 사용'));
  const color=document.createElement('select');color.className='photo-import-color';color.setAttribute('aria-label',item.id+' 색상');
  for(const value of p.colors){const option=document.createElement('option');option.value=value;option.textContent=value;color.append(option);}color.value=item.colorHint||'';
  const role=document.createElement('select');role.className='photo-import-role';role.setAttribute('aria-label',item.id+' 각도');
  for(const [value,text] of [['','각도 확인'],['front','정면'],['side','측면'],['back','뒷면'],['detail','디테일']]){const option=document.createElement('option');option.value=value;option.textContent=text;role.append(option);}
  card.append(img,label,color,role);grid.append(card);
 }
}
$('photoImportApply').onclick=async()=>{
 if(requestLock||serverBusy||!product)return;
 const photos=[...document.querySelectorAll('.photo-import-card')].filter(c=>c.querySelector('.photo-import-include').checked).map(c=>({id:c.dataset.id,color:c.querySelector('.photo-import-color').value,role:c.querySelector('.photo-import-role').value}));
 if(!photos.length||photos.some(p=>!p.color||!p.role)){$('photoImportMessage').textContent='사용할 착용사진을 선택하고 색상과 각도를 확인해 주세요.';return;}
 requestLock=true;syncButtons();$('error').textContent='';
 try{await post('smartstore-import-photos-apply',{style:product.style,photos});serverBusy=true;serverPhase='smartstore-import-photos';announce('선택한 착용사진을 등록기·상세 템플릿에 연결합니다.');}catch(e){$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');}finally{requestLock=false;syncButtons();}
};

// Template choice updates the preview and the same selection is sent to every execution path.
for(const detailTemplate of [1,2])if($('smartstoreTemplate'+detailTemplate))$('smartstoreTemplate'+detailTemplate).onclick=async()=>{
 if(requestLock||serverBusy||!product||document.body.dataset.channel!=='smartstore')return;
 const style=product.style;requestLock=true;syncButtons();
 try{await post('smartstore-template',{style,detailTemplate,edits:currentProductEdits()});if(product?.style!==style)return;product.detailTemplate=detailTemplate;if(typeof syncTemplateHeadlineInput==='function')syncTemplateHeadlineInput();renderDetailPreview(product);announce('템플릿 '+detailTemplate+' 선택됨','success');}
 catch(error){$('error').textContent=error.message;}
 finally{requestLock=false;syncButtons();}
};


if($('smartstoreCombinePhotos'))$('smartstoreCombinePhotos').onclick=async()=>{
 if(activeChannel()!=='smartstore'||requestLock||serverBusy)return;
 const input=$('style').value.trim()||product?.style;
 if(!input)return announce('품번 또는 공식몰 주소를 입력해 주세요.','failed');
 const button=$('smartstoreCombinePhotos');requestLock=true;button.textContent='마네킨샷+공홈 조합 중…';syncButtons();
 try{if(product&&(input===product.style||input===product.sourceUrl))await post('smartstore-combine-photos',{style:product.style,channel:'smartstore'});else await post('collect',{style:input,channel:'smartstore'});announce('폴더 원본 전체와 공홈 자료를 조합합니다. 추가·상세 미리보기를 확인해 주세요.','progress');}
 catch(error){announce(error.message,'failed');}
 finally{requestLock=false;button.textContent='📁＋🌐 마네킨샷+공홈 조합 (새로 업로드 시 사용)';syncButtons();await refresh();}
};

// Arrange the existing controls; keep their nodes, values and event handlers intact.
(()=>{
 const el=id=>document.getElementById(id),main=document.querySelector('main'),review=el('review');
 if(!main||!review)return;
 const footer=review.querySelector('.registration-footer');
 const originalReviewChildren=[...review.children].filter(node=>node!==footer);
 const collectionTitle=el('collectionCard').querySelector('h2');
 const collectionNote=el('collectionCard').querySelector(':scope > p');
 const reviewTitle=review.querySelector('h2'),progressTitle=el('progressCard').querySelector('h2');
 const originalText={collectionTitle:collectionTitle.textContent,collectionNote:collectionNote.textContent,reviewTitle:reviewTitle.textContent,login:el('smartstoreOpen').textContent};
 const steps=[
  ['collectionCard','상품 수집','공식몰 정보'],
  ['smartstorePhotoStep','사진 확인','대표 · 추가사진'],
  ['smartstoreReviewStep','등록 내용 검토','상품명 · 옵션 · 상세'],
  ['smartstoreSellerStep','판매자 화면 준비','로그인 · 등록 화면'],
  ['smartstoreUploadStep','입력·업로드','입력 및 업로드'],
 ];
 const nav=document.createElement('nav');nav.id='smartstoreWorkflow';nav.dataset.channelOnly='smartstore';nav.setAttribute('aria-label','신규 상품 준비 순서');
 const heading=document.createElement('strong');heading.textContent='신규 상품 준비 순서';
 const list=document.createElement('ol');
 const stepLinks=steps.map(([id,label,description],index)=>{
  const item=document.createElement('li'),link=document.createElement('a');
  const number=document.createElement('span'),copy=document.createElement('span');
  const title=document.createElement('span'),status=document.createElement('span');
  number.className='workflow-step-number';
  number.textContent=String(index+1).padStart(2,'0');
  copy.className='workflow-step-copy';
  title.className='workflow-step-label';title.textContent=label;
  status.className='workflow-step-caption';status.id=id+'Caption';status.textContent=description;
  link.href='#'+id;
  link.setAttribute('aria-label',number.textContent+' '+label);
  link.setAttribute('aria-describedby',status.id);
  link.addEventListener('click',event=>{
   event.preventDefault();
   currentStep=index;
   renderSteps();
   el(id)?.scrollIntoView({block:'start',behavior:'auto'});
  });
  copy.append(title,status);link.append(number,copy);item.append(link);list.append(item);
  return {link,status,description};
 });
 nav.append(heading,list);main.prepend(nav);
 const section=(id,step,title,note)=>{
  const box=document.createElement('section');box.id=id;box.className='card smartstore-workflow-step';box.dataset.channelOnly='smartstore';
  const h=document.createElement('h2');h.dataset.step=step;h.textContent=title;box.append(h);
  if(note){const p=document.createElement('p');p.className='workflow-step-note';p.textContent=note;box.append(p);}
  return box;
 };
 const photo=section('smartstorePhotoStep','02','사진 확인','');
 const photoHeading=document.createElement('div');photoHeading.className='workflow-photo-heading';
 photoHeading.append(photo.firstElementChild);
 const photoContent=document.createElement('div');photoContent.className='workflow-photo-content workflow-product-content';
 const mainPreview=review.querySelector('.main-preview-column');
 const mainPhotoCard=document.createElement('div');mainPhotoCard.className='workflow-main-photo-card';
 photo.append(photoHeading,photoContent);
 const reviewStep=section('smartstoreReviewStep','03','등록 내용 검토','');
 // The original review heading is reused below, so keep only one section heading.
 reviewStep.querySelector('h2').remove();
 const reviewContent=document.createElement('div');reviewContent.className='workflow-review-content workflow-product-content';reviewStep.append(reviewContent);
 const seller=section('smartstoreSellerStep','04','판매자 화면 준비','로그인 후 사용할 수정·복사등록 화면을 하나 열어 주세요.');
 const sellerActions=document.createElement('div');sellerActions.className='bar workflow-seller-actions';seller.append(sellerActions);
 const uploadTitle=document.createElement('h2');uploadTitle.id='smartstoreUploadStep';uploadTitle.dataset.channelOnly='smartstore';uploadTitle.dataset.step='05';uploadTitle.textContent='입력·업로드 시작';
 const extras=document.createElement('details');extras.id='smartstoreExtraTools';extras.className='card';extras.dataset.channelOnly='smartstore';
 const summary=document.createElement('summary');summary.textContent='기존 상품 수정 · 추가 기능';
 const extraActions=document.createElement('div');extraActions.className='workflow-extra-actions';extras.append(summary,extraActions);
 const placeholders=[];
 function move(node,target){if(!node)return;const marker=document.createComment('workflow original position');node.before(marker);placeholders.push({node,marker});target.append(node);}
 const waiting=(box,text)=>{const p=document.createElement('p');p.className='workflow-waiting';p.textContent=text;box.append(p);};
 waiting(photo,'상품 수집 후 사진이 표시됩니다.');
 waiting(reviewStep,'상품 수집 후 입력란이 표시됩니다.');
 const uploadWaiting=document.createElement('p');uploadWaiting.className='workflow-waiting';uploadWaiting.dataset.channelOnly='smartstore';uploadWaiting.textContent='상품 수집 후 시작할 수 있습니다.';
 let active=false,reviewWasHidden=review.hidden;
 let currentStep=0,productStyle,collecting=false;
 function renderSteps(){
  stepLinks.forEach(({link,status,description},index)=>{
   const selected=index===currentStep;
   const collected=index===0&&!!productStyle&&!collecting;
   if(selected)link.setAttribute('aria-current','step');
   else link.removeAttribute('aria-current');
   link.toggleAttribute('data-collected',collected);
   const caption=selected?'현재 단계':collected?'수집 완료':description;
   if(status.textContent!==caption)status.textContent=caption;
  });
 }
 function updateReady(state){
  const nextStyle=state.productStyle;
  const nextCollecting=state.busy&&state.phase==='collect';
  if(nextCollecting)currentStep=0;
  else if(nextStyle!==productStyle||(collecting&&state.phase==='done'))currentStep=nextStyle?1:0;
  if(state.busy&&state.phase==='smartstore-auto')currentStep=4;
  productStyle=nextStyle;
  collecting=nextCollecting;
  document.body.dataset.workflowReady=String(!!productStyle);
  if(productStyle)reviewWasHidden=false;
  if(active)renderSteps();
 }
 function arrange(){
  const smart=document.body.dataset.channel==='smartstore';if(smart===active)return;active=smart;
  if(smart){
   reviewWasHidden=review.hidden;review.hidden=false;
   review.prepend(photo,reviewStep);
   for(const node of originalReviewChildren)move(node,reviewContent);
   reviewStep.prepend(reviewTitle);
   move(review.querySelector('.image-workbench'),photoContent);move(el('extraImages'),photoContent);
   move(el('photoPreparationStatus'),photoHeading);
   const photoEdit=el('manualPhotoReviewOpen');
   if(photoEdit&&photoEdit.parentElement!==photoHeading)move(photoEdit,photoHeading);
   mainPreview.append(mainPhotoCard);
   for(const id of ['main','mainSourceNote','downloadMain1500'])move(el(id),mainPhotoCard);
   move(el('photoImportReview'),photoContent);
   move(el('collectionStatus'),el('collectionCard').querySelector('.search'));
   footer.before(seller);footer.prepend(uploadTitle,uploadWaiting);
   move(el('smartstoreOpen'),sellerActions);move(el('browserLoginSettings'),sellerActions);
   review.append(extras);
   for(const id of ['smartstoreImportPhotos','smartstoreCombinePhotos','smartstoreDetailOnly','detailOnlyCompletion','smartstoreAutoTags'])move(el(id),extraActions);
   move(el('twoChoicePanel'),extras);
   collectionTitle.textContent='상품 수집';collectionNote.textContent='품번으로 상품을 불러오세요.';
   reviewTitle.textContent='등록 내용 검토';reviewTitle.dataset.step='03';progressTitle.removeAttribute('data-step');
   el('smartstoreOpen').textContent='스마트스토어 로그인 창 열기';
   renderSteps();
  }else{
   // A completion message can be created by polling after the controls were moved.
   const completion=el('detailOnlyCompletion');
   // Restore from the innermost moves first, including the exact Lotte layout.
   for(const {node,marker} of placeholders.reverse()){marker.replaceWith(node);}
   placeholders.length=0;
   if(completion)el('smartstoreDetailOnly').after(completion);
   for(const node of [mainPhotoCard,photo,reviewStep,seller,uploadTitle,uploadWaiting,extras])node.remove();
   collectionTitle.textContent=originalText.collectionTitle;collectionNote.textContent=originalText.collectionNote;
   reviewTitle.textContent=originalText.reviewTitle;reviewTitle.dataset.step='02';progressTitle.dataset.step='03';el('smartstoreOpen').textContent=originalText.login;
   review.hidden=reviewWasHidden;
  }
 }
 document.addEventListener('register-state',event=>updateReady(event.detail));
 new MutationObserver(arrange).observe(document.body,{attributes:true,attributeFilter:['data-channel']});
 updateReady({productStyle:typeof smartstoreListingState==='undefined'?null:smartstoreListingState?.product?.style});arrange();
})();
