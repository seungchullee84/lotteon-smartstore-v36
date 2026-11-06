const labels={resumeVerify:'이전 작업 확인',connect:'판매자 화면 확인',collect:'공식몰 수집',prepare:'사진 대조',preview:'미리보기 반영',compose:'합성',detail:'상세 제작',upload:'입력·첨부 합계',
 uploadFiles:'첨부 파일 확인',basic:'상품명·가격 입력',options:'옵션·재고 확인',mainImage:'대표사진 첨부',extraImages:'추가사진 첨부',productInfo:'상품정보·고시 입력',careLabels:'택·케어라벨 첨부',editor:'상세 편집기 준비',detailVideo:'상세 영상 첨부',detailFinish:'상세 배치 확인'};
// Smartstore-only orchestration. Publishing is deliberately a separate seller action.
export async function runSmartstoreAuto({input,apiKey,signal,log=()=>{},step=()=>{},onTiming=()=>{},checkpoint={},verifyResume=()=>{},collect,prepare,synthesize,includeMain=false,render,upload,preflight,onProduct=()=>{},onPrepared=()=>{}}){
 if(includeMain&&!apiKey)throw Error('자동 제작 연결 설정에서 OpenAI API 키를 연결해 주세요.');
 const check=()=>signal?.throwIfAborted();
 const timings={};
 const measure=async(name,fn,message)=>{
  check();const label=labels[name]||(/^detailImage\d+$/.test(name)?'상세이미지 '+name.slice(11)+'장째 첨부':name);
  step(name,label);log(message||label+' 중…');const started=performance.now();
  let status='error';
  try{const value=await fn();check();status='done';return value;}
  finally{
   timings[name]=Math.round(performance.now()-started);
   const outcome=signal?.aborted?'stopped':status;
   onTiming(name,{label,ms:timings[name],status:outcome});
   log('구간 시간 · '+label+' '+(timings[name]/1000).toFixed(1)+'초'+(outcome==='done'?'':outcome==='stopped'?' · 중단':' · 확인 필요'));
  }
 };
 const stage=(name,message,fn)=>measure(name,fn,message);
 const count=includeMain?6:5;
 if(!checkpoint.ready){
  const {product,folder}=await stage('collect',`1/${count} 공식몰 상품정보·원본 이미지 수집`,()=>collect(input));
  await onProduct(product,folder);check();
  const prepared=await stage('prepare',`2/${count} 폴더 사진·공식 색상 대조 및 상품 소구점 준비`,()=>prepare(product,folder));
  const preview=await measure('preview',()=>onPrepared(prepared,folder));
  if(prepared.smartstoreDetail?.pendingPhotoCount){const error=Error('폴더 사진은 미리보기에 유지했습니다. 품번 폴더 사진 연결에서 '+prepared.smartstoreDetail.pendingPhotoCount+'장을 연결한 뒤 다시 시작해 주세요.');error.code='PHOTO_MATCH_REQUIRED';throw error;}
  checkpoint.ready={product,folder,prepared,preview};
 }else{
  await measure('resumeVerify',()=>verifyResume(checkpoint.ready));
  log('동일 품번·원본 확인 · 수집과 사진 준비 재사용');
 }
 const {product,folder,prepared,preview}=checkpoint.ready;
 await stage('connect',`3/${count} 스마트스토어 로그인·수정/복사등록 화면 확인`,()=>preflight(prepared));
 const main=includeMain?await stage('compose','4/6 대표사진 배경 합성 · 1500×1500 · 공식 색상칩 적용',()=>synthesize(prepared,folder)):undefined;
 const detail=checkpoint.detail??await stage('detail',`${count-1}/${count} 업로드용 상세이미지 준비`,()=>render(prepared,folder));
 checkpoint.detail=detail;
 const result=await stage('upload',`${count}/${count} 스마트스토어 상품정보·추가사진·상세페이지 업로드`,()=>upload(prepared,folder,{main,detail,preview,measure}));
 if(result?.detailUploaded!==true&&!(result?.editorPrepared===true&&result.editorApplied===false))throw Error('상세페이지 업로드 확인이 끝나지 않았습니다. 판매자센터 화면을 확인해 주세요.');
 log(result.editorPrepared?'상세설명 편집기 준비 완료 · 등록 버튼을 누르지 않고 대기합니다.':'자동 업로드 완료 · 상품 저장 안 함');
 return {style:product.style,folder,main,detail,...result,published:false,timings};
}
