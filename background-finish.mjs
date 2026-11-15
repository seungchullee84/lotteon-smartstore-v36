import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Small local bridge for the built-in image tool. Never calls a paid image API
// and never writes product manifests itself; the running server owns all guards.
const root=path.dirname(fileURLToPath(import.meta.url));
async function main(){
 const [action,...args]=process.argv.slice(2);
 const take=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
 const jobId=take('--job');
 if(!['inspect','stage','apply','retry','fail'].includes(action)||!jobId)throw Error('사용법: node background-finish.mjs inspect|stage|apply|retry|fail --job 요청번호 [--image 생성이미지절대경로] [--reviewed --attempt 회차] [--reason 사유]');
 const endpoint={inspect:'background-inspect',stage:'background-result',apply:'background-complete',retry:'background-retry',fail:'background-fail'}[action];
 const payload={jobId};
 if(action==='stage'){payload.generatedPath=take('--image');if(!payload.generatedPath)throw Error('--image 생성이미지절대경로가 필요합니다.');}
 if(action==='apply'){if(!args.includes('--reviewed'))throw Error('최종 합성 이미지를 직접 확인한 뒤 --reviewed를 지정해 주세요.');payload.reviewed=true;if(take('--attempt')!==undefined)payload.attempt=Number(take('--attempt'));}
 if(action==='retry'||action==='fail'){payload.reason=take('--reason');if(!payload.reason?.trim())throw Error('--reason에 실제 확인한 문제를 적어 주세요.');}
 const session=JSON.parse(await readFile(path.join(root,'data','active-register-session.json'),'utf8'));
 const origin='http://127.0.0.1:'+session.port;
 const response=await fetch(origin+'/api/'+endpoint,{method:'POST',headers:{origin,cookie:'register_session_'+session.port+'='+session.token,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'합성 처리를 완료하지 못했습니다.');
 console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
