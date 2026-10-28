import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {prepareSmartstoreAuto} from './smartstore-auto-prepare.mjs';
import {stageImportedPhotos,applyImportedPhotos,allImportedPhotoChoices,assertImportedPhotoCoverage} from './smartstore-photo-import.mjs';

// The same verified source import is used by both the explicit button and first collection.
export async function importSmartstoreColorPhotos(product,folder,options){
 const {dataRoot,signal,readSource,assertCurrent=()=>{},prepare=prepareSmartstoreAuto}=options;
 const check=()=>{signal?.throwIfAborted();assertCurrent(product,folder);};
 check();
 const source=await readSource(product,{signal,isolated:options.isolatedSource===true});check();
 // Check identity before downloading or modifying a style's local files.
 allImportedPhotoChoices({...source,candidates:[]},product);
 const stage=await stageImportedPhotos(source,folder,options);check();
 let known=[],ignored=[];
 try{const draft=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'draft.json'),'utf8'));if(draft.style!==product.style||draft.sourceUrl!==product.sourceUrl)throw Error('기존 사진 매칭 자료의 품번·출처가 다릅니다.');known=draft.photoMapping?.files||[];ignored=draft.photoMapping?.ignoredPhotos||[];}catch(error){if(error.code!=='ENOENT')throw error;}
 const choices=allImportedPhotoChoices(stage,product,known,ignored);
 const result=await applyImportedPhotos(product,folder,choices,{...options,automatic:true});check();
 const prepared=await prepare(product,folder,options);check();
 assertImportedPhotoCoverage(stage,prepared,choices,{requireSellingPoints:false});
 if(prepared.smartstoreDetail?.pendingPhotoCount)throw Error('기존 상품 사진을 가져온 뒤에도 색상 연결이 남아 있습니다.');
 await writeFile(path.join(folder,'product.json'),JSON.stringify(prepared,null,2));
 return {product:prepared,stage,result};
}

export async function prepareSmartstoreWithColorRecovery(product,folder,options){
 const {prepare=prepareSmartstoreAuto,signal,log=()=>{},onRecovery=()=>{},onImported=()=>{}}=options;
 signal?.throwIfAborted();
 const prepared=await prepare(product,folder,options);signal?.throwIfAborted();
 const pending=prepared.smartstoreDetail?.pendingPhotoCount||0;
 if(!pending)return prepared;
 log('사진 '+pending+'장 색상 연결 확인 · 같은 품번의 기존 상품 색상 구간을 자동으로 가져옵니다.');
 await onRecovery(prepared);signal?.throwIfAborted();
 const imported=await importSmartstoreColorPhotos(prepared,folder,{...options,isolatedSource:true});
 await onImported(imported);signal?.throwIfAborted();
 log('기존 상품 색상 구간 대조 완료 · '+imported.result.selectedCount+'장 연결 · 상품 저장 안 함');
 return imported.product;
}
