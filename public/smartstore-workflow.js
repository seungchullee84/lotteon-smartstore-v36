// Arrange the existing controls; keep their nodes, values and event handlers intact.
(()=>{
 const el=id=>document.getElementById(id),main=document.querySelector('main'),review=el('review');
 if(!main||!review)return;
 const footer=review.querySelector('.registration-footer');
 const originalReviewChildren=[...review.children].filter(node=>node!==footer);
 const collectionTitle=el('collectionCard').querySelector('h2');
 const collectionNote=el('collectionCard').querySelector(':scope > p');
 const reviewTitle=review.querySelector('h2');
 const originalText={collectionTitle:collectionTitle.textContent,collectionNote:collectionNote.textContent,reviewTitle:reviewTitle.textContent,login:el('smartstoreOpen').textContent};
 const steps=[['collectionCard','상품 수집'],['smartstorePhotoStep','사진 확인'],['smartstoreReviewStep','등록 내용 검토'],['smartstoreSellerStep','판매자 화면 준비'],['smartstoreUploadStep','입력·업로드']];
 const nav=document.createElement('nav');nav.id='smartstoreWorkflow';nav.dataset.channelOnly='smartstore';nav.setAttribute('aria-label','신규 상품 준비 순서');
 const heading=document.createElement('strong');heading.textContent='신규 상품 준비';
 const list=document.createElement('ol');
 steps.forEach(([id,label],index)=>{const li=document.createElement('li'),link=document.createElement('a'),number=document.createElement('span');link.href='#'+id;number.textContent=String(index+1);link.append(number,document.createTextNode(label));li.append(link);list.append(li);});
 const help=document.createElement('p');help.textContent='1번부터 차례로 확인하세요. 단계 이름을 누르면 해당 위치로 이동합니다.';
 nav.append(heading,list,help);main.prepend(nav);
 const section=(id,step,title,note)=>{
  const box=document.createElement('section');box.id=id;box.className='card smartstore-workflow-step';box.dataset.channelOnly='smartstore';
  const h=document.createElement('h2');h.dataset.step=step;h.textContent=title;box.append(h);
  if(note){const p=document.createElement('p');p.className='workflow-step-note';p.textContent=note;box.append(p);}
  return box;
 };
 const photo=section('smartstorePhotoStep','02','사진 확인','대표·추가사진을 확인하고, 사진 색상·구도 수정에서 컬러별 사진을 연결하세요.');
 const photoContent=document.createElement('div');photoContent.className='workflow-photo-content workflow-product-content';photo.append(photoContent);
 const reviewStep=section('smartstoreReviewStep','03','등록 내용 검토','상품명·소구점·색상·사이즈와 상세 미리보기를 확인하세요.');
 // The original review heading is reused below, so keep only one section heading.
 reviewStep.querySelector('h2').remove();
 const reviewContent=document.createElement('div');reviewContent.className='workflow-review-content workflow-product-content';reviewStep.append(reviewContent);
 const seller=section('smartstoreSellerStep','04','판매자 화면 준비','스마트스토어에 로그인한 뒤, 사용할 상품의 복사등록 화면을 하나 열어 주세요. 시작할 때 대상 화면을 다시 확인합니다.');
 const sellerActions=document.createElement('div');sellerActions.className='bar workflow-seller-actions';seller.append(sellerActions);
 const uploadTitle=document.createElement('h2');uploadTitle.id='smartstoreUploadStep';uploadTitle.dataset.channelOnly='smartstore';uploadTitle.dataset.step='05';uploadTitle.textContent='입력·업로드 시작';
 const extras=document.createElement('details');extras.id='smartstoreExtraTools';extras.className='card';extras.dataset.channelOnly='smartstore';
 const summary=document.createElement('summary');summary.textContent='기존 상품 수정 · 추가 기능';
 const extraNote=document.createElement('p');extraNote.className='workflow-step-note';extraNote.textContent='필요한 기능만 따로 실행할 때 사용하세요. 상세설명만 교체는 조회/수정 화면에서 진행합니다.';
 const extraActions=document.createElement('div');extraActions.className='workflow-extra-actions';extras.append(summary,extraNote,extraActions);
 const placeholders=[];
 function move(node,target){if(!node)return;const marker=document.createComment('workflow original position');node.before(marker);placeholders.push({node,marker});target.append(node);}
 const waiting=(box,text)=>{const p=document.createElement('p');p.className='workflow-waiting';p.textContent=text;box.append(p);};
 waiting(photo,'상품을 수집하면 현재 품번의 사진을 확인할 수 있습니다.');
 waiting(reviewStep,'상품을 수집하면 등록 내용과 상세 미리보기가 표시됩니다.');
 const uploadWaiting=document.createElement('p');uploadWaiting.className='workflow-waiting';uploadWaiting.dataset.channelOnly='smartstore';uploadWaiting.textContent='상품 수집과 사진·내용 검토를 마친 뒤 시작하세요.';
 let active=false,reviewWasHidden=review.hidden;
 function updateReady(state){
  document.body.dataset.workflowReady=String(!!state?.productStyle);
  if(state?.productStyle)reviewWasHidden=false;
 }
 function arrange(){
  const smart=document.body.dataset.channel==='smartstore';if(smart===active)return;active=smart;
  if(smart){
   reviewWasHidden=review.hidden;review.hidden=false;
   review.prepend(photo,reviewStep);
   for(const node of originalReviewChildren)move(node,reviewContent);
   reviewStep.prepend(reviewTitle);
   move(review.querySelector('.image-workbench'),photoContent);move(el('extraImages'),photoContent);
   move(el('photoImportReview'),photoContent);
   footer.before(seller);footer.prepend(uploadTitle,uploadWaiting);
   move(el('smartstoreOpen'),sellerActions);move(el('browserLoginSettings'),sellerActions);
   review.append(extras);
   for(const id of ['smartstoreImportPhotos','smartstoreCombinePhotos','smartstoreDetailOnly','detailOnlyCompletion','smartstoreAutoTags'])move(el(id),extraActions);
   move(el('twoChoicePanel'),extras);
   collectionTitle.textContent='상품 수집';collectionNote.textContent='품번을 입력해 공식몰 상품정보와 이미지를 가져오세요.';
   reviewTitle.textContent='등록 내용 검토';reviewTitle.dataset.step='03';
   el('smartstoreOpen').textContent='스마트스토어 로그인 창 열기';
  }else{
   // Restore from the innermost moves first, including the exact Lotte layout.
   for(const {node,marker} of placeholders.reverse()){marker.replaceWith(node);}
   placeholders.length=0;
   for(const node of [photo,reviewStep,seller,uploadTitle,uploadWaiting,extras])node.remove();
   collectionTitle.textContent=originalText.collectionTitle;collectionNote.textContent=originalText.collectionNote;
   reviewTitle.textContent=originalText.reviewTitle;reviewTitle.dataset.step='02';el('smartstoreOpen').textContent=originalText.login;
   review.hidden=reviewWasHidden;
  }
 }
 document.addEventListener('register-state',event=>updateReady(event.detail));
 new MutationObserver(arrange).observe(document.body,{attributes:true,attributeFilter:['data-channel']});
 updateReady({productStyle:typeof smartstoreListingState==='undefined'?null:smartstoreListingState?.product?.style});arrange();
})();
