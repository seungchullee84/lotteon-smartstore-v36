export function registerCookieName(port){return 'register_session_'+Number(port);}
export function validRegisterCookie(cookie,token,port){
 const values=String(cookie||'').split(';').map(value=>value.trim());
 return values.includes(registerCookieName(port)+'='+token)||values.includes('session='+token);
}
