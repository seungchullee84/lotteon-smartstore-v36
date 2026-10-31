import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Optional human-checked measurements; never infer them from clothing sizes.
export async function verifiedSizeSummary(product,folder,dataRoot){
 let record;
 try{record=JSON.parse(await readFile(path.join(dataRoot,'smartstore-details',product.style,'size-summary.json'),'utf8'));}
 catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}
 if(record.version!==1||record.verified!==true||record.style!==product.style||record.sourceUrl!==product.sourceUrl||record.unit!=='cm')return null;
 if(!Array.isArray(record.sizes)||!record.sizes.length||record.sizes.length>12||record.sizes.some(s=>typeof s!=='string'||s.length>20||!product.sizes?.includes(s))||new Set(record.sizes).size!==record.sizes.length)return null;
 if(!Array.isArray(record.rows)||!record.rows.length||record.rows.length>8||record.rows.some(r=>typeof r.label!=='string'||!r.label||r.label.length>40||!Array.isArray(r.values)||r.values.length!==record.sizes.length||r.values.some(v=>!Number.isFinite(v)||v<=0||v>500)))return null;
 let bytes;try{bytes=await readFile(path.join(folder,'size.jpg'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(createHash('sha256').update(bytes).digest('hex')!==record.sourceImageHash)return null;
 return record;
}
