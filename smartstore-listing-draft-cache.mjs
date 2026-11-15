import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PHOTO_WORK_VERSION} from './smartstore-photo-work.mjs';

const signature=info=>[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');

// Only the draft snapshot is cached. Product identity, colors and official image
// validation are evaluated by listingManifest on every request.
export function createListingDraftReader({read=readFile,inspect=stat}={}) {
  const entries = new Map();
  return async function readListingDraft(file) {
    const previous = entries.get(file);
    let before;
    try {
      before = signature(await inspect(file,{bigint:true}));
    } catch(error) {
      if(entries.get(file)===previous)entries.delete(file);
      if(error.code==='ENOENT')return null;
      throw error;
    }
    const cached = entries.get(file);
    if(cached?.signature===before)return cached.pending;

    const entry = {signature:before};
    entry.pending = (async()=>{
      const text = await read(file,'utf8');
      const after = signature(await inspect(file,{bigint:true}));
      if(before!==after)return readListingDraft(file);
      const draft = JSON.parse(text);
      const detailRevision = createHash('sha256').update(JSON.stringify(draft)+'|'+PHOTO_WORK_VERSION).digest('hex');
      return {draft,detailRevision};
    })().catch(error=>{
      if(entries.get(file)===entry)entries.delete(file);
      if(error.code==='ENOENT')return null;
      throw error;
    });
    entries.delete(file);
    entries.set(file,entry);
    while(entries.size>8)entries.delete(entries.keys().next().value);
    return entry.pending;
  };
}

export const readListingDraft=createListingDraftReader();
