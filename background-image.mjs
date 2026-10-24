import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';

// The API key stays in server memory and is never included in product files.
export async function generateBackground({folder,apiKey,sourceKey='main',signal,fetchImpl=fetch}){
 if(!apiKey)throw Error('합성 설정에서 OpenAI API 키를 먼저 연결해 주세요.');
 if(!['main','extra1','extra2'].includes(sourceKey))throw Error('합성 원본 선택을 확인해 주세요.');
 const original=await readFile(path.join(folder,sourceKey+'.jpg'));
 const form=new FormData();
 form.set('model','gpt-image-1.5');
 form.set('image',new Blob([original],{type:'image/jpeg'}),'original.jpg');
 form.set('prompt','Extend only the background to the left and right to create a square product photograph. Preserve the original person, face, pose, entire visible body, clothing design, fabric texture, patterns and exact colors. Keep the original subject at its original proportions and preserve everything visible in the source. Continue the existing studio background and floor naturally with matching lighting and shadows. No borders, white padding, text, logos or extra people. Do not crop the subject.');
 form.set('size','1024x1024');
 form.set('quality','high');
 form.set('input_fidelity','high');
 form.set('output_format','jpeg');
 form.set('n','1');
 const response=await fetchImpl('https://api.openai.com/v1/images/edits',{
  method:'POST',headers:{Authorization:'Bearer '+apiKey},body:form,
  signal:signal?AbortSignal.any([signal,AbortSignal.timeout(600000)]):AbortSignal.timeout(600000)
 });
 if(!response.ok){
  // Do not surface remote messages that might echo request credentials.
  await response.body?.cancel();
  const messages={401:'API 키가 올바르지 않습니다. 합성 설정에서 다시 연결해 주세요.',403:'이 API 계정에 이미지 합성 권한이 없습니다.',429:'API 사용 한도 또는 잔액을 확인해 주세요.',400:'이미지 합성 요청이 거절됐습니다. 원본 이미지와 API 계정 설정을 확인해 주세요.'};
  throw Error(messages[response.status]||'이미지 합성 서비스 오류입니다. 잠시 후 다시 시도해 주세요.');
 }
 const result=await response.json();
 signal?.throwIfAborted();
 const encoded=result.data?.[0]?.b64_json;
 if(!encoded)throw Error('합성 결과 이미지를 받지 못했습니다. 대표이미지는 유지됩니다.');
 const bytes=Buffer.from(encoded,'base64');
 const metadata=await sharp(bytes).metadata();
 if(!metadata.width||metadata.width!==metadata.height)throw Error('합성 결과가 정사각형이 아닙니다. 대표이미지는 유지됩니다.');
 const id=randomBytes(12).toString('hex');
 const file='main-composite-'+id+'.jpg';
 const output=path.join(folder,file);
 const temporary=path.join(folder,'background-image-'+id+'.tmp');
 try{
  await sharp(bytes).resize(1500,1500).jpeg({quality:95}).toFile(output);
  signal?.throwIfAborted();
  await writeFile(temporary,JSON.stringify({file}));
  await rename(temporary,path.join(folder,'background-image.json'));
 }catch(e){await rm(temporary,{force:true});await rm(output,{force:true});throw e;}
 return {file,version:file};
}
