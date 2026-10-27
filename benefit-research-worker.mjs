import {runCatalog} from './official-benefit-catalog.mjs';
import {exportBenefitSnapshot} from './benefit-sharing.mjs';
const [catalogDir,runtimeDir,sharedDir]=process.argv.slice(2);
if(!catalogDir||!runtimeDir||!sharedDir)throw Error('소구점 분석 작업 경로를 확인해 주세요.');
try{await runCatalog({catalogDir,dataRoot:runtimeDir,resume:true,imageWorkers:2});}
finally{await exportBenefitSnapshot(catalogDir,sharedDir);}
