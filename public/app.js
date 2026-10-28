let smartstoreListingState=null,tagResearchReady=false;
let lastWebsiteCheck=null;try{lastWebsiteCheck=JSON.parse(localStorage.getItem('registrar-website-check-v1')||'null');}catch{} 
function renderWebsiteUpdates(website){
 const summary=$('websiteUpdateSummary'),list=$('websiteUpdateList');if(!summary||!list)return;
 const loading=!website?.checkedAt;if(loading)website=lastWebsiteCheck;if(!website?.checkedAt){if(!summary.querySelector('.website-update-count'))summary.textContent='홈페이지 기준선 확인 중 · 20분 간격';return;}
 if(!loading){lastWebsiteCheck={checkedAt:website.checkedAt,nextCheckAt:website.nextCheckAt,errors:website.errors,batches:website.batches||[]};try{localStorage.setItem('registrar-website-check-v1',JSON.stringify(lastWebsiteCheck));}catch{}}
 summary.title=loading?'자료 불러오는 중 · 마지막 확인 건수를 유지합니다.':'마지막 홈페이지 확인 결과';
 const time=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
 const stamp=JSON.stringify(website);if(list.dataset.stamp===stamp)return;list.dataset.stamp=stamp;
 const batches=(website.batches||[]).map(batch=>({...batch,events:(batch.events||[]).map(event=>({...event,changes:(event.changes||[]).filter(change=>['새로 발견한 성인 상품','공식 상세페이지 추가','공식 상세이미지 변경'].includes(change))})).filter(event=>event.type==='new'||event.changes.length)})),latest=batches.at(-1),events=latest?.events||[];
 summary.classList.toggle('has-updates',events.some(event=>event.type==='new'||event.type==='changed'));
 summary.replaceChildren(document.createTextNode('홈페이지 확인 '+time(website.checkedAt)+' · 신상품 '));const newCount=document.createElement('strong'),changedCount=document.createElement('strong');newCount.className=changedCount.className='website-update-count';newCount.textContent=events.filter(e=>e.type==='new').length+'건';changedCount.textContent=events.filter(e=>e.type==='changed').length+'건';summary.append(newCount,document.createTextNode(' · 변경 '),changedCount,document.createTextNode(' · 20분 간격'));
 list.replaceChildren();
 const heading=document.createElement('p');heading.className='website-current-heading';heading.textContent='이번 확인 결과 · '+time(latest?.checkedAt||website.checkedAt);list.append(heading);
 function addProduct(parent,event,checkedAt){
  const card=document.createElement('article');card.className='website-product-card';
  const label=document.createElement('span');label.className='website-product-label';label.textContent=(event.type==='new'?'신상품':'상세 변경')+' · 품번 '+event.style;
  const link=document.createElement('a');link.className='website-product-link';link.textContent=event.name+' ↗';link.href=event.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.title='공식 상품페이지 열기';
  const reason=document.createElement('div');reason.className='website-product-reason';reason.textContent=event.type==='new'?'이번 홈페이지 확인에서 새로 발견한 상품':event.changes.join(' · ');
  const status=document.createElement('div');status.className='website-product-status';status.textContent='확인 '+time(checkedAt)+' · '+({ready:'소구점 분석 완료',analyzing:'소구점 분석 중','needs-review':'소구점 추가 확인 필요',superseded:'이후 확인 기록 있음'}[event.status]||'소구점 확인 중');
  card.append(label,link,reason,status);parent.append(card);
 }
 const groups=document.createElement('div');groups.className='website-current-groups';
 for(const [type,title] of [['new','신상품'],['changed','상세이미지 추가·변경']]){
  const items=events.filter(event=>event.type===type),section=document.createElement('section'),titleNode=document.createElement('h3');section.className='website-current-group';titleNode.textContent=title+' '+items.length+'건';section.append(titleNode);
  for(const event of items)addProduct(section,event,latest?.checkedAt||website.checkedAt);
  if(!items.length){const empty=document.createElement('p');empty.className='website-group-empty';empty.textContent='이번 확인에서 해당 상품이 없습니다.';section.append(empty);}
  groups.append(section);
 }
 list.append(groups);
 const next=document.createElement('p');next.className='website-check-note';next.textContent='다음 확인 '+time(website.nextCheckAt)+(website.errors?' · 일부 원본 확인 실패: 다음 주기에 재확인':'');list.append(next);
 const history=batches.slice(0,-1).reverse().flatMap(b=>b.events.map(e=>({...e,checkedAt:b.checkedAt}))).slice(0,30);
 if(history.length){const older=document.createElement('details'),title=document.createElement('summary');older.className='website-older-history';title.textContent='이전 확인 기록 '+history.length+'건 · 위 건수에 포함되지 않음';older.append(title);for(const event of history)addProduct(older,event,event.checkedAt);list.append(older);}
}
const $=id=>document.getElementById(id);let product=null,lastRevision=-1,appClosed=false,lastImageVersions={},selectedBackgroundImage='main';
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
 const expected=$('main').getAttribute('src'),attempt=++mainImageRetryCount;
 setTimeout(()=>{if(!appClosed&&$('main').getAttribute('src')===expected&&product?.style===style)$('main').src=expected?.startsWith('/smartstore-listing/')?expected+'&retry='+attempt:'/image/main?t='+Date.now();},attempt*700);
};

