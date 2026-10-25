import {chromium} from 'playwright';
import {mkdir,readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

export class BrowserAutomation {
  constructor(root,log){this.root=root;this.log=log;this.stopped=false;this.pending=null;}
  async stop(){
    this.stopped=true;this.pending?.reject(Error('사용자가 중단했습니다.'));this.pending=null;
    // Disconnect this automation client to cancel Playwright's in-flight waits.
    // The separately launched Chrome window and entered form stay open.
    const connection=this.browser;this.browser=null;this.context=null;this.page=null;
    if(connection)await connection.close().catch(()=>{});
  }
  check(){if(this.stopped) throw Error('사용자가 중단했습니다.');}
  async connectChrome(initialURL){
    // A loopback CDP connection survives app restarts; ordinary Chrome profiles are untouched.
    const profile=path.join(this.root,'browser-profile-chrome-v2');
    await mkdir(profile,{recursive:true});
    const connect=async()=>{
      const port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
      if(!Number.isInteger(port)||port<1024||port>65535)throw Error('크롬 연결 포트 확인 실패');
      this.browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:2000});
      this.context=this.browser.contexts()[0];
    };
    if(!this.browser?.isConnected()){
      try{await connect();}catch{
        const candidates=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>path.join(base,'Google','Chrome','Application','chrome.exe'));
        let exe=chromium.executablePath();
        for(const file of candidates){try{await access(file);exe=file;break;}catch{}}
        // Restore the dedicated profile's tabs and session cookies after Chrome exits.
        const child=spawn(exe,['--user-data-dir='+profile,'--restore-last-session','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check',initialURL],{detached:true,stdio:'ignore'});
        let launchError;child.on('error',e=>{launchError=e;});child.unref();
        let connected=false;
        for(let n=0;n<30;n++){if(launchError)throw Error('크롬을 실행하지 못했습니다: '+launchError.message);try{await connect();connected=true;break;}catch{await new Promise(r=>setTimeout(r,400));}}
        if(!connected)throw Error('전용 크롬 연결에 실패했습니다. 크롬 설치와 창 실행 상태를 확인해 주세요.');
      }
    }
  }
}
