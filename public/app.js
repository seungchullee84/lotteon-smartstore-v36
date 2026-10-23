const $=id=>document.getElementById(id);let product=null,lastRevision=-1,appClosed=false,lastImageVersions={},selectedBackgroundImage='main';
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
 setTimeout(()=>{if(!appClosed&&$('main').getAttribute('src')===expected&&product?.style===style)$('main').src='/image/main?t='+Date.now();},attempt*700);
};

async function post(endpoint,data={}){
 const expected=({open:'lotte',run:'lotte','smartstore-open':'smartstore','smartstore-plan':'smartstore','smartstore-test':'smartstore','smartstore-optimize-title':'smartstore'})[endpoint];
 if(expected&&document.body.dataset.channel!==expected)throw Error('선택한 판매채널과 실행 버튼이 다릅니다. 판매채널을 확인해 주세요.');
 if(expected)data={...data,channel:document.body.dataset.channel};
 try{const r=await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(endpoint==='smartstore-optimize-title'?60000:45000)});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 catch(e){if(e.name==='TimeoutError')throw Error('서버 응답 시간이 초과됐습니다. 진행 기록에서 작업 상태를 확인해 주세요.');if(e instanceof TypeError)throw Error('등록기 서버와 연결되지 않았습니다. 잠시 후 새로고침해 주세요.');throw e;}
}
let requestLock=false,serverBusy=false,serverPhase='idle';
const buttonLabels={open:'1. 크롬 로그인 창 열기',collect:'2. 공식몰 정보 수집',run:'3. 검토한 내용으로 입력 시작'};
const busyLabels={open:'크롬 연결 중…',collect:'공식몰 정보 수집 중…',run:'상품 입력 시작 중…'};
const feedback=document.createElement('div');feedback.id='clickFeedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.body.append(feedback);
let feedbackTimer;
function announce(text,kind='working'){clearTimeout(feedbackTimer);feedback.textContent=text;feedback.className='visible '+kind;if(kind!=='working')feedbackTimer=setTimeout(()=>feedback.className='',4500);}
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
function syncButtons(){for(const id of ['open','collect','run']){const el=$(id);const active=el.dataset.pending==='true'||serverBusy&&((id==='collect'&&serverPhase==='collect')||(id==='run'&&serverPhase==='register'));el.disabled=requestLock||serverBusy;el.classList.toggle('working',active);el.setAttribute('aria-busy',String(active));el.textContent=active?busyLabels[id]:buttonLabels[id];}for(const id of ['smartstoreOpen','smartstoreTest','smartstoreOptimizeTitle','naverSettings'])if($(id))$(id).disabled=requestLock||serverBusy;}
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
action('open',()=>post('open'));action('collect',()=>post('collect',{style:$('style').value.trim(),allowMissingDetail:false}));action('stop',async()=>{const b=$('stop');if(b.disabled)return;b.disabled=true;b.textContent='중단 중…';announce('중단 요청 중 — 추가 입력을 취소합니다');try{await post('stop');announce('중단 요청을 전달했습니다','success');}finally{b.disabled=false;b.textContent='중단';}});action('continue',()=>post('continue'));
$('style').addEventListener('keydown',event=>{
 if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
 event.preventDefault();
 if(!event.repeat)$('collect').click();
});
action('run',()=>{if(!$('form').reportValidity())return;const f=new FormData($('form'));const p={...product};for(const key of ['name','gender','material','country','washing','manufactured','keywords'])p[key]=f.get(key).trim();p.consumerPrice=Number(f.get('consumerPrice'));p.colors=f.get('colors').split(',').map(x=>x.replace(/\s+/g,'')).filter(Boolean);p.sizes=f.get('sizes').split(',').map(x=>x.replace(/\s+/g,'')).filter(Boolean);p.category=Object.fromEntries(['commonMiddle','commonSmall','channelMiddle','channelSmall'].map(k=>[k,f.get(k).trim()]));return post('run',{product:p,finalize:$('finalize').checked});});
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
async function refresh(){if(appClosed)return;try{const r=await fetch('/api/state',{signal:AbortSignal.timeout(5000)});const s=await r.json();if(!r.ok)throw Error(s.error);if(s.release){applyReleaseColor(s.release.version);$('releaseVersion').textContent='버전 '+s.release.version;$('releaseUpdated').textContent='최종 수정: '+s.release.displayDate;$('releaseUpdated').dateTime=s.release.updatedAt;}if(s.githubSync){$('githubSyncStatus').textContent=s.githubSync.message;$('githubSyncStatus').dataset.status=s.githubSync.status;}updateCollectionStatus(s);updateMissingDetailChoice(s);syncBackgroundImage(s);syncExtraImages(s);$('status').textContent=({idle:'대기',collect:'정보 수집 중',register:'등록 중',background:'배경 합성 중',smartstore:'스마트스토어 입력 테스트 중',done:'작업 종료',error:'확인 필요',stopping:'중단 중…',stopped:'중단됨'})[s.phase];$('logs').textContent=s.logs.map(x=>x.time+' '+x.message).join('\n');if(s.error)$('error').textContent=s.error;$('pause').hidden=!s.paused;$('pauseMessage').textContent=s.paused||'';serverBusy=s.busy;serverPhase=s.phase;syncButtons();if(s.product&&lastRevision!==s.revision){populate(s.product);lastRevision=s.revision;}}catch(e){$('error').textContent=e.message;}if(!appClosed)setTimeout(refresh,1200);}refresh();

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
 try{await post('save-main-image',{image:key});announce('선택한 이미지 1장을 대표이미지컷 폴더에 저장했습니다.','success');}
 catch(e){announce(e.message,'failed');}finally{button.disabled=false;}
}
$('downloadMain1500').onclick=()=>saveSelectedImage('main',$('downloadMain1500'));
$('saveExtra1').onclick=()=>saveSelectedImage('extra1',$('saveExtra1'));
$('saveExtra2').onclick=()=>saveSelectedImage('extra2',$('saveExtra2'));
$('saveDetailImages').onclick=async()=>{
 const button=$('saveDetailImages');if(button.disabled)return;button.disabled=true;
 try{await post('save-detail-images',{});announce('상세이미지를 긴 사진 한 장으로 대표이미지컷 폴더에 저장했습니다.','success');}
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

function renderDetailPreview(p){
 const box=$('detailPreview');box.replaceChildren();box.scrollTop=0;
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
 try{await post('collect',{style:input,allowMissingDetail:true});serverBusy=true;serverPhase='collect';$('missingDetailChoice').hidden=true;announce('승인한 상품을 대체 구성으로 다시 수집합니다.');}
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
$('smartstoreOpen').onclick=async()=>{try{await post('smartstore-open');announce('스마트스토어 로그인 후 상품 등록 화면을 열어 주세요.','success');}catch(e){$('error').textContent=e.message;}};
$('smartstoreTest').onclick=async()=>{
 if(requestLock||serverBusy||!product)return;
 const f=new FormData($('form'));const p={...product};
 for(const k of ['name','gender','material','country','washing','manufactured'])p[k]=String(f.get(k)||'').trim();
 p.smartstoreName=$('smartstoreName').value.trim();
 if(!p.smartstoreName||[...p.smartstoreName].length>39){$('error').textContent='스마트스토어 상품명은 품번·공백 포함 최대 39자로 작성해 주세요.';return;}
 p.consumerPrice=Number(f.get('consumerPrice'));p.colors=String(f.get('colors')||'').split(',').map(s=>s.trim()).filter(Boolean);p.sizes=String(f.get('sizes')||'').split(',').map(s=>s.trim()).filter(Boolean);
 requestLock=true;syncButtons();
 try{await post('smartstore-test',{product:p,salePrice:Number($('smartstorePrice').value),includeImages:$('smartstoreImages').checked});announce('스마트스토어 입력 테스트 시작 · 저장하지 않습니다.','success');}catch(e){$('error').textContent=e.message;}finally{requestLock=false;syncButtons();}
};
async function arrangeSmartstoreTitle(useCurrent=true){
 if(!product)return;
 const current=product,field=$('smartstoreName');
 const {smartstoreTitle}=await import('/smartstore-title.mjs');
 if(product!==current)return;
 field.value=smartstoreTitle({...current,name:$('form').elements.name.value,gender:$('form').elements.gender.value,smartstoreName:useCurrent?field.value:''});
 $('smartstoreNameStatus').textContent=[...field.value].length+'자 / 최대 39자 · 검색 관심도 우선 · 상품정보 기준 정리';
}
$('smartstoreName').oninput=()=>{$('smartstoreNameStatus').textContent=[...$('smartstoreName').value].length+'자 / 최대 39자 · 검색 관심도 우선 · 수정한 스마트스토어 상품명';};
async function optimizeSmartstoreTitle(){
 if(requestLock||serverBusy||!product)return;
 const current=product,field=$('smartstoreName');
 const snapshot={style:product.style,name:$('form').elements.name.value,gender:$('form').elements.gender.value,smartstoreName:field.value};
 requestLock=true;syncButtons();$('smartstoreOptimizeTitle').textContent='상품명 최적화 중…';$('naverTitleResult').textContent='네이버 검색 관심도를 조회하고 있습니다…';$('naverTitleCandidates').replaceChildren();
 try{
   const result=await post('smartstore-optimize-title',{product:snapshot});
   const stale=product!==current||field.value!==snapshot.smartstoreName||$('form').elements.name.value!==snapshot.name||$('form').elements.gender.value!==snapshot.gender;
   if(stale){$('naverTitleResult').textContent='조회 중 상품명이 바뀌어 제안값을 적용하지 않았습니다. 다시 조회해 주세요.';return;}
   if(result.hasData){field.value=result.title;$('smartstoreNameStatus').textContent=[...field.value].length+'자 / 최대 39자 · 검색 관심도 우선 · 네이버 인기어 반영';}
   $('naverTitleResult').textContent=result.source+' · '+result.period.startDate+' ~ '+result.period.endDate+(result.fromCache?' · 최근 조회 재사용':'')+' · '+(result.expanded?'인기 검색어 '+result.candidates.length+'개 비교 · '+result.length+'자':result.hasData?'성별 표현 비교 '+result.comparedDays+'일 / 특성 순서 비교 '+result.featureComparedDays+'일':'조회 자료가 없어 기존 상품명 유지')+' · '+result.note;
   for(const entry of result.candidates){const li=document.createElement('li');li.textContent=entry.keyword+': '+(result.expanded?'비교 기준 대비 검색 관심도 '+entry.score.toFixed(3):entry.mean===null?'자료 없음':'반환된 일별 상대지수 평균 '+entry.mean.toFixed(2)+' · '+entry.pointCount+'일');$('naverTitleCandidates').append(li);}
   $('error').textContent='';
 }catch(e){$('naverTitleResult').textContent='네이버 조회 실패 · 기존 상품명 유지 · '+e.message;}
 finally{requestLock=false;$('smartstoreOptimizeTitle').textContent='상품명 자동 최적화';syncButtons();}
}
$('smartstoreOptimizeTitle').onclick=async()=>{
 if(requestLock||serverBusy||!product)return;
 try{await arrangeSmartstoreTitle();await optimizeSmartstoreTitle();}
 catch(e){$('naverTitleResult').textContent=e.message;}
};
const autoNaverProducts=new WeakSet();
async function autoOptimizeSmartstoreTitle(){
 if(!product||document.body.dataset.channel!=='smartstore'||requestLock||serverBusy||autoNaverProducts.has(product))return;
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
   if(!status.configured){$('naverTitleResult').textContent='네이버 API 키를 처음 한 번 연결하면 상품 수집 후 상품명을 자동으로 제안합니다.';return;}
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
 $('naverTitleResult').textContent='네이버 데이터 조회 전';$('naverTitleCandidates').replaceChildren();
 void writePopularKeywords();arrangeSmartstoreTitle().then(autoOptimizeSmartstoreTitle).catch(e=>{$('smartstoreNameStatus').textContent=e.message;});
};

// Entering SmartStore may suggest a title; Lotte registration handlers stay unchanged.
function selectRegistrationChannel(channel){
 if(requestLock||serverBusy){announce('진행 중인 작업이 끝난 뒤 채널을 전환해 주세요.','failed');return;}
 const smart=channel==='smartstore';
 document.body.dataset.channel=smart?'smartstore':'lotte';
 $('channelLotte').setAttribute('aria-pressed',String(!smart));
 $('channelSmartstore').setAttribute('aria-pressed',String(smart));
 $('activeChannelName').textContent=smart?'스마트스토어':'롯데ON';
 $('activeChannelName').className=smart?'smartstore-brand':'lotteon-brand';
 $('channelSummary').textContent=smart?'현재 작업 채널: 스마트스토어 · 저장 없는 입력 테스트':'현재 작업 채널: 롯데ON · 기존 등록 방식';
 document.title=smart?'스마트스토어 상품등록기':'롯데ON 상품등록기';
 try{sessionStorage.setItem('registrationChannel',smart?'smartstore':'lotte');}catch{}
 if(smart)void autoOptimizeSmartstoreTitle();
}
$('channelLotte').onclick=()=>selectRegistrationChannel('lotte');
$('channelSmartstore').onclick=()=>selectRegistrationChannel('smartstore');
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
 const current=product,field=$('form').elements.keywords,before=field.value,id=++keywordRequest;
 $('keywordStatus').textContent='네이버에서 상품 관련 키워드의 검색 관심도를 비교하고 있습니다…';
 try{
  const result=await post('naver-keywords',{style:current.style});
  if(id!==keywordRequest||product!==current||field.value!==before){if(id===keywordRequest)$('keywordStatus').textContent='조회 중 상품 또는 입력값이 바뀌어 자동 적용하지 않았습니다.';return;}
  field.value=result.keywords;product.keywords=result.keywords;
  $('keywordStatus').textContent=result.length+'자(쉼표 포함) · '+result.source+' · '+result.period.startDate+' ~ '+result.period.endDate+' · 월간 검색횟수 아님'+(result.categoryAudit?' · 카테고리 일치 '+result.categoryAudit.entries.filter(e=>e.status==='verified').length+'개 / 제외 '+result.categoryAudit.entries.filter(e=>e.status==='excluded'||e.status==='product-review').length+'개 / 미검증 '+result.categoryAudit.entries.filter(e=>e.status==='unverified').length+'개':'');
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
 try{await post('naver-verify',{});showNaverConnection(true);}
 catch(e){showNaverConnection(false,e.message);}
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
  else await verifyNaverConnection();
 }catch(e){showNaverConnection(false,e.message);}
};
void loadNaverConnection();
if(new URLSearchParams(location.search).get('settings')==='naver')$('naverSettings').click();
