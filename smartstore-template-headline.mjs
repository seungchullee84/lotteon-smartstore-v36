export const TEMPLATE_HEADLINE_LIMIT=120;
export function validateTemplateHeadline(value){
 if(typeof value!=='string'||value.length>TEMPLATE_HEADLINE_LIMIT)throw Error('메인 제목은 120자 이내로 입력해 주세요.');
 return value.replace(/\r\n?/g,'\n');
}
export function templateMainHeadline(product,fallback=''){
 const custom=typeof product?.templateHeadline==='string'?product.templateHeadline.slice(0,TEMPLATE_HEADLINE_LIMIT).replace(/\r\n?/g,'\n').trim():'';
 return custom||fallback;
}
