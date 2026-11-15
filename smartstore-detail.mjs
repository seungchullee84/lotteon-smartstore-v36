import * as one from './smartstore-template-one.mjs';
import * as two from './smartstore-template-two.mjs';
import {resolveDetailTemplate} from './smartstore-template-choice.mjs';
import {assertSellingPointDisplay} from './smartstore-selling-points.mjs';
export {TEMPLATE_ASSET_BASE,mannequinWearingNote,productSellingPoints} from './smartstore-template-one.mjs';
export const TEMPLATE_ASSET_NAMES=[...new Set([...one.TEMPLATE_ASSET_NAMES,...two.TEMPLATE_ASSET_NAMES])];
export const SMARTSTORE_DETAIL_TEMPLATE=one.SMARTSTORE_DETAIL_TEMPLATE;
function selected(product,options){
 if(product.smartstoreDetail?.sellingPoints?.length)assertSellingPointDisplay(product.smartstoreDetail.sellingPoints);
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
