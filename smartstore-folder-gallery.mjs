// Use the authoritative style-folder photos without inventing color/angle labels.
// Full-width shots alternate with pairs; original aspect ratios remain intact.
export function folderPhotoGallery(product,draft,photo){
 const urls=(draft?.providedImages||[]).filter(src=>/^\/smartstore-photo\/[a-f0-9]{24}$/.test(src));
 if(!draft?.acceptAllFolderPhotos||!urls.length)return '';
 const blocks=[];
 for(let i=0;i<urls.length;i+=3){
  const chunk=urls.slice(i,i+3);
  const card=src=>'<div style="min-width:0;overflow:hidden;border-radius:12px;">'+photo(src,'현재 상품 '+product.style+' 착용사진')+'</div>';
  // A final pair stays side by side rather than leaving an empty half row.
  blocks.push('<div data-folder-photo-block style="margin:0 0 8px;">'+(chunk.length===2
   ?'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:start;">'+chunk.map(card).join('')+'</div>'
   :card(chunk[0])+(chunk.length>1?'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px;align-items:start;">'+chunk.slice(1).map(card).join('')+'</div>':''))+'</div>');
 }
 return '<section data-folder-photos data-photo-count="'+urls.length+'" style="padding:48px 3%;background:#f6f3ef;"><div style="text-align:center;padding:0 3% 32px;"><p style="font-size:18px;letter-spacing:2px;margin:0 0 10px;color:#647268;">LOOK &amp; DETAIL</p><h2 style="font-size:30px;line-height:1.7;margin:0;">착용 모습과 디테일</h2></div>'+blocks.join('')+'</section>';
}
