// Shared readiness for every style; photo preparation is not seller registration.
export function smartstorePreparationStatus(product, listing) {
  const detail=product.smartstoreDetail||{}, review=listing.manifest?.photoReview;
  const pending=detail.pendingPhotoCount||0, points=detail.sellingPoints?.length||0;
  const issues=[];
  if(review?.status==='needs-review')issues.push(review.message||'사진 색상·구도 대조 필요');
  if(pending)issues.push('사진 '+pending+'장 연결 필요');
  if(points<2||points>4||detail.sellingPointReview?.status==='needs-review')issues.push(detail.sellingPointReview?.message||'공식 근거 구매 장점 2~4개 확인 필요');
  if(!detail.photoCount&&!product.images?.detail&&!product.detailFallbackApproved)issues.push('상세 원본 확인 필요');
  return {style:product.style,status:issues.length?'needs-review':'ready',
    mainCount:1,extraCount:listing.extras.length,detailCount:detail.photoCount||0,
    pendingPhotoCount:pending,sellingPointCount:points,templateReady:issues.length===0,
    message:issues.length?issues.join(' · '):undefined};
}
