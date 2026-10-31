export const TEMPLATE_HEADLINE_LIMIT=120;
export function validateTemplateHeadline(value){
 if(typeof value!=='string'||value.length>TEMPLATE_HEADLINE_LIMIT)throw Error('메인 제목은 120자 이내로 입력해 주세요.');
 return value.replace(/\r\n?/g,'\n');
}
export function templateMainHeadline(product,fallback='',variant=product?.detailTemplate){
 const key=variant===1||variant===2?'templateHeadline'+variant:'templateHeadline';
 const value=typeof product?.[key]==='string'?product[key]:product?.templateHeadline;
 const custom=typeof value==='string'?value.slice(0,TEMPLATE_HEADLINE_LIMIT).replace(/\r\n?/g,'\n').trim():'';
 return custom||fallback;
}

export function templateHeadlineEdits(product,title,variant){
 if(variant!==1&&variant!==2)throw Error('템플릿 1 또는 2를 선택해 주세요.');
 const key='templateHeadline'+variant,other='templateHeadline'+(variant===1?2:1);
 return {templateHeadline:validateTemplateHeadline(title),[key]:validateTemplateHeadline(title),[other]:validateTemplateHeadline(product?.[other]??product?.templateHeadline??'')};
}
