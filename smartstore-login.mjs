const STORE='https://sell.smartstore.naver.com',COMMERCE='https://accounts.commerce.naver.com',NID='https://nid.naver.com';
const attempts=new WeakMap();
const visible=locator=>locator.isVisible().catch(()=>false);
function urlOf(page){try{return new URL(page.url());}catch{return null;}}
const onStore=page=>urlOf(page)?.origin===STORE;
function commerceLogin(page){
 const url=urlOf(page);if(url?.origin!==COMMERCE||!/^\/login\/?$/.test(url.pathname))return false;
 try{return new URL(url.searchParams.get('url')).origin===STORE;}catch{return false;}
}
const nidLogin=page=>{const url=urlOf(page);return url?.origin===NID&&url.pathname==='/nidlogin.login';};
async function authenticated(page){
 return !page.isClosed()&&onStore(page)&&(await visible(page.locator('input[name="product.name"]'))||await visible(page.getByText('로그아웃',{exact:true}).first()));
}
async function challenge(page){
 const fields=page.locator('iframe[src*="captcha" i], input[id*="captcha" i], input[name*="captcha" i], input[autocomplete="one-time-code"], input[name="otp"]');
 for(let i=0;i<await fields.count();i++)if(await visible(fields.nth(i)))return true;
 return false;
}
export async function selectSmartstorePage(pages,previous){
 const eligible=pages.filter(page=>!page.isClosed()&&(onStore(page)||commerceLogin(page)));
 if(eligible.includes(previous))return previous;
 for(const page of [...eligible].reverse())if(await authenticated(page))return page;
 return eligible.filter(onStore).at(-1)||eligible.at(-1)||null;
}

