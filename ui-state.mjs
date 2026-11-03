// Product fingerprints belong to the website checker; the UI only needs its events.
export function benefitResearchView(research){
 if(!research?.website)return research;
 const {products,...website}=research.website;
 const folder=research.folderResearch;
 return {...research,website,message:folder?research.message.replace(' · 소구점은 품번별 요청 시 조사','')+' · '+folder.message:research.message};
}
