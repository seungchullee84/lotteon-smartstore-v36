import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {desktopDirectory} from './desktop-downloads.mjs';
import {NEW_PRODUCT_STORAGE} from './new-product-research.mjs';

export async function desktopOfficialUrl(style, desktop) {
  if (!/^\d{6}$/.test(style)) return null;
  desktop ??= await desktopDirectory().catch(() => null);
  if (!desktop) return null;
  const files = [
    path.join(desktop, '남성용', 'index.json'),
    path.join(desktop, '여성용', '02-여성상품-상세-소구점후보.json')
  ];
  const sources = new Map();
  const prepared=await readFile(path.join(NEW_PRODUCT_STORAGE,'products',style+'.json'),'utf8').then(JSON.parse).catch(()=>null);
  for (const file of files) {
    const catalog = await readFile(file, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, ''))).catch(() => null);
    if (!Array.isArray(catalog?.products)) continue;
    for (const record of catalog.products) {
      if (record?.style !== style) continue;
      try {
        const url = new URL(record.sourceUrl || record.url);
        const id = url.searchParams.get('pno');
        if (url.origin === 'https://www.giordano.co.kr' && url.pathname === '/shop/detail.php' && /^[a-f0-9]{32}$/i.test(id || '')) {
          sources.set(id.toUpperCase(), url.href);
        }
      } catch {}
    }
  }
  if(prepared?.style===style&&prepared.imageScanComplete&&prepared.sourceUrl){
    try{const u=new URL(prepared.sourceUrl),id=u.searchParams.get('pno');if(u.origin==='https://www.giordano.co.kr'&&u.pathname==='/shop/detail.php'&&/^[a-f0-9]{32}$/i.test(id||''))sources.set(id.toUpperCase(),u.href);}catch{}
  }
  return sources.size === 1 ? sources.values().next().value : null;
}
