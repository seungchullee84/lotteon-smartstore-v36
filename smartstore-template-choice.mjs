export const DEFAULT_SMARTSTORE_TEMPLATE=1;
export function resolveDetailTemplate(value){
 if(value===undefined||value===null)return DEFAULT_SMARTSTORE_TEMPLATE;
 if(value===1||value==='1')return 1;
 if(value===2||value==='2')return 2;
 throw Error('상세 템플릿 1 또는 2를 선택해 주세요.');
}
