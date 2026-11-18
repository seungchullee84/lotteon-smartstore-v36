import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const request=JSON.parse(await readFile(path.join(root,'data','mybox-deploy','upload-request.json'),'utf8'));
const destination=new URL(request.folderUrl);
if(destination.origin!=='https://mybox.naver.com'||destination.pathname!=='/main/web/my')throw Error('MYBOX 배포 위치를 확인해 주세요.');
if(path.basename(request.zipPath)!=='최신업데이트.zip')throw Error('고정 업데이트 파일명을 확인해 주세요.');
const name='MYBOX automatic deployment setup';
const existing=(await listTaskSpaces()).find(space=>space.name===name);
if(existing&&existing.ownership!=='agent')throw Error('MYBOX 브라우저 확인이 필요합니다. 사용 중인 브라우저를 확인해 주세요.');
const task=await taskSpace(existing?.id||name);
const page=(await task.pages())[0]||await task.adopt((await task.tabs())[0].page);
try{
  await page.goto(destination.href);
  if(new URL(await page.url()).hostname==='nid.naver.com'){
    await task.handOff();throw Error('MYBOX 로그인이 필요합니다. 열린 브라우저에서 로그인해 주세요.');
  }
  await page.waitForFunction(()=>document.body.innerText.includes('올리기'),undefined,{timeout:20000});
  if(new URL(await page.url()).searchParams.get('resourceKey')!==destination.searchParams.get('resourceKey'))throw Error('MYBOX 배포 폴더에 진입하지 못했습니다.');
  await page.click('text="올리기"',{label:'Upload latest registrar update'});
  await page.waitForSelector('text="파일 올리기"',{state:'visible',timeout:10000});
  const chooserPromise=page.waitForFileChooser({timeout:10000});
  await page.click('text="파일 올리기"',{label:'Select latest update archive'});
  const chooser=await chooserPromise;await chooser.setFiles(request.zipPath);
  await page.waitForFunction(()=>/같은 이름|덮어|업로드 성공/.test(document.body.innerText),undefined,{timeout:120000});
  const initial=await page.evaluate(()=>document.body.innerText);
  if(/같은 이름|덮어/.test(initial)){
    await page.click('text="덮어쓰기"',{label:'Replace latest update archive'});
  }
  await page.waitForFunction(()=>document.body.innerText.includes('업로드 성공')&&/1\s*\/\s*1개 완료/.test(document.body.innerText),undefined,{timeout:120000});
  const text=await page.evaluate(()=>document.body.innerText);
  if(!text.includes(request.filename)||!text.includes('업로드 성공'))throw Error('MYBOX 업로드 결과가 일치하지 않습니다.');
  await writeFile(path.join(root,'data','mybox-deploy','upload-receipt.json'),JSON.stringify({attemptId:request.attemptId,sha:request.sourceCommit,filename:request.filename,folderUrl:destination.href,uploadedAt:new Date().toISOString()},null,2));
  await task.finish({keep:[]});
  console.log('MYBOX_RESULT '+JSON.stringify({ok:true,sha:request.sourceCommit}));
}catch(error){console.log('MYBOX_RESULT '+JSON.stringify({ok:false,error:error.message,spaceId:task.spaceId}));throw error;}
