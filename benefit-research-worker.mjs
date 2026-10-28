import {runCatalog} from './official-benefit-catalog.mjs';
import {setTimeout as wait} from 'node:timers/promises';
import path from 'node:path';
import {exportBenefitSnapshot,readJson,writeChanged} from './benefit-sharing.mjs';
import {websiteCheckDue,saveWebsiteCheck,BENEFIT_CHECK_INTERVAL} from './benefit-updates.mjs';
const [catalogDir,runtimeDir,sharedDir]=process.argv.slice(2);
if(!catalogDir||!runtimeDir||!sharedDir)throw Error('소구점 분석 작업 경로를 확인해 주세요.');
const progress=await readJson(path.join(catalogDir,'progress.json'));
const lastCheck=await readJson(path.join(catalogDir,'website-check.json'));
if(progress?.phase==='images'&&!websiteCheckDue(lastCheck)){
 try{await runCatalog({catalogDir,dataRoot:runtimeDir,resume:true,imageWorkers:2,imageDeadline:Date.parse(lastCheck.nextCheckAt)});}
 catch(error){console.error(error.message);}
 finally{await exportBenefitSnapshot(catalogDir,sharedDir);}
}
while(true){
 let state=await readJson(path.join(catalogDir,'website-check.json'));
 if(!websiteCheckDue(state)){await wait(Math.min(60000,Math.max(1000,Date.parse(state.nextCheckAt)-Date.now())));continue;}
 let deadline=Date.now()+BENEFIT_CHECK_INTERVAL;
 try{await runCatalog({catalogDir,dataRoot:runtimeDir,resume:true,refresh:true,imageWorkers:2,imageDeadline:()=>deadline,onSourceCheck:async(records,status)=>{state=await saveWebsiteCheck(catalogDir,records,{errors:status.errors.length});deadline=Date.parse(state.nextCheckAt);await exportBenefitSnapshot(catalogDir,sharedDir);}});}
 catch(error){console.error(error.message);await writeChanged(path.join(catalogDir,'website-error.json'),{at:new Date().toISOString(),message:'공식몰 업데이트 확인에 실패했습니다. 다음 주기에 다시 확인합니다.'});await wait(BENEFIT_CHECK_INTERVAL);}
 finally{await exportBenefitSnapshot(catalogDir,sharedDir);}
}
