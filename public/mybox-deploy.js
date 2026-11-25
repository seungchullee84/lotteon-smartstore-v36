(() => {
  const anchor=document.getElementById('githubSyncStatus');
  if(!anchor)return;
  const button=document.createElement('button');button.type='button';button.textContent='드라이브 자동배포';
  const status=document.createElement('span');status.style.marginLeft='8px';status.setAttribute('role','status');
  anchor.after(button,status);
  let current;
  async function refresh(){
    try{
      const response=await fetch('/api/mybox-deploy');if(!response.ok)return;
      current=await response.json();button.hidden=!!current.portable;status.hidden=!!current.portable;
      const label=current.provider==='gdrive'?'Google 드라이브':'MYBOX';
      status.textContent=current.message;
      button.textContent=current.enabled?label+' 자동배포 켜짐':label+' 자동배포 꺼짐';
      button.title='GitHub 반영 후 테스트하고 '+label+'의 최신업데이트.zip을 자동으로 덮어씁니다.';
    }catch{status.textContent='자동배포 상태 연결 대기';}
  }
  button.onclick=async()=>{
    if(!current)return;button.disabled=true;
    try{
      const response=await fetch('/api/mybox-deploy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!current.enabled})});
      if(!response.ok){const result=await response.json();throw Error(result.error||'설정을 저장하지 못했습니다.');}
      await refresh();
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  void refresh();setInterval(refresh,15000);
})();