async function post(endpoint,data={}){
 const expected=({open:'lotte',run:'lotte','smartstore-template':'smartstore','smartstore-open':'smartstore','smartstore-plan':'smartstore','smartstore-auto':'smartstore','smartstore-detail-only':'smartstore','smartstore-tags-validate':'smartstore','smartstore-tags':'smartstore','smartstore-tags-remove':'smartstore','smartstore-tags-search':'smartstore','smartstore-tags-selection':'smartstore','smartstore-tags-selected':'smartstore','smartstore-ai-settings':'smartstore','smartstore-optimize-title':'smartstore'})[endpoint];
 if(expected&&document.body.dataset.channel!==expected)throw Error('선택한 판매채널과 실행 버튼이 다릅니다. 판매채널을 확인해 주세요.');
 if(expected)data={...data,channel:document.body.dataset.channel};
 try{const r=await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(endpoint==='smartstore-optimize-title'?60000:45000)});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 catch(e){if(e.name==='TimeoutError')throw Error('서버 응답 시간이 초과됐습니다. 진행 기록에서 작업 상태를 확인해 주세요.');if(e instanceof TypeError)throw Error('등록기 서버와 연결되지 않았습니다. 잠시 후 새로고침해 주세요.');throw e;}
}
let requestLock=false,serverBusy=false,serverPhase='idle',smartstoreStarting=false,smartstoreDetailStarting=false;
const buttonLabels={open:'1. 크롬 로그인 창 열기',collect:'2. 공식몰 정보 수집',run:'3. 검토한 내용으로 입력 시작'};
const busyLabels={open:'크롬 연결 중…',collect:'공식몰 정보 수집 중…',run:'상품 입력 시작 중…'};
const feedback=document.createElement('div');feedback.id='clickFeedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.body.append(feedback);
let feedbackTimer,feedbackJob=null;
function detailMotionContent(text,kind){
 const row=document.createElement('span');row.className='detail-motion '+kind;
 const scene=document.createElement('span');scene.className='detail-motion-scene';scene.setAttribute('aria-hidden','true');
 for(const [name,label] of [['rocket','🚀'],['check','✓'],['spark spark-one','✦'],['spark spark-two','✧'],['spark spark-three','✦']]){
  const item=document.createElement('span');item.className=name.split(' ').map(part=>'detail-motion-'+part).join(' ');item.textContent=label;scene.append(item);
 }
 const message=document.createElement('span');message.className='detail-motion-message';message.textContent=text;
 row.append(scene,message);return row;
}
function announce(text,kind='working'){
 feedbackJob=null;clearTimeout(feedbackTimer);feedback.replaceChildren();
 if(/상세설명.*교체/.test(text)&&['working','success'].includes(kind)){
  feedback.append(detailMotionContent(kind==='working'?'상세설명 교체 중 · 새 옷으로 갈아입는 중이에요…':text,kind));
 }else feedback.textContent=text;
 feedback.className='visible '+kind;
 if(kind!=='working')feedbackTimer=setTimeout(()=>feedback.className='',4500);
}
function syncFeedbackWithState(state){
 if(state.busy){
  if(!feedback.classList.contains('working')||feedbackJob!==state.phase){
   const label=({collect:'공식몰 정보 수집 중…',register:'롯데ON 상품 입력 진행 중…',background:'배경 합성 중…',smartstore:'스마트스토어 입력 중…','smartstore-auto':'스마트스토어 자동 작업 진행 중…','smartstore-detail-only':'상세설명 교체 중…','smartstore-import-photos':'기존 상품 착용사진 가져오는 중…','smartstore-tags':'태그 자동입력 중…','smartstore-detail':'상세페이지 제작 중…',stopping:'작업 중단 중…'})[state.phase]||'작업 진행 중…';
   announce(label);
  }
  feedbackJob=state.phase;return;
 }
 if(!feedback.classList.contains('working')){feedbackJob=null;return;}
 if(requestLock)return;
 const job=feedbackJob||(serverBusy?serverPhase:null);
 if(!job)return;
 if(state.phase==='done'){
  const label=({'smartstore-detail-only':'상세설명 교체 완료','smartstore-auto':'자동 작업 완료','smartstore-tags':'태그 작업 완료','smartstore-import-photos':'착용사진 가져오기 완료',collect:'정보 수집 완료',register:'입력 작업 완료'})[job]||'작업 완료';
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
function syncButtons(){if($('smartstoreDetailOnly')){const active=smartstoreDetailStarting||serverBusy&&serverPhase==='smartstore-detail-only';$('smartstoreDetailOnly').textContent=active?'상세설명 교체 진행 중…':'상세설명만 교체 · 조회/수정';$('smartstoreDetailOnly').setAttribute('aria-busy',String(active));}if($('smartstoreStart'))$('smartstoreStart').textContent=smartstoreStarting?'시작 요청 중…':serverBusy&&serverPhase==='smartstore-auto'?'자동 작업 진행 중…':'▶ 시작 · 전체 입력·업로드';for(const id of ['open','collect','run']){const el=$(id);const active=el.dataset.pending==='true'||serverBusy&&((id==='collect'&&serverPhase==='collect')||(id==='run'&&serverPhase==='register'));el.disabled=requestLock||serverBusy;el.classList.toggle('working',active);el.setAttribute('aria-busy',String(active));el.textContent=active?busyLabels[id]:buttonLabels[id];}for(const id of ['smartstoreTemplate1','smartstoreTemplate2','smartstoreOpen','smartstoreOptimizeTitle','naverSettings','smartstoreStart','smartstoreDetailOnly','smartstoreImportPhotos','photoImportApply','smartstoreAutoTags'])if($(id))$(id).disabled=requestLock||serverBusy||['smartstoreAutoTags'].includes(id)&&!tagResearchReady||['smartstoreDetailOnly','smartstoreTemplate1','smartstoreTemplate2'].includes(id)&&!product;}
function action(id,fn){$(id).onclick=async()=>{
 const primary=id in buttonLabels;if(primary&&(requestLock||serverBusy))return;
 if(id==='run'&&!$('form').reportValidity())return;
 if(id==='collect'&&!$('style').value.trim()){$('error').textContent='품번 6자리 또는 공식몰 상품 URL을 입력해 주세요.';announce('품번을 확인해 주세요','failed');return;}
 if(primary){requestLock=true;$(id).dataset.pending='true';syncButtons();announce(busyLabels[id]+' 한 번만 누르면 됩니다.');}
 try{$('error').textContent='';await fn();
 if(primary){const r=await fetch('/api/state');if(r.ok){const state=await r.json();serverBusy=state.busy;serverPhase=state.phase;}announce(id==='open'?'✓ 크롬 창에 연결했습니다':id==='collect'?'✓ 수집 요청 접수 — 정보를 분석하고 있습니다':'✓ 입력 요청 접수 — 진행 기록을 확인하세요','success');}
 }catch(e){$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');}
 finally{if(primary){requestLock=false;delete $(id).dataset.pending;syncButtons();}}
 };}
action('open',()=>post('open'));action('collect',()=>post('collect',{style:$('style').value.trim(),allowMissingDetail:false,channel:document.body.dataset.channel,edits:currentProductEdits()}));action('stop',async()=>{const b=$('stop');if(b.disabled)return;b.disabled=true;b.textContent='중단 중…';announce('중단 요청 중 — 추가 입력을 취소합니다');try{await post('stop');announce('중단 요청을 전달했습니다','success');}finally{b.disabled=false;b.textContent='중단';}});action('continue',()=>post('continue'));
$('style').addEventListener('keydown',event=>{
 if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
 event.preventDefault();
 if(!event.repeat)$('collect').click();
});
action('run',()=>{if(!$('form').reportValidity())return;const f=new FormData($('form'));const p={...product};for(const key of ['name','gender','material','country','washing','manufactured','keywords'])p[key]=f.get(key).trim();p.consumerPrice=Number(f.get('consumerPrice'));p.colors=f.get('colors').split(',').map(x=>x.replace(/\s+/g,'')).filter(Boolean);p.sizes=f.get('sizes').split(',').map(x=>x.replace(/\s+/g,'')).filter(Boolean);p.category={...product.category,...Object.fromEntries(['commonMiddle','commonSmall','channelMiddle','channelSmall'].map(k=>[k,f.get(k).trim()]))};return post('run',{product:p,finalize:$('finalize').checked});});
function populate(p){p.country=['대한민국','한국','중국','베트남','방글라데시','미얀마','인도네시아','캄보디아','인도','태국','필리핀','파키스탄','스리랑카','말레이시아','일본','이탈리아','포르투갈','튀르키예','터키','미국','프랑스','대만','네팔','라오스'].includes(p.country)?p.country:'';product=p;const form=$('form');for(const key of ['name','gender','consumerPrice','material','country','washing','manufactured','keywords'])form.elements[key].value=p[key]||'';form.elements.colors.value=p.colors.join(',');form.elements.sizes.value=p.sizes.join(',');for(const key of ['commonMiddle','commonSmall','channelMiddle','channelSmall'])form.elements[key].value=p.category[key]||'';$('source').textContent='품번 '+p.style+' · '+p.rawName.replace(/\[[^\]]*\]/g,'').replace(/변우석|문가영|박현지/g,'').trim();$('warnings').textContent=(p.fieldStatus?Object.entries(p.fieldStatus).map(([k,v])=>({material:'소재',washing:'세탁방법',category:'상품분류'}[k]||k)+': '+v).join(' / ')+' — ':'')+p.warnings.join(' ');for(const k of ['material','washing'])form.elements[k].placeholder='확인 필요 — 공식 고시 원본과 대조';$('ocr').textContent=p.ocrText;$('info').src='/image/info?t='+Date.now();$('main').src='/image/main?t='+Date.now();renderExtraImages(p,true);$('review').hidden=false;syncNoticeCopy();}
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

populate=function(p){renderProduct(p);$('categorySource').textContent='공식몰 상품 경로: '+(p.sourceCategory?.join(' → ')||'확인 필요')+(p.gender?' / 롯데 대분류: '+p.gender+'의류 · 브랜드'+p.gender+'의류':'');};
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
async function refresh(){if(appClosed)return;try{const r=await fetch('/api/state',{signal:AbortSignal.timeout(5000)});const s=await r.json();if(!r.ok)throw Error(s.error);document.dispatchEvent(new CustomEvent('register-state',{detail:{busy:s.busy,phase:s.phase,error:s.error}}));if(s.release){applyReleaseColor(s.release.version);$('releaseVersion').textContent='버전 '+s.release.version;$('releaseUpdated').textContent='최종 수정: '+s.release.displayDate;$('releaseUpdated').dateTime=s.release.updatedAt;}if(s.githubSync){$('githubSyncStatus').textContent=s.githubSync.message;$('githubSyncStatus').dataset.status=s.githubSync.status;}if(s.benefitResearch&&$("benefitResearchStatus")){const benefitStatus=$("benefitResearchStatus"),benefit=s.benefitResearch;if(benefitStatus.textContent!==benefit.message)benefitStatus.textContent=benefit.message;$("benefitResearchStatus").dataset.status=s.benefitResearch.status;}renderWebsiteUpdates(s.benefitResearch?.website);syncFeedbackWithState(s);updateCollectionStatus(s);updateDetailOnlyCompletion(s);renderResearchTags(s);syncEnhancedFeatures(s);updateMissingDetailChoice(s);syncBackgroundImage(s);syncExtraImages(s);$('status').textContent=({idle:'대기',collect:'정보 수집 중',register:'등록 중',background:'배경 합성 중',smartstore:'스마트스토어 입력 테스트 중','smartstore-detail-only':'상세설명만 교체 중','smartstore-import-photos':'기존 상품 착용사진 가져오는 중','smartstore-auto':'자동 진행 · '+(autoStageLabels[s.autoStep]||'시작 중'),'smartstore-tags':'태그 자동입력 중','smartstore-detail':'스마트스토어 상세페이지 만드는 중',done:s.completedJob==='smartstore-detail-only'?'✓ 상세설명 교체 완료':'작업 종료',error:'확인 필요',stopping:'중단 중…',stopped:'중단됨'})[s.phase];$('logs').textContent=s.logs.map(x=>x.time+' '+x.message).join('\n');if(s.error)$('error').textContent=s.error;$('pause').hidden=!s.paused;$('pauseMessage').textContent=s.paused||'';serverBusy=s.busy;serverPhase=s.phase;syncButtons();if(s.product&&lastRevision!==s.revision){populate(s.product);lastRevision=s.revision;}smartstoreListingState=s;syncListingImages(s);syncPhotoImport(s);}catch(e){$('error').textContent=e.message;}if(!appClosed)setTimeout(refresh,1200);}refresh();

// Distinguish missing values from OCR values that still need review.
const reviewedFields=new Set();
function highlightReviewFields(){
 if(!product)return;
 for(const field of $('form').elements){
  if(!field.name)continue;
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
 try{await post('save-main-image',{image:key,channel:document.body.dataset.channel});announce('선택한 이미지 1장을 바탕화면의 이미지다운 폴더에 저장했습니다.','success');}
 catch(e){announce(e.message,'failed');}finally{button.disabled=false;}
}
$('downloadMain1500').onclick=()=>saveSelectedImage('main',$('downloadMain1500'));
$('saveExtra1').onclick=()=>saveSelectedImage('extra1',$('saveExtra1'));
$('saveExtra2').onclick=()=>saveSelectedImage('extra2',$('saveExtra2'));
$('saveDetailImages').onclick=async()=>{
 const button=$('saveDetailImages');if(button.disabled)return;button.disabled=true;
 try{const smart=document.body.dataset.channel==='smartstore';await post('save-detail-images',smart?{channel:'smartstore',product:smartstoreDetailFields()}:{});announce(smart?'스마트스토어 템플릿 상세이미지·HTML·영상 코드를 바탕화면 이미지다운에 저장했습니다.':'상세이미지를 긴 사진 한 장으로 바탕화면의 이미지다운 폴더에 저장했습니다.','success');}
 catch(e){announce(e.message,'failed');}finally{button.disabled=false;}
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
 const f=$('form').elements;return {style:product.style,detailTemplate:product.detailTemplate===2?2:1,name:f.name.value,gender:f.gender.value,material:f.material.value,colors:f.colors.value.split(',').map(v=>v.trim()).filter(Boolean),sizes:f.sizes.value.split(',').map(v=>v.trim()).filter(Boolean)};
}
let detailPreviewResizeObserver;
function renderDetailPreview(p){
 for(const n of [1,2]){const button=$('smartstoreTemplate'+n);if(button)button.setAttribute('aria-pressed',String((p.detailTemplate===2?2:1)===n));}
 detailPreviewResizeObserver?.disconnect();
 const box=$('detailPreview');box.replaceChildren();box.scrollTop=0;
 if(document.body.dataset.channel==='smartstore'){
  $('detailPreviewStatus').textContent='';
  const frame=document.createElement('iframe');frame.className='smartstore-template-preview';frame.title='스마트스토어 확정 템플릿 상세페이지';frame.allow='autoplay; fullscreen; picture-in-picture';
  frame.src='/smartstore-detail-preview.html?style='+encodeURIComponent(p.style)+'&v='+encodeURIComponent(smartstoreListingState?.release?.version||Date.now())+'&fields='+encodeURIComponent(JSON.stringify(smartstoreDetailFields()));box.append(frame);
  const fit=()=>{
   const scale=Math.min(1,box.clientWidth/860);if(!scale)return;
   frame.style.width='860px';frame.style.height=Math.ceil(box.clientHeight/scale)+'px';
   frame.style.transform='scale('+scale+')';
  };
  detailPreviewResizeObserver=new ResizeObserver(fit);detailPreviewResizeObserver.observe(box);fit();return;
 }
 const add=(key)=>{const image=document.createElement('img');image.src='/image/'+key+'?t='+Date.now();image.alt='상세 이미지 '+key;image.loading='lazy';image.onerror=()=>{image.remove();$('detailPreviewStatus').textContent='상세 원본 이미지를 불러오지 못했습니다. 원본 상태를 확인해 주세요.';};box.append(image);};
 if(p.originalDetailUrl&&!p.images.detail){$('detailPreviewStatus').textContent='기존 상세 원본을 불러오지 못했습니다. 대체 이미지를 만들지 않습니다.';return;}
 if(p.images.detail){$('detailPreviewStatus').textContent='';for(const key of ['detail','size','check','info'])if(p.images[key])add(key);return;}
 $('detailPreviewStatus').textContent=p.detailFallbackApproved?'공식몰 상세 원본 누락 · 승인된 대표·색상별 사진 구성':'기존 상세 없음 · 색상 기재 순서대로 최대 2장씩 구성';
 let count=0;
 for(const color of p.colors||[]){const urls=[...new Set(p.colorImages?.[color]||[])].slice(0,2);if(!urls.length)continue;const heading=document.createElement('h4');heading.textContent=color;box.append(heading);for(const url of urls){const key=Object.keys(p.images).find(k=>p.images[k]===url);if(key){add(key);count++;}}}
 if(!count)for(const key of ['main','extra1','extra2'])if(p.images[key])add(key);
 for(const key of ['size','check','info'])if(p.images[key])add(key);
}
const populateWithDetailPreview=populate;
populate=function(p){populateWithDetailPreview(p);renderDetailPreview(p);};
if(product)renderDetailPreview(product);

const populateWithImageButtons=populate;
populate=function(p){populateWithImageButtons(p);$('saveExtra1').hidden=!p.images.extra1;$('saveExtra2').hidden=!p.images.extra2;};
if(product){$('saveExtra1').hidden=!product.images.extra1;$('saveExtra2').hidden=!product.images.extra2;}

function updateCollectionStatus(s){
 updateCollectionAnimation(s);
 const badge=$('collectionStatus');
 if(s.phase==='collect'&&s.busy){badge.hidden=false;badge.className='collect-pending';badge.textContent='정보 수집 중… 잠시 기다려 주세요.';return;}
 if(s.phase==='error'){badge.hidden=false;badge.className='collect-failed';badge.textContent=s.product?'작업 확인 필요 · 기존 수집정보는 유지됩니다. 진행 기록을 확인해 주세요.':'정보 수집을 완료하지 못했습니다. 진행 기록을 확인해 주세요.';return;}
 if(s.product){badge.hidden=false;badge.className='collect-complete';badge.textContent='✓ 정보 수집 완료 · 품번 '+s.product.style+' · 아래 내용을 검토해 주세요.';return;}
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
 try{await post('collect',{style:input,allowMissingDetail:true,channel:document.body.dataset.channel,edits:currentProductEdits()});serverBusy=true;serverPhase='collect';$('missingDetailChoice').hidden=true;announce('승인한 상품을 대체 구성으로 다시 수집합니다.');}
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


const noticeLabels={material:'제품소재',colors:'색상',sizes:'치수',country:'제조국'};
function syncNoticeCopy(){for(const key of Object.keys(noticeLabels)){const value=$('form').elements[key]?.value?.trim()||'';$('noticeText-'+key).value=value||'확인 필요 — 수집된 값이 없습니다.';$('noticeText-'+key).dataset.missing=String(!value);}}
$('form').addEventListener('input',syncNoticeCopy);$('form').addEventListener('change',syncNoticeCopy);
async function copyNotice(keys){const values=keys.map(key=>{const box=$('noticeText-'+key);if(box.dataset.missing==='true')return null;return keys.length===1?box.value:noticeLabels[key]+': '+box.value;}).filter(Boolean);if(!values.length){$('noticeCopyStatus').textContent='복사할 값이 없습니다. 원본을 확인해 주세요.';return;}const text=values.join('\n');try{await navigator.clipboard.writeText(text);$('noticeCopyStatus').textContent='복사했습니다.';}catch{const box=$('noticeManualCopy');box.hidden=false;box.value=text;box.focus();box.select();let ok=false;try{ok=document.execCommand('copy');}catch{}if(ok){box.hidden=true;$('noticeCopyStatus').textContent='복사했습니다.';}else{$('noticeCopyStatus').textContent='아래 선택된 텍스트를 Ctrl+C로 복사해 주세요.';}}}
for(const button of document.querySelectorAll('.notice-copy'))button.onclick=()=>copyNotice([button.dataset.field]);$('copyNoticeAll').onclick=()=>copyNotice(Object.keys(noticeLabels));

$('openNoticeText').onclick=()=>{syncNoticeCopy();$('noticeCopyStatus').textContent='';$('noticeTextDialog').showModal();};$('closeNoticeText').onclick=()=>$('noticeTextDialog').close();

const backgroundLabels={main:'대표이미지',extra1:'추가이미지 1',extra2:'추가이미지 2'};
function syncBackgroundImage(s){
 const chip=s.colorChipStatus;
 $('colorChipStatus').textContent=chip?(chip.position?'색상칩 자동 배치: 오른쪽 '+(chip.position==='bottom-right'?'하단':'중단'):'여백 부족으로 색상칩 생략'):'공식 색상칩은 수집 후 여백이 있을 때 자동 배치합니다.';
 if(!$('backgroundDialog').open)selectedBackgroundImage=s.backgroundSelection||'main';
 const versions=s.imageVersions||{main:s.mainImageVersion||null};
 for(const key of ['main','extra1','extra2']){
  const version=versions[key]||null;
  if(version===lastImageVersions[key])continue;
  lastImageVersions[key]=version;
  if(version){$(key).src='/image/'+key+'?t='+Date.now();$('backgroundStatus').textContent='합성 완료 — '+backgroundLabels[key]+'를 변경했습니다.';announce(backgroundLabels[key]+'를 변경했습니다.','success');}
 }
}
function backgroundGuide(){return '선택한 사진: '+backgroundLabels[selectedBackgroundImage]+'. 현재 이 채팅창에 “합성해줘”라고 보내 주세요. 합성 결과는 항상 대표이미지로 적용합니다.';}
function showBackgroundChoice(){
 $('backgroundOriginal').src='/image/'+selectedBackgroundImage+'-original?t='+Date.now();
 $('backgroundOriginal').alt='합성할 '+backgroundLabels[selectedBackgroundImage]+' 원본';
 $('backgroundStatus').textContent=backgroundGuide();
}
$('extendBackground').onclick=()=>{
 if(!product){announce('먼저 상품을 수집해 주세요.','failed');return;}
 const choice=$('backgroundImageChoice');choice.replaceChildren();
 for(const key of ['main','extra1','extra2']){const option=document.createElement('option');option.value=key;option.textContent=backgroundLabels[key]+(product.images[key]?'':' (사진 없음)');option.disabled=!product.images[key];choice.append(option);}
 if(!product.images[selectedBackgroundImage])selectedBackgroundImage='main';
 choice.value=selectedBackgroundImage;showBackgroundChoice();$('backgroundDialog').showModal();
};
$('backgroundImageChoice').onchange=async()=>{
 const choice=$('backgroundImageChoice'),previous=selectedBackgroundImage,key=choice.value;
 choice.disabled=true;$('openBackgroundRequest').disabled=true;
 try{await post('background-selection',{style:product.style,key});selectedBackgroundImage=key;showBackgroundChoice();}
 catch(e){choice.value=previous;$('backgroundStatus').textContent=e.message;}
 finally{choice.disabled=false;$('openBackgroundRequest').disabled=false;}
};
$('closeBackground').onclick=()=>$('backgroundDialog').close();
$('openBackgroundRequest').onclick=async()=>{
 const button=$('openBackgroundRequest');button.disabled=true;
 try{await post('background-selection',{style:product.style,key:selectedBackgroundImage});$('backgroundStatus').textContent=backgroundGuide();announce(backgroundLabels[selectedBackgroundImage]+' 선택됨 — 이 채팅창에 “합성해줘”라고 보내 주세요.');}
 catch(e){$('backgroundStatus').textContent=e.message;}
 finally{button.disabled=false;}
};

// SmartStore is a separate no-save path; Lotte controls retain their behavior.
$('smartstoreOpen').onclick=async()=>{try{await post('smartstore-open');announce('로그인 후 원하는 상품의 복사등록 화면을 직접 열고 시작을 눌러 주세요.','success');}catch(e){$('error').textContent=e.message;}};
async function arrangeSmartstoreTitle(useCurrent=true){
 if(!product)return;
 if(product.smartstoreNameUserEdited&&useCurrent)return;
 const current=product,field=$('smartstoreName');
 const {smartstoreTitle}=await import('/smartstore-title.mjs');
 if(product!==current)return;
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
   $('naverTitleResult').textContent=result.period?result.source+' · '+result.period.startDate+' ~ '+result.period.endDate+(result.fromCache?' · 최근 조회 재사용':'')+' · '+(result.expanded?'인기 검색어 '+result.candidates.length+'개 비교 · '+result.length+'자':result.hasData?'성별 표현 비교 '+result.comparedDays+'일 / 특성 순서 비교 '+result.featureComparedDays+'일':'조회 자료가 없어 기존 상품명 유지')+' · '+result.note:result.source+' · '+result.note+' 참고 표현: '+(result.referenceTerms||[]).join(', ');
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
 beforeSmartstorePopulate(p);$('smartstorePrice').value=p.consumerPrice||'';
 $('smartstoreName').value=p.smartstoreName||'';
 if(p.smartstoreNameUserEdited)$('smartstoreNameStatus').textContent=[...$('smartstoreName').value].length+'자 · 수정한 상품명 그대로 사용';
 $('naverTitleResult').textContent='네이버 데이터 조회 전';$('naverTitleCandidates').replaceChildren();
 void writePopularKeywords();arrangeSmartstoreTitle().then(autoOptimizeSmartstoreTitle).catch(e=>{$('smartstoreNameStatus').textContent=e.message;});
};

// Entering SmartStore may suggest a title; Lotte registration handlers stay unchanged.
function selectRegistrationChannel(channel){
 if(requestLock||serverBusy){announce('진행 중인 작업이 끝난 뒤 채널을 전환해 주세요.','failed');return;}
 const smart=channel==='smartstore';
 buttonLabels.collect='2. 공식몰 정보 수집';
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
 if(product)renderDetailPreview(product);
 if(smart)void autoOptimizeSmartstoreTitle();
 if(smartstoreListingState)syncListingImages(smartstoreListingState);
 if(!smart&&product)$('main').src='/image/main?t='+Date.now();
}
$('channelLotte').onclick=()=>selectRegistrationChannel('lotte');
$('channelSmartstore').onclick=()=>selectRegistrationChannel('smartstore');
$('smartstoreStart').onclick=async()=>{
 if(requestLock||serverBusy)return;
 const style=$('style').value.trim()||product?.style;
 if(!style){$('error').textContent='품번 또는 공식몰 상품 URL을 먼저 입력해 주세요.';return;}
 requestLock=true;smartstoreStarting=true;$('error').textContent='';$('smartstoreStart').disabled=true;syncButtons();announce('시작 요청 접수 중 · 복사등록 화면을 확인합니다.');
 try{await flushManualTagSelection();await post('smartstore-auto',{style,detailTemplate:product?.detailTemplate===2?2:1,selectedTitle:product?{style:product.style,title:$('smartstoreName').value}:undefined,edits:currentProductEdits(),selectedTags:currentManualTags()});serverBusy=true;serverPhase='smartstore-auto';announce('자동 작업 시작 · 선택한 복사등록 화면에 업로드합니다.');}catch(e){$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');}finally{requestLock=false;smartstoreStarting=false;syncButtons();}
};
$('smartstoreDetailOnly').onclick=async()=>{
 if(requestLock||serverBusy)return;
 if(!product){$('error').textContent='먼저 상품 정보와 상세 미리보기를 준비해 주세요.';return;}
 requestLock=true;smartstoreDetailStarting=true;$('error').textContent='';syncButtons();announce('상세설명 교체 중 · 실행을 시작합니다.');
 try{await post('smartstore-detail-only',{product:smartstoreDetailFields()});serverBusy=true;serverPhase='smartstore-detail-only';announce('상세설명만 교체 중 · 다른 항목과 상품 저장은 건드리지 않습니다.');}catch(e){$('error').textContent=e.message;announce('처리하지 못했습니다: '+e.message,'failed');}finally{requestLock=false;smartstoreDetailStarting=false;syncButtons();}
};
const autoStageLabels={connect:'로그인 확인',collect:'공식몰 수집',prepare:'사진·색상 대조',compose:'사진 합성',detail:'상세페이지 제작',upload:'스마트스토어 업로드',done:'편집기 준비 완료'};
try{if(sessionStorage.getItem('registrationChannel')==='smartstore')selectRegistrationChannel('smartstore');}catch{}

function renderExtraImages(p,refresh=false){
 $('extraImages').hidden=false;
 const count=['extra1','extra2'].filter(k=>p.images[k]).length;
 $('extraImageStatus').textContent=count?'추가이미지 '+count+'장 · × 버튼으로 제외할 수 있습니다.':'사용할 추가이미지가 없습니다. 대표이미지만 업로드합니다.';
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
 if(!product||serverBusy)return;
 if(Object.hasOwn(editedValuesFor(product),'keywords')){$('keywordStatus').textContent='직접 수정한 키워드 유지';return;}
 const current=product,field=$('form').elements.keywords,before=field.value,id=++keywordRequest;
 $('keywordStatus').textContent='네이버에서 상품 관련 키워드의 검색 관심도를 비교하고 있습니다…';
 try{
  const result=await post('naver-keywords',{style:current.style});
  if(id!==keywordRequest||product!==current||field.value!==before){if(id===keywordRequest)$('keywordStatus').textContent='조회 중 상품 또는 입력값이 바뀌어 자동 적용하지 않았습니다.';return;}
  field.value=result.keywords;product.keywords=result.keywords;
  const keywordLengthNote=result.needsMoreKeywords?' · 관련 검색자료 부족으로 37자 미만 (임의 보강 없음)':' · 지오다노 첫 번째 · 37~40자 목표';
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

let smartstoreDetailTimer;
$('form').addEventListener('input',event=>{if(!['name','gender','material','colors','sizes'].includes(event.target.name)||document.body.dataset.channel!=='smartstore')return;clearTimeout(smartstoreDetailTimer);smartstoreDetailTimer=setTimeout(()=>{if(product&&!serverBusy&&document.body.dataset.channel==='smartstore')renderDetailPreview(product);},700);});

function syncListingImages(state){
 const custom=$('smartstoreListingExtras'),original=$('originalExtraPreviews');
 const listing=state.smartstoreListing,smart=document.body.dataset.channel==='smartstore';
 const note=$('mainSourceNote');if(!note.dataset.original)note.dataset.original=note.textContent;
 note.textContent=smart?(listing?'대표사진: '+listing.sourceNames[0]+' · '+listing.mainColor+' · 현재 품번 사진을 750×1000 JPG로 변환 · 비율 유지·흰 여백 · 원본 보관':'바탕화면 상품등록기사진폴더의 해당 품번 폴더에 1.jpg 또는 1번.jpg를 넣어 주세요.'):note.dataset.original;
 $('main').hidden=smart&&!listing;
 $('colorChipStatus').hidden=smart;$('extendBackground').hidden=smart;
 $('downloadMain1500').textContent=smart?'대표이미지 750×1000 JPG 저장':'대표이미지 1500×1500 저장';
 $('main').alt=smart?'품번 폴더 1번 사진 · 750×1000 JPG 작업본':'1500×1500 대표이미지';
 document.querySelector('.main-image-heading h3').textContent=smart?'대표이미지 · 폴더 1번':'대표이미지';

 custom.hidden=!smart||!listing;original.hidden=smart&&!!listing;$('extraImages').querySelector('h3').textContent=smart?'추가이미지':'추가이미지 (최대 2장)';
 if(!smart||!listing||!product||product.style!==state.product?.style)return;
 const base='/smartstore-listing/',query='?style='+encodeURIComponent(product.style)+'&v='+encodeURIComponent(listing.detailRevision||'');
 const main=base+'main'+query;if($('main').getAttribute('src')!==main)$('main').src=main;
 const stamp=product.style+'#template'+(product.detailTemplate===2?2:1)+JSON.stringify(listing)+'@'+String(state.release?.version||'');
 if(!state.busy&&$('detailPreview').dataset.photoRevision!==stamp){
  renderDetailPreview(product);$('detailPreview').dataset.photoRevision=stamp;
 }
 if(custom.dataset.stamp!==stamp){
  custom.dataset.stamp=stamp;custom.replaceChildren();
  listing.extraColors.forEach((color,i)=>{const card=document.createElement('div');card.className='extra-image-card';const img=document.createElement('img');img.src=base+'extra-'+i+query;const official=listing.extraRoles?.[i]==='official-main',angle=official||listing.extraRoles?.[i]==='provided'?'':color===listing.mainColor?'옆면':'정면';img.alt=color+(angle?' '+angle:'');const name=document.createElement('p');name.textContent=official?'공식몰 대표사진 · 추가 1':color+(angle?' · '+angle:'');const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=official?'공식몰 원본 저장':'750×1000 JPG 저장';button.onclick=()=>saveSelectedImage('extra-'+i,button);card.append(img,name,button);custom.append(card);});
 }
 $('extraImageStatus').textContent=listing.previewOnly?'폴더 1번 사진을 표시 중입니다. 정보 수집 또는 시작을 누르면 폴더 사진을 추가·상세에 연결합니다.':'대표: '+listing.mainColor+' (1번 사진) · 추가 '+listing.extraColors.length+'장 · '+(listing.extraRoles?.[0]==='official-main'?'공식몰 대표사진을 첫 번째로 · ':'')+(listing.extraRoles?.includes('provided')?'품번 폴더의 제공 사진':'옆면(있는 경우) + 다른 색상 정면');
 $('extraImages').hidden=false;
}

function renderResearchTags(state){
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
 panel.textContent=state.busy&&state.phase==='smartstore-tags'?'현재 상품의 태그를 입력·확인하고 있습니다…':report?'자동입력 '+report.tagCount+'/10개 · '+(report.tagCount<10?(10-report.tagCount)+'개 보강 필요':report.searchTagsVerified?'검색 적용 확인 완료':'진행 기록 확인'):validation?'검증 '+validation.tagCount+'/10개 · 기존 폼 태그 복원 완료':'조사 자료 '+(research?.count||0).toLocaleString()+'개 · '+(names.length?'상품 연관 후보 '+research.candidates.length+'개 · 상위 '+names.length+'개 표시':'상품 근거에 맞는 후보를 확인해 주세요.');
}
$('smartstoreAutoTags').onclick=async()=>{
 if(requestLock||serverBusy||!product||document.body.dataset.channel!=='smartstore')return;
 requestLock=true;syncButtons();
 try{await flushManualTagSelection();await post('smartstore-tags',{style:product.style,selectedTags:currentManualTags()});serverBusy=true;serverPhase='smartstore-tags';$('error').textContent='';announce('선택 태그 입력 시작 · 상품 저장 없이 진행합니다.');}
 catch(e){$('error').textContent=e.message;}
 finally{requestLock=false;syncButtons();}
};


// Preserve deliberate edits per style; newly collected source images stay server-owned.
const manualProductFields=new Set(['name','gender','consumerPrice','colors','sizes','material','country','manufactured','washing','keywords','commonMiddle','commonSmall','channelMiddle','channelSmall','smartstoreName']);
const localProductEdits=new Map();
function editedValuesFor(p){
 if(!localProductEdits.has(p.style)){
  let saved={};try{saved=JSON.parse(localStorage.getItem('product-edits.v1.'+p.style)||'{}');}catch{}
  const fields={...p.userEditedFields,...saved};
  if(p.smartstoreNameUserEdited&&!Object.hasOwn(fields,'smartstoreName'))fields.smartstoreName=p.smartstoreName;
  localProductEdits.set(p.style,Object.fromEntries(Object.entries(fields).filter(([k,v])=>manualProductFields.has(k)&&typeof v==='string'&&v.length<=2000)));
 }
 return localProductEdits.get(p.style);
}
function rememberProductField(key,value){
 if(!product||!manualProductFields.has(key))return;
 const fields=editedValuesFor(product);fields[key]=value;
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
 const fields=editedValuesFor(p),reviewed={...p,category:{...p.category}};
 for(const [key,value] of Object.entries(fields)){
  if(['commonMiddle','commonSmall','channelMiddle','channelSmall'].includes(key))reviewed.category[key]=value;
  else if(key==='colors'||key==='sizes')reviewed[key]=value.split(',').map(s=>s.replace(/\s+/g,'')).filter(Boolean);
  else reviewed[key]=key==='consumerPrice'&&value!==''?Number(value):value;
 }
 if(Object.hasOwn(fields,'smartstoreName'))reviewed.smartstoreNameUserEdited=true;
 populateWithManualEdits(reviewed);
 for(const [key,value] of Object.entries(fields)){
  const field=key==='smartstoreName'?$('smartstoreName'):$('form').elements[key];if(field)field.value=value;
 }
 for(const key of Object.keys(fields))reviewedFields.add(key);
 highlightReviewFields();syncNoticeCopy();renderDetailPreview(reviewed);
};

// Current product links and secure, optional photo-analysis setup.
const officialProductLink=document.createElement('a');officialProductLink.id='officialProductLink';officialProductLink.className='official-product-link';officialProductLink.target='_blank';officialProductLink.rel='noopener noreferrer';officialProductLink.href='https://www.giordano.co.kr/';officialProductLink.title='지오다노 공식 상품페이지 열기';officialProductLink.setAttribute('aria-label','지오다노 공식 상품페이지 열기');
officialProductLink.innerHTML='<img src="/giordano-official-logo.png" alt="GIORDANO"><span>공식몰 ↗</span>';$('smartstoreOptimizeTitle').insertAdjacentElement('afterend',officialProductLink);
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
 photoAnalysisConfigured=!!state.backgroundConfigured;const p=state.product;if(!p)return;
 try{const url=new URL(p.sourceUrl);officialProductLink.href=url.origin==='https://www.giordano.co.kr'?url.href:'https://www.giordano.co.kr/';}catch{officialProductLink.href='https://www.giordano.co.kr/';}
 officialProductLink.title=p.style+' 지오다노 공식 상품페이지 열기';
 const status=state.photoPreparation?.style===p.style?state.photoPreparation:null;
 photoPreparationStatus.textContent=status?.status==='ready'?'사진 연결 확인 · 대표 1장 · 추가 '+status.extraCount+'장 · 상세사진 '+status.detailCount+'장':status?.status==='preparing'?'품번 폴더 사진을 추가이미지·상세 미리보기에 연결 중…':status?.message||(!state.smartstoreListing?'현재 품번 폴더의 사진을 확인해 주세요.':state.smartstoreListing.previewOnly?'대표사진만 우선 표시 중 · 정보 수집 또는 시작을 누르면 추가·상세사진을 연결합니다.':'품번 폴더 사진을 추가이미지·상세 미리보기에 연결했습니다.');
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
 try{await post('smartstore-template',{style,detailTemplate,edits:currentProductEdits()});if(product?.style!==style)return;product.detailTemplate=detailTemplate;renderDetailPreview(product);announce('템플릿 '+detailTemplate+' 선택됨','success');}
 catch(error){$('error').textContent=error.message;}
 finally{requestLock=false;syncButtons();}
};
