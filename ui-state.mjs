// Product fingerprints belong to the website checker; the UI only needs its events.
export function benefitResearchView(research){
 if(!research?.website)return research;
 const {products,...website}=research.website;
 return {...research,website};
}
