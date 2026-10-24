import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';

const run=promisify(execFile);

export async function detailImageDownloadFolder(){
 let desktop=path.join(os.homedir(),'Desktop');
 if(process.platform==='win32'){
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('DesktopDirectory')"],{windowsHide:true,encoding:'utf8',timeout:10000});
  desktop=stdout.trim();
  if(!desktop||!path.isAbsolute(desktop))throw Error('바탕화면 위치를 확인하지 못했습니다.');
 }
 const folder=path.join(desktop,'이미지다운');
 await mkdir(folder,{recursive:true});
 return folder;
}
