// Smartstore-only orchestration. Publishing is deliberately a separate seller action.
export async function runSmartstoreAuto({input,apiKey,signal,log=()=>{},step=()=>{},collect,prepare,synthesize,includeMain=false,render,upload,preflight,onProduct=()=>{},onPrepared=()=>{}}){
 if(includeMain&&!apiKey)throw Error('자동 제작 연결 설정에서 OpenAI API 키를 연결해 주세요.');
 const check=()=>signal?.throwIfAborted();
 const timings={};
 const stage=async(name,message,fn)=>{check();step(name);log(message);const started=performance.now();const result=await fn();check();timings[name]=Math.round(performance.now()-started);log('단계 처리시간 · '+({connect:'로그인 확인',collect:'공식몰 수집',prepare:'사진 대조',compose:'합성',detail:'상세 제작',upload:'입력·업로드'}[name]||name)+' '+(timings[name]/1000).toFixed(1)+'초');return result;};
 const count=includeMain?6:5;
 const {product,folder}=await stage('collect',`1/${count} 공식몰 상품정보·원본 이미지 수집`,()=>collect(input));
 await onProduct(product,folder);check();
 const prepared=await stage('prepare',`2/${count} 폴더 사진·공식 색상 대조 및 상품 소구점 준비`,()=>prepare(product,folder));
 check();await onPrepared(prepared,folder);check();
 await stage('connect',`3/${count} 스마트스토어 로그인·복사등록 화면 확인`,preflight);
 const main=includeMain?await stage('compose','4/6 대표사진 배경 합성 · 1500×1500 · 공식 색상칩 적용',()=>synthesize(prepared,folder)):undefined;
 const detail=await stage('detail',`${count-1}/${count} 확정 템플릿 상세페이지 제작·바탕화면 저장`,()=>render(prepared,folder));
 const result=await stage('upload',`${count}/${count} 스마트스토어 상품정보·추가사진·상세페이지 업로드`,()=>upload(prepared,folder,{main,detail}));
 if(result?.detailUploaded!==true)throw Error('상세페이지 업로드 확인이 끝나지 않았습니다. 판매자센터 화면을 확인해 주세요.');
 log('자동 업로드 완료 · 판매자센터에서 최종 내용을 확인한 뒤 등록할 수 있습니다.');
 return {style:product.style,folder,main,detail,...result,published:false,timings};
}
