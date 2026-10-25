const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
export async function setAttributeCheckboxes(row,values,{label='소재',check=()=>{},requireAll=false,optionalValues=[],timeout=3000,bestEffort=false,onSkip=()=>{}}={}){
 const skipped=new Set();
 const skip=name=>{if(!skipped.has(name)){skipped.add(name);onSkip(label+' / '+name);}};
 const read=()=>row.getByRole('checkbox').evaluateAll(ns=>ns.map(n=>({id:n.id,name:(n.getAttribute('aria-label')||n.labels?.[0]?.textContent||n.parentElement.textContent).replace(/\s+/g,' ').trim(),checked:n.checked})));
 if(!await row.getByRole('checkbox').count()){if(bestEffort){for(const value of values)skip(value);return [];}if(requireAll&&values.length)throw Error(label+' 선택 항목이 없습니다.');return [];}
 const entries=await read(),wanted=new Set([...values,...optionalValues].map(normalize));
 if(requireAll||bestEffort)for(const value of values.map(normalize))if(!entries.some(e=>e.name===value)){if(bestEffort)skip(value);else throw Error('이 카테고리에 해당 속성 값이 없습니다: '+label+' / '+value);}
 const locate=async entry=>{
  const named=row.getByRole('checkbox',{name:entry.name,exact:true});
  if(await named.count()===1)return named;
  const identified=entry.id?row.locator('[id='+JSON.stringify(entry.id)+']'):null;
  if(identified&&await identified.count()===1)return identified;
  throw Error(label+' 선택 항목을 다시 확인해 주세요: '+entry.name);
 };
 // A framework rerender can replace or reorder inputs after each click.
 for(const entry of entries){
  check();try{const desired=wanted.has(entry.name),box=await locate(entry);
  if(await box.isChecked()===desired)continue;
  const id=await box.getAttribute('id'),target=id?row.locator('label[for='+JSON.stringify(id)+']'):null;
  if(await box.isVisible())await box.click({force:true,timeout});
  else if(target&&await target.count()===1)await target.click({timeout});
  else throw Error(label+' 선택 입력을 확인하지 못했습니다: '+entry.name);
  const deadline=Date.now()+timeout;let matched=false;
  while(Date.now()<deadline){
   check();const current=(await read()).find(e=>e.name===entry.name);
   if(current?.checked===desired){matched=true;break;}
   await new Promise(resolve=>setTimeout(resolve,80));
  }
  if(!matched)throw Error(label+' 선택 확인 실패: '+entry.name);
  }catch(error){check();if(!bestEffort||error.name==='AbortError')throw error;skip(entry.name);}
 }
 check();const actual=await read();
 for(const entry of actual)if(entry.checked!==wanted.has(entry.name)){if(bestEffort)skip(entry.name);else throw Error(label+' 선택 확인 실패: '+entry.name);}
 return actual.filter(e=>e.checked&&(!bestEffort||wanted.has(e.name)&&!skipped.has(e.name))).map(e=>e.name);
}
