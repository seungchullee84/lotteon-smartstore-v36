import * as one from './smartstore-template-one.mjs';
import * as two from './smartstore-template-two.mjs';
import {resolveDetailTemplate} from './smartstore-template-choice.mjs';
export {TEMPLATE_ASSET_NAMES,TEMPLATE_ASSET_BASE,mannequinWearingNote,productSellingPoints} from './smartstore-template-two.mjs';
export const SMARTSTORE_DETAIL_TEMPLATE=one.SMARTSTORE_DETAIL_TEMPLATE;
function selected(product,options){
 const variant=resolveDetailTemplate(options.detailTemplate??product.detailTemplate);
 return {renderer:variant===1?one:two,variant,label:'템플릿 '+variant};
}
export function buildSmartstoreDetail(product,options={}){
 const {renderer,variant,label}=selected(product,options);
 return {...renderer.buildSmartstoreDetail(product,options),templateVariant:variant,templateLabel:label};
}
export function smartstoreDetailDocument(product,options={}){
 const {renderer,variant,label}=selected(product,options);
 return {...renderer.smartstoreDetailDocument(product,options),templateVariant:variant,templateLabel:label};
}
