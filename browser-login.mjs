const attempts=new WeakMap();
const samePortal=page=>{try{const u=new URL(page.url());return u.origin==='https://together.lotteshopping.com'&&u.pathname.startsWith('/EMDV3/');}catch{return false;}};
const idSelector='[id$="div_Login_edt_LoginId_input"]',passwordSelector='[id$="div_Login_edt_LoginPassword_input"]',buttonSelector='[id$="div_Login_btn_Login"]';
export async function selectLottePage(pages,previous){
 const eligible=pages.filter(page=>!page.isClosed()&&samePortal(page));
 if(eligible.includes(previous))return previous;
 for(const page of [...eligible].reverse())if(await page.getByText('로그아웃',{exact:true}).first().isVisible().catch(()=>false))return page;
 return eligible.at(-1)||null;
}
export async function tryLotteLogin(page,{store,log=()=>{},check=()=>{},timeout=12000,waitForForm=false}={}){
 if(!samePortal(page))return {status:'unrelated'};
 const id=page.locator(idSelector),password=page.locator(passwordSelector),button=page.locator(buttonSelector);
 if(waitForForm&&!await id.isVisible().catch(()=>false)&&!await page.getByText('로그아웃',{exact:true}).first().isVisible().catch(()=>false)){
  await id.waitFor({state:'visible',timeout:6000}).catch(()=>{});
 }
 // Only the known visible official login form is eligible. Never inspect cookies.
 if(!await id.isVisible().catch(()=>false)){attempts.delete(page);return {status:'session'};}
 if(!await password.isVisible().catch(()=>false)||!await button.isVisible().catch(()=>false))return {status:'manual'};
 let credentials;try{credentials=await store.load();}catch{log('자동 로그인 설정을 읽지 못했습니다. 설정 화면에서 다시 저장하거나 직접 로그인해 주세요.');return {status:'unavailable'};}
 if(!credentials)return {status:'unconfigured'};
 if(attempts.get(page)===credentials.revision)return {status:'manual'};
 const captcha=page.locator('iframe[src*="captcha"], input[id*="captcha" i], input[name*="captcha" i]');
 for(let i=0;i<await captcha.count();i++)if(await captcha.nth(i).isVisible())return {status:'manual'};
 const entered=await id.inputValue();
 if((entered&&entered!==credentials.username)||await password.inputValue()){
  log('직접 입력 중인 로그인 정보를 유지합니다. 전용 크롬에서 로그인을 완료해 주세요.');return {status:'manual'};
 }
 attempts.set(page,credentials.revision);let dialog=false;
 const onDialog=()=>{dialog=true;};page.on('dialog',onDialog);
 try{
  check();if(!samePortal(page))return {status:'unrelated'};
  await id.fill(credentials.username,{timeout:3000});await id.press('Tab');
  check();if(!samePortal(page))return {status:'unrelated'};
  await password.fill(credentials.password,{timeout:3000});await password.press('Tab');
  check();if(!samePortal(page))return {status:'unrelated'};
  log('저장된 계정으로 롯데 자동 로그인을 한 번 시도합니다.');
  await button.click({timeout:5000,noWaitAfter:true});
  const until=Date.now()+timeout;
  while(Date.now()<until&&!dialog){
   check();if(!samePortal(page))break;
   if(!await id.isVisible()){
    const logout=page.getByText('로그아웃',{exact:true});
    if(await logout.first().isVisible().catch(()=>false)){
     attempts.delete(page);log('롯데 로그인 상태를 확인했습니다.');return {status:'authenticated'};
    }
   }
   await page.waitForTimeout(250);
  }
 }catch{check();}
 finally{page.off('dialog',onDialog);credentials=null;}
 log('자동 로그인 후 확인이 필요합니다. 전용 크롬에서 계정 정보·추가 인증을 확인해 주세요. 자동으로 반복 시도하지 않습니다.');
 return {status:'manual'};
}
