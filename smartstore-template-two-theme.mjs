import {officialTemplateTitle} from './smartstore-template-title.mjs';

const palettes={
 women:{paper:'#fffaf6',opening:'#f4e9eb',soft:'#f3e7e9',alternate:'#f8f0ec',banner:'#efdae1',ink:'#51313c',muted:'#80616a',accent:'#8a455b',button:'#673247',border:'#d7bdc5'},
 men:{paper:'#fcfaf6',opening:'#e8edf3',soft:'#e8edf3',alternate:'#f0f3f6',banner:'#d7e2ef',ink:'#263a54',muted:'#607086',accent:'#3b5c83',button:'#223d60',border:'#bdcbdc'},
 neutral:{paper:'#fcfaf6',opening:'#eeece7',soft:'#eeece7',alternate:'#f4f2ed',banner:'#e6e2db',ink:'#3c3c38',muted:'#706f68',accent:'#66685e',button:'#42443e',border:'#cfcec6'}
};
export function templateTwoTheme(product){
 const gender=String(product?.gender||'').trim();
 const key=/^(여성|여자|WOMEN|WOMAN|FEMALE)$/i.test(gender)?'women':/^(남성|남자|MEN|MAN|MALE)$/i.test(gender)?'men':'neutral';
 return {key,...palettes[key],needsGenderReview:key==='neutral'&&!/^(공용|남녀공용|유니섹스|UNISEX)$/i.test(gender)};
}
export function templateTwoHeadline(product,points=[]){
 const supported=points.filter(point=>point.evidence?.trim());
 const evidence=supported.map(point=>point.evidence).join(' ');
 if(/레이어드/.test(evidence)&&/단독/.test(evidence)&&/편안|부담.*착용/.test(evidence))return ['단독으로도,','겹쳐 입어도','편안하게.'];
 return [supported[0]?.title||officialTemplateTitle(product)];
}
