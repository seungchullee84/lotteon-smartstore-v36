// A new seller-photo import replaces the detail selection, not the user's originals.
export function importedPhotoSelection(product,draft){
 if(draft?.importedColorPhotos===undefined)return null;
 if(draft.style!==product.style||draft.sourceUrl!==product.sourceUrl)throw Error('수집 사진 선택의 품번·공식 출처가 다릅니다.');
 if(!Array.isArray(draft.importedColorPhotos))throw Error('수집 사진 선택 자료를 확인해 주세요.');
 const groups=new Map(),seen=new Set();
 for(const group of draft.importedColorPhotos){
  if(!product.colors.includes(group.color)||groups.has(group.color)||!Array.isArray(group.hashes)||!group.hashes.length||group.hashes.length>4)throw Error('수집 사진의 색상·최대 4컷 선택을 확인해 주세요.');
  for(const hash of group.hashes){if(!/^[a-f0-9]{64}$/.test(hash)||seen.has(hash))throw Error('수집 사진의 원본 해시·중복을 확인해 주세요.');seen.add(hash);}
  groups.set(group.color,group.hashes);
 }
 return groups;
}
