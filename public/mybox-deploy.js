(() => {
  const anchor=document.getElementById('githubSyncStatus');
  if(!anchor)return;
  const button=document.createElement('button');button.type='button';button.textContent='MYBOX 자동배포';
  const loginButton=document.createElement('button');loginButton.type='button';loginButton.textContent='MYBOX 로그인';loginButton.style.marginLeft='6px';loginButton.title='네이버 MYBOX 자동배포용 로그인 창을 엽니다. 1회 로그인 후 자동 업로드됩니다.';
  const status=document.createElement('span');status.style.marginLeft='8px';status.setAttribute('role','status');
  anchor.after(button,loginButton,status);
  let current;
  async function refresh(){
    try{
      const response=await fetch('/api/mybox-deploy');if(!response.ok)return;
      current=await response.json();button.hidden=!!current.portable;loginButton.hidden=!!current.portable;status.hidden=!!current.portable;
      status.textContent=current.message;
      button.textContent=current.enabled?'MYBOX 자동배포 켜짐':'MYBOX 자동배포 꺼짐';
      button.title='GitHub 반영 후 테스트하고 MYBOX 내 파일의 최신업데이트.zip을 교체합니다.';
    }catch{status.textContent='MYBOX 배포 상태 연결 대기';}
  }
  button.onclick=async()=>{
    if(!current)return;button.disabled=true;
    try{
      const response=await fetch('/api/mybox-deploy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!current.enabled})});
      if(!response.ok){const result=await response.json();throw Error(result.error||'설정을 저장하지 못했습니다.');}
      await refresh();
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  loginButton.onclick=async()=>{
    loginButton.disabled=true;status.textContent='MYBOX 로그인 창을 여는 중…';
    try{
      const response=await fetch('/api/mybox-login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'MYBOX 로그인 창을 열지 못했습니다.');
      status.textContent=result.message||'열린 Chrome 창에서 네이버 로그인을 완료해 주세요.';
    }catch(error){status.textContent=error.message;}finally{loginButton.disabled=false;}
  };
  void refresh();setInterval(refresh,15000);
})();