export async function trySmartstoreLogin(portal,{context=portal.context(),store,log=()=>{},check=()=>{},timeout=12000,navigationTimeout=6000}={}){
 if(!onStore(portal)&&!commerceLogin(portal))return {status:'unrelated',page:portal};
 if(await authenticated(portal)){attempts.delete(portal);return {status:'session',page:portal};}
 let credentials;try{credentials=await store.load();}catch{log('스마트스토어 자동 로그인 정보를 읽지 못했습니다. 설정에서 다시 저장하거나 직접 로그인해 주세요.');return {status:'unavailable',page:portal};}
 if(!credentials)return {status:'unconfigured',page:portal};
 const prior=attempts.get(portal);
 if(prior?.revision===credentials.revision){if(!prior.authPage.isClosed())await prior.authPage.bringToFront();return {status:'manual',page:portal};}
 if(!['naver','seller'].includes(credentials.loginType))return {status:'manual',page:portal};
 let login=portal,dialog=false;const observed=new Set(),onDialog=()=>{dialog=true;};
 const observe=page=>{if(!observed.has(page)){observed.add(page);page.on('dialog',onDialog);}};
 observe(portal);
 const attempt={revision:credentials.revision,authPage:portal};
 const manual=async()=>{
  if(!login.isClosed())await login.bringToFront().catch(()=>{});
  log('스마트스토어 로그인 확인이 필요합니다. 전용 크롬에서 계정·보안문자·추가 인증을 직접 확인해 주세요. 자동으로 반복 시도하지 않습니다.');
  return {status:'manual',page:portal};
 };
 try{
  check();
  if(onStore(portal)){
   // Follow only the official SmartStore login link and its validated callback.
   const links=portal.getByRole('link',{name:'로그인하기',exact:true});
   if(!await visible(links.first()))await links.first().waitFor({state:'visible',timeout:navigationTimeout}).catch(()=>{});
   if(await authenticated(portal))return {status:'session',page:portal};
   if(!await visible(links.first()))return await manual();
   const link=links.first(),href=await link.getAttribute('href').catch(()=>null);
   let destination;try{destination=new URL(href,portal.url());}catch{return await manual();}
   if(!commerceLogin({url:()=>destination.href}))return await manual();
   attempts.set(portal,attempt);await link.click({timeout:navigationTimeout,noWaitAfter:true});
   await portal.waitForURL(url=>url.origin===COMMERCE&&/^\/login\/?$/.test(url.pathname),{timeout:navigationTimeout}).catch(()=>{});
  }
  if(!commerceLogin(portal))return await manual();
  if(await challenge(portal))return await manual();
  if(credentials.loginType==='naver'){
   const sellerId=portal.getByPlaceholder('아이디 또는 이메일 주소',{exact:true}),sellerPassword=portal.getByPlaceholder('비밀번호',{exact:true});
   if(await visible(sellerId)&&(await sellerId.inputValue()||await sellerPassword.inputValue()))return await manual();
   const button=portal.getByRole('button',{name:/^네이버 아이디로\s*로그인$/});
   await button.waitFor({state:'visible',timeout:navigationTimeout});check();if(!commerceLogin(portal))return await manual();
   // Reuse this commerce window's pending Naver popup, never an unrelated Naver tab.
   for(const page of context.pages())if(!page.isClosed()&&nidLogin(page)&&await page.opener()===portal){login=page;break;}
   attempts.set(portal,attempt);
   if(login===portal){
    const popup=portal.waitForEvent('popup',{timeout:navigationTimeout}).catch(()=>null);
    await button.click({timeout:navigationTimeout,noWaitAfter:true});
    login=await popup||portal;
    await login.waitForURL(url=>url.origin===NID&&url.pathname==='/nidlogin.login',{timeout:navigationTimeout}).catch(()=>{});
   }
   attempt.authPage=login;observe(login);
   if(await authenticated(portal)){attempts.delete(portal);log('스마트스토어 로그인 상태를 확인했습니다.');return {status:'authenticated',page:portal};}
   if(login.isClosed()||!nidLogin(login)||login!==portal&&await login.opener()!==portal)return await manual();
  }
  const trusted=()=>credentials.loginType==='naver'?nidLogin(login):commerceLogin(login);
  const id=credentials.loginType==='naver'?login.locator('#id'):login.getByPlaceholder('아이디 또는 이메일 주소',{exact:true});
  const password=credentials.loginType==='naver'?login.locator('#pw'):login.getByPlaceholder('비밀번호',{exact:true});
  await id.waitFor({state:'visible',timeout:navigationTimeout});
  if(!trusted()||!await visible(password)||await challenge(login))return await manual();
  const enteredId=await id.inputValue(),enteredPassword=await password.inputValue();
  if(enteredId&&enteredId!==credentials.username||enteredPassword&&enteredPassword!==credentials.password)return await manual();
  attempts.set(portal,attempt);check();if(!trusted())return await manual();
  await id.fill(credentials.username,{timeout:3000});await id.press('Tab');
  check();if(!trusted())return await manual();await password.fill(credentials.password,{timeout:3000});await password.press('Tab');
  // Preserve IP security and all extra authentication settings.
  if(credentials.loginType==='naver'){
   const keep=login.getByRole('checkbox',{name:'로그인 상태 유지',exact:true});if(await visible(keep))await keep.check({timeout:3000});
  }
  check();if(!trusted()||await challenge(login))return await manual();
  const submit=login.getByRole('button',{name:'로그인',exact:true});if(await submit.count()!==1)return await manual();
  log('저장된 스마트스토어 계정으로 자동 로그인을 한 번 시도합니다.');await submit.click({timeout:5000,noWaitAfter:true}).catch(error=>{if(!login.isClosed())throw error;});
  const until=Date.now()+timeout;
  while(Date.now()<until&&!dialog){
   check();
   if(await authenticated(portal)){attempts.delete(portal);log('스마트스토어 로그인 상태를 확인했습니다.');return {status:'authenticated',page:portal};}
   if(!login.isClosed()&&await challenge(login))break;
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  return await manual();
 }catch{check();return await manual();}
 finally{for(const page of observed)page.off('dialog',onDialog);credentials=null;}
}
