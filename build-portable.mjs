// Windows x64 portable distribution. Uses an explicit public-data allowlist.
import {cp,mkdir,readFile,writeFile,readdir,realpath,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const destination=path.resolve(process.argv[2]||'');
if(!process.argv[2]||destination===root||destination.startsWith(root+path.sep))throw Error('프로젝트 밖의 새 배포 폴더를 지정하세요.');
try{await access(destination);throw Error('배포 폴더가 이미 있습니다. 새 경로를 지정하세요.');}catch(e){if(e.code!=='ENOENT')throw e;}
const browserSource=process.env.PLAYWRIGHT_BROWSERS_PATH;
if(!browserSource)throw Error('PLAYWRIGHT_BROWSERS_PATH를 지정하세요.');
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
const publicData=['category-catalog-common.json','category-catalog-standard.json','category-crosswalk.json','category-matches.json','category-itemscout-verified.json','washing-icon-library.json'].map(f=>'data/'+f);
const safe=files.filter(f=>publicData.includes(f)||f.startsWith('public/')||(!f.includes('/')&&/\.(mjs|json|md|traineddata|ico|png)$/.test(f)&&!f.startsWith('.'))||f==='.app-release.json');
const app=path.join(destination,'app');await mkdir(app,{recursive:true});
for(const file of safe)await cp(path.join(root,file),path.join(app,file),{recursive:true});
await mkdir(path.join(destination,'runtime'));await cp(process.execPath,path.join(destination,'runtime','node.exe'));
// Flatten pnpm's junction-based store into real portable directories. Resolve
// dependencies in their original package context, nesting conflicting versions.
const installed=new Map();const moduleRoot=path.join(app,'node_modules');
async function resolvePackage(name,from){
 const req=createRequire(path.join(from,'package.json'));
 for(const base of req.resolve.paths(name)||[]){
  const location=path.join(base,name);try{return {location:await realpath(location),pkg:JSON.parse(await readFile(path.join(location,'package.json'),'utf8'))};}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}
 }
 throw Error('의존성을 찾을 수 없습니다: '+name);
}
async function install(name,from,parent=app){
 const {location,pkg}=await resolvePackage(name,from);
 let target=path.join(moduleRoot,name);
 if(installed.has(target)&&installed.get(target)!==pkg.version)target=path.join(parent,'node_modules',name);
 if(installed.get(target)===pkg.version)return;
 if(installed.has(target))throw Error('의존성 버전 충돌: '+name);
 installed.set(target,pkg.version);
 await cp(location,target,{recursive:true,dereference:true,filter:src=>path.basename(src)!=='node_modules'});
 const optional=new Set(Object.keys(pkg.optionalDependencies||{}));
 for(const dependency of new Set([...Object.keys(pkg.dependencies||{}),...optional])){
  if(optional.has(dependency)){
   let resolved;try{resolved=await resolvePackage(dependency,location);}catch{continue;}
   if(resolved.pkg.os&&!resolved.pkg.os.includes('win32'))continue;
   if(resolved.pkg.cpu&&!resolved.pkg.cpu.includes('x64'))continue;
  }
  await install(dependency,location,target);
 }
}
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
for(const name of Object.keys(pkg.dependencies))await install(name,root);
console.log('의존성 '+installed.size+'개 포함');
await mkdir(path.join(destination,'browsers'));
for(const entry of await readdir(browserSource,{withFileTypes:true})){
 if(entry.isDirectory()&&/^(chromium|chromium_headless_shell|ffmpeg|winldd)-\d+$/.test(entry.name))await cp(path.join(browserSource,entry.name),path.join(destination,'browsers',entry.name),{recursive:true,dereference:true});
}
const launcher=String.raw`using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Text;
class Launcher {
 [STAThread] static void Main() {
  Application.EnableVisualStyles();
  string home=AppDomain.CurrentDomain.BaseDirectory;
  var form=new Form {Text="상품등록기",Width=450,Height=180,StartPosition=FormStartPosition.CenterScreen};
  var label=new Label {Text="상품등록기를 시작하고 있습니다…",Left=20,Top=20,Width=390,Height=50};
  var open=new Button {Text="등록기 열기",Left=20,Top=80,Width=160,Enabled=false};
  var close=new Button {Text="종료",Left=200,Top=80,Width=160};
  form.Controls.Add(label);form.Controls.Add(open);form.Controls.Add(close);
  Process child=null;string url=null;
  open.Click+=(s,e)=>{if(url!=null)Process.Start(new ProcessStartInfo(url){UseShellExecute=true});};
  close.Click+=(s,e)=>form.Close();
  form.FormClosing+=(s,e)=>{try{if(child!=null&&!child.HasExited)child.Kill();}catch{}};
  form.Shown+=(s,e)=>{
   try {
    var start=new ProcessStartInfo(Path.Combine(home,"runtime","node.exe"),"server.mjs");
    start.WorkingDirectory=Path.Combine(home,"app");start.UseShellExecute=false;start.CreateNoWindow=true;
    start.RedirectStandardOutput=true;start.RedirectStandardError=true;start.StandardOutputEncoding=Encoding.UTF8;start.StandardErrorEncoding=Encoding.UTF8;
    start.EnvironmentVariables["REGISTER_PORTABLE"]="1";
    start.EnvironmentVariables["PLAYWRIGHT_BROWSERS_PATH"]=Path.Combine(home,"browsers");
    foreach(string key in new[]{"REGISTER_DESKTOP","REGISTER_RESTORE","NAVER_CLIENT_ID","NAVER_CLIENT_SECRET","OPENAI_API_KEY"})start.EnvironmentVariables.Remove(key);
    child=new Process {StartInfo=start,EnableRaisingEvents=true};
    child.OutputDataReceived+=(sender,line)=>{
     if(line.Data==null)return;int index=line.Data.IndexOf("http://127.0.0.1:");
     if(index>=0){url=line.Data.Substring(index).Trim();if(!form.IsDisposed)form.BeginInvoke((Action)(()=>{label.Text="실행 중입니다. 브라우저에서 상품등록기를 사용하세요.\n이 창을 닫으면 등록기가 종료됩니다.";open.Enabled=true;}));}
    };
    child.ErrorDataReceived+=(sender,line)=>{if(line.Data!=null)try{File.AppendAllText(Path.Combine(home,"app","data","실행오류.log"),line.Data+Environment.NewLine);}catch{}};
    child.Exited+=(sender,args)=>{if(!form.IsDisposed&&form.IsHandleCreated)form.BeginInvoke((Action)(()=>{label.Text="등록기가 종료되었습니다. 다시 실행하려면 이 창을 닫고 실행하세요.";open.Enabled=false;}));};
    Directory.CreateDirectory(Path.Combine(home,"app","data"));child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();
   }catch(Exception error){MessageBox.Show(error.Message,"실행 오류");form.Close();}
  };
  Application.Run(form);
 }
}`;
const sourceFile=path.join(destination,'launcher-source.cs');await writeFile(sourceFile,launcher,'utf8');
const compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
execFileSync(compiler,['/nologo','/target:winexe','/platform:x64','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/win32icon:'+path.join(root,'rocket.ico'),'/out:'+path.join(destination,'상품등록기.exe'),sourceFile],{windowsHide:true,stdio:'pipe'});
await writeFile(path.join(destination,'사용방법.txt'),'Windows 10/11 64비트용\r\n\r\n1. ZIP 파일을 폴더 전체로 압축 해제합니다. ZIP 안에서 바로 실행하지 마세요.\r\n2. 상품등록기.exe를 더블클릭합니다. Node.js 설치는 필요 없습니다.\r\n3. 상단 설정에서 네이버 API Client ID와 Client Secret을 처음 한 번 입력합니다.\r\n4. 판매처 로그인 창에서 직접 로그인합니다.\r\n5. 종료할 때 실행 창의 종료 버튼을 누릅니다.\r\n\r\nexe만 옮기지 말고 app, runtime, browsers 폴더를 함께 보관하세요.\r\n키와 로그인 정보는 app/data에 해당 PC용으로 저장됩니다.\r\n이 배포 파일에는 기존 PC의 키·로그인·상품 작업 자료가 들어 있지 않습니다.\r\n스마트스토어 상품명은 품번·공백 포함 27~39자이며 공식 상품정보와 네이버 검색 관심도를 참고합니다. 롯데온 상품명은 유지합니다.\r\n인터넷 연결이 필요합니다. 배포판은 GitHub 소스를 자동 수정하거나 업로드하지 않습니다.\r\n');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const manifest={version:pkg.version,sourceCommit:sha,platform:'win32-x64',builtAt:new Date().toISOString(),publicData,dependencies:installed.size,node:process.version};
await writeFile(path.join(destination,'build-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({destination,...manifest}));
