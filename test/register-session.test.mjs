import test from 'node:test';import assert from 'node:assert/strict';
import {registerCookieName,validRegisterCookie} from '../register-session.mjs';
test('different registrar ports retain independent login cookies',()=>{
 const cookie=registerCookieName(50100)+'=first; '+registerCookieName(50200)+'=second';
 assert(validRegisterCookie(cookie,'first',50100));assert(validRegisterCookie(cookie,'second',50200));
 assert(!validRegisterCookie(cookie,'first',50200));assert(!validRegisterCookie(cookie,'wrong',50100));assert(!validRegisterCookie('','first',50100));
 assert(validRegisterCookie('session=first','first',50100));assert(!validRegisterCookie('session=second','first',50100));
});
