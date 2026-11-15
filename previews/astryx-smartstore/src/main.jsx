import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';
import {ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, ExternalLink, Grip, Image, Images, Layers3, Monitor, Package, Pencil, Play, Search, ShieldCheck, SlidersHorizontal, Star, Store, X} from 'lucide-react';
import './styles.css';
import {LottePreview} from './lotte.jsx';

const steps=[
  {title:'상품 수집',description:'품번 · 공식 정보',icon:Search},
  {title:'사진 확인',description:'대표 · 색상 · 구도',icon:Images},
  {title:'등록 내용 검토',description:'상품명 · 옵션 · 상세',icon:Layers3},
  {title:'판매자 화면 준비',description:'로그인 · 복사등록',icon:Monitor},
  {title:'입력·업로드 시작',description:'진행 상태 · 결과',icon:Play},
];
const sortColors=(colors)=>[...new Set(colors)].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
const valueText=(value)=>Array.isArray(value)?value.join(', '):String(value||'확인 필요');

function App(){
  const [payload,setPayload]=useState(null),[photos,setPhotos]=useState([]);
  const [step,setStep]=useState(2),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [editor,setEditor]=useState(false),[notice,setNotice]=useState(''),[reviewed,setReviewed]=useState(false);
  const [headline,setHeadline]=useState(''),[template,setTemplate]=useState(1),[demo,setDemo]=useState('idle'),[elapsed,setElapsed]=useState(0);
  const request=useRef(0);
  async function loadProduct(style=''){
    const id=++request.current;setLoading(true);setError('');
    try{
      const response=await fetch('/preview-data'+(style?'?style='+encodeURIComponent(style):''));
      const data=await response.json();if(!response.ok)throw Error(data.error||'상품을 불러오지 못했어요.');
      if(id!==request.current)return;
      setPayload(data);setPhotos(data.photos);setQuery(data.product.style);setHeadline(data.product.name);
      setReviewed(false);setDemo('idle');setElapsed(0);setNotice('');
    }catch(e){if(id===request.current)setError(e.message);}
    finally{if(id===request.current)setLoading(false);}
  }
  useEffect(()=>{loadProduct();return()=>{request.current++;};},[]);
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(id);},[notice]);
  useEffect(()=>{
    if(demo!=='running')return;
    const start=Date.now();setElapsed(0);
    const id=setInterval(()=>{const seconds=Math.floor((Date.now()-start)/1000);setElapsed(seconds);if(seconds>=9){setDemo('done');clearInterval(id);}},200);
    return()=>clearInterval(id);
  },[demo]);
  const product=payload?.product,main=photos.find(p=>p.isMain);
  const colors=sortColors(product?.colors||[]),unknown=photos.filter(p=>p.angle==='확인 필요').length;
  const active=steps[step-1];
  return <Theme theme={neutralTheme} mode="light">
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="상품등록기 시안 홈"><span className="brand-mark"><Package size={21}/></span><span>상품등록기<small>SMARTSTORE WORKSPACE</small></span></a>
        <div className="header-right"><span className="workspace-channel"><span className="channel-dot"/>스마트스토어</span><Badge label="Astryx 시안" variant="neutral"/></div>
      </header>
      <main className="workspace">
        <div className="page-heading"><div><div className="eyebrow">PRODUCT REGISTRATION</div><h1>하나씩 확인하고, 편하게 등록하세요.</h1><p>상품 준비부터 업로드까지, 작업 순서대로 모았어요.</p></div><span className="preview-note"><ShieldCheck size={16}/>이 화면의 변경은 시안에만 반영돼요.</span></div>
        <nav className="step-nav" aria-label="상품등록 작업 순서">
          {steps.map((item,i)=><button key={item.title} className={'step-button '+(step===i+1?'active':'')} aria-current={step===i+1?'step':undefined} onClick={()=>setStep(i+1)}><span className="step-number">{i+1}</span><span className="step-label"><strong>{item.title}</strong><small>{item.description}</small></span>{i<4&&<ChevronRight className="step-chevron" size={17}/>}</button>)}
        </nav>
        <section className="product-bar" aria-label="현재 상품">
          <div className="product-bar-heading"><span className="product-icon"><Package size={22}/></span><div><span className="micro-label">현재 작업 상품</span><h2>{product?.rawName||'저장된 상품을 불러오는 중'}</h2></div></div>
          <form className="product-search" onSubmit={e=>{e.preventDefault();loadProduct(query);}}><TextInput label="품번" isLabelHidden value={query} onChange={value=>setQuery(value)} placeholder="품번 6자리"/><Button label="불러오기" icon={<Search size={16}/>} isLoading={loading} type="submit" variant="secondary"/></form>
        </section>
        {error&&<div role="alert" className="error-message">{error}</div>}
        <div className="workspace-columns">
          <section className="work-panel" aria-labelledby="section-title">
            <div className="section-heading"><div className="section-title"><span className="section-index">0{step}</span><div><h2 id="section-title">{active.title}</h2><p>{step===2?'대표사진을 확인하고, 색상과 구도를 한곳에서 정리하세요.':active.description}</p></div></div><Badge label={step===2?photos.length+'장 불러옴':'STEP '+step+' / 5'} variant="neutral"/></div>
            {step===1&&<div className="step-content collection-content"><div className="large-line-icon"><Search size={30}/></div><h3>준비해 둔 상품 자료부터 빠르게.</h3><p>위의 품번 검색으로 이 PC에 저장된 상품과 사진을 불러올 수 있어요.</p><dl className="info-list"><div><dt>품번</dt><dd>{product?.style||'—'}</dd></div><div><dt>공식 상품명</dt><dd>{product?.rawName||'—'}</dd></div><div><dt>소재</dt><dd>{valueText(product?.material)}</dd></div></dl>{product?.sourceUrl&&<a className="text-link" href={product.sourceUrl} target="_blank" rel="noreferrer">공식 상품 정보 보기<ExternalLink size={14}/></a>}<div className="quiet-note"><CircleHelp size={16}/>시안에서는 새 수집 없이 저장된 자료를 표시해요.</div></div>}
            {step===2&&<>
              <div className="photo-action"><div><span className="action-icon"><SlidersHorizontal size={23}/></span><div><strong>사진 정리는 여기에서</strong><p>색상 변경 · 구도 선택 · 대표사진 · 순서 이동</p></div></div><Button className="primary-button edit-photos" label="사진 색상·구도 수정" icon={<Pencil size={17}/>} size="lg" onClick={()=>setEditor(true)} isDisabled={!photos.length||loading}/></div>
              <div className="photo-overview">
                <div className="main-photo-column"><div className="photo-label"><span><Star size={16} fill="currentColor"/>대표사진</span><small>1장</small></div><button className="main-photo" onClick={()=>setEditor(true)} aria-label="대표사진 선택 및 수정" disabled={!photos.length}>{main?<img src={main.url} alt="저장된 대표사진"/>:<div className="empty-photo"><Image size={32}/><span>대표사진을 선택해 주세요</span></div>}<span className="photo-edit-chip"><Pencil size={13}/>대표 선택</span></button><div className="photo-caption">{main?main.color:'직접 선택한 한 장을 사용해요.'}</div></div>
                <div className="color-photos"><div className="photo-label"><span>색상별 사진</span><small>{photos.length}장</small></div>{sortColors(photos.map(p=>p.color)).map(color=><div className="color-row" key={color}><div className="color-row-header"><strong>{color}</strong><span>{photos.filter(p=>p.color===color).length}장</span></div><div className="color-thumbnails">{photos.filter(p=>p.color===color).map((photo,index)=><button className={'thumbnail '+(photo.isMain?'is-main':'')} key={photo.id} onClick={()=>setEditor(true)} aria-label={color+' '+(index+1)+'번 사진 수정'}><img src={photo.url} alt={color+' 상품사진 '+(index+1)}/>{photo.isMain&&<span className="mini-star"><Star size={11} fill="currentColor"/></span>}<span className="thumbnail-number">{index+1}</span></button>)}</div></div>)}</div>
              </div>
              <div className="photo-bottom-note"><Image size={16}/><span>사진 전체와 원본 비율을 그대로 보여드려요.</span><span className="photo-count">{colors.length}개 색상</span></div>
            </>}
            {step===3&&<div className="step-content review-content"><TextInput label="상품명" value={headline} onChange={value=>setHeadline(value)} description="표시된 저장 자료를 검토해 주세요. 시안에서는 검색어 최적화를 실행하지 않아요."/><div className="field-label">색상 옵션</div><div className="pill-row">{colors.map(c=><span className="option-pill" key={c}>{c}</span>)}</div><div className="field-label">사이즈 옵션</div><div className="pill-row">{(product?.sizes||[]).map(s=><span className="option-pill" key={String(s)}>{valueText(s)}</span>)}</div><div className="field-label">상세 템플릿</div><div className="template-options">{[1,2].map(n=><button key={n} aria-pressed={template===n} className={'template-option '+(template===n?'selected':'')} onClick={()=>setTemplate(n)}><Layers3 size={22}/><strong>템플릿 {n}</strong><span>{template===n?<Check size={18}/>:'선택'}</span></button>)}</div><dl className="info-list"><div><dt>소재</dt><dd>{valueText(product?.material)}</dd></div></dl><div className="quiet-note"><CircleHelp size={16}/>템플릿 선택 디자인 시안이에요. 기존 상세페이지 구성은 유지돼요.</div></div>}
            {step===4&&<div className="step-content seller-content"><div className="large-line-icon"><Monitor size={30}/></div><h3>입력할 판매자 화면을 준비해 주세요.</h3><p>로그인한 뒤 사용할 복사등록 화면을 한 개 열어 두면 돼요.</p><div className="seller-check"><span className="seller-check-number">1</span><div><strong>스마트스토어 로그인</strong><p>사용할 판매자 계정 확인</p></div><Badge label="연결 전" variant="neutral"/></div><div className="seller-check"><span className="seller-check-number">2</span><div><strong>복사등록 화면 확인</strong><p>입력 대상 상품과 카테고리 확인</p></div><Badge label="확인 전" variant="neutral"/></div><div className="quiet-note"><ShieldCheck size={16}/>이 시안은 판매자센터에 접속하거나 내용을 입력하지 않아요.</div></div>}
            {step===5&&<div className="step-content upload-content"><div className={'upload-symbol '+(demo==='running'?'running':'')}><Play size={28} fill="currentColor"/></div><Badge label="진행 화면 체험" variant="neutral"/><h3>{demo==='running'?'작업 상태를 한눈에.':demo==='done'?'진행 화면 체험을 마쳤어요.':demo==='stopped'?'체험을 중지했어요.':'입력부터 결과까지, 놓치지 않게.'}</h3><p>현재 단계와 경과 시간이 버튼을 누르는 순간부터 표시돼요.</p><div className="demo-progress"><div className="demo-progress-top"><strong>{demo==='running'?['준비 자료 확인','사진·상세 준비','입력·업로드 진행'][Math.min(2,Math.floor(elapsed/3))]:demo==='done'?'체험 완료':'진행 대기'}</strong><span><Clock3 size={14}/>{elapsed}초</span></div><div className="progress-track"><span style={{width:(demo==='done'?100:elapsed/9*100)+'%'}}/></div></div><Button className="primary-button" label={demo==='running'?'체험 중지':'입력·업로드 진행 체험'} icon={demo==='running'?<X size={17}/>:<Play size={17}/>} size="lg" onClick={()=>{if(demo==='running')setDemo('stopped');else{setElapsed(0);setDemo('running');}}}/><p className="demo-disclaimer">시뮬레이션이에요. 실제 상품 입력·업로드는 실행되지 않아요.</p></div>}
            <div className="step-footer"><Button variant="ghost" label="이전 단계" icon={<ArrowLeft size={16}/>} isDisabled={step===1} onClick={()=>setStep(step-1)}/>{step<5?<Button variant="secondary" label={step===2?'사진 확인 후 다음 단계':'다음 단계'} endContent={<ArrowRight size={16}/>} onClick={()=>{if(step===2)setReviewed(true);setStep(step+1);}}/>:<Button variant="secondary" label="사진 다시 확인" onClick={()=>setStep(2)}/>}</div>
          </section>
          <aside className="summary-panel"><div className="summary-heading"><span>작업 요약</span><span className="style-number">{product?.style||'—'}</span></div><h3>등록 전, 준비 상태</h3><p className="summary-intro">확인할 항목을 모아뒀어요.</p><div className="summary-rows"><SummaryRow icon={Package} label="상품 자료" value={product?'불러옴':'대기'} done={!!product}/><SummaryRow icon={Star} label="대표사진" value={main?'1장 선택됨':'선택 필요'} done={!!main}/><SummaryRow icon={Images} label="색상별 사진" value={photos.length+'장'} done={photos.length>0}/><SummaryRow icon={CheckCheck} label="사진 확인" value={reviewed?'확인함':'검토 전'} done={reviewed}/><SummaryRow icon={Monitor} label="판매자 화면" value="연결 전"/></div><div className="summary-tip"><SlidersHorizontal size={20}/><strong>사진부터 살펴볼까요?</strong><p>잘못 묶인 색상이나 구도를 직접 수정하고, 대표사진도 바꿀 수 있어요.</p><button onClick={()=>{setStep(2);setEditor(true);}} disabled={!photos.length}>사진 수정 열기<ArrowRight size={15}/></button></div><div className="summary-meta"><span><ShieldCheck size={14}/>로컬 자료로 보는 디자인 시안</span><span>실제 등록 상태와는 별개예요.</span></div></aside>
        </div>
        <footer className="workspace-footer"><span>Astryx · SmartStore preview</span><span>기존 상품등록기와 롯데ON 기능은 유지돼요.</span></footer>
      </main>
      {editor&&product&&<PhotoEditor photos={photos} colors={colors} style={product.style} onCancel={()=>setEditor(false)} onApply={result=>{setPhotos(result);setReviewed(false);setEditor(false);setNotice('사진 구성을 시안에 반영했어요.');}}/>}
      {notice&&<div className="toast" role="status"><Check size={18}/>{notice}</div>}
    </div>
  </Theme>;
}

function SummaryRow({icon:Icon,label,value,done}){return <div className="summary-row"><Icon size={17}/><span>{label}</span><strong className={done?'ready':''}>{value}</strong></div>;}

function PhotoEditor({photos,colors,style,onCancel,onApply}){
  const dialog=useRef(null),lastChecked=useRef(null),dragged=useRef(null);
  const [draft,setDraft]=useState(()=>photos.map(p=>({...p,displayGroup:p.color}))),[selected,setSelected]=useState(photos[0]?.id),[checked,setChecked]=useState([]);
  const [message,setMessage]=useState('');
  useEffect(()=>{dialog.current.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
  const current=draft.find(p=>p.id===selected),groups=sortColors(draft.map(p=>p.displayGroup));
  const patch=(id,values)=>setDraft(items=>items.map(item=>item.id===id?{...item,...values}:item));
  function chooseColor(color){setDraft(items=>items.map(item=>checked.includes(item.id)?{...item,color}:item));setMessage(checked.length+'장 색상을 변경했어요. 사진 위치는 유지돼요.');}
  function toggleChecked(id,shift){
    const i=draft.findIndex(p=>p.id===id),from=draft.findIndex(p=>p.id===lastChecked.current);
    setChecked(prev=>shift&&from>=0?[...new Set([...prev,...draft.slice(Math.min(i,from),Math.max(i,from)+1).map(p=>p.id)])]:prev.includes(id)?prev.filter(v=>v!==id):[...prev,id]);lastChecked.current=id;
  }
  function reorder(id,target){
    setDraft(items=>{const source=items.find(p=>p.id===id),destination=items.find(p=>p.id===target);if(!source||!destination||source.color!==destination.color||source.displayGroup!==destination.displayGroup||id===target)return items;const result=[...items],from=result.indexOf(source),to=result.indexOf(destination);result.splice(from,1);result.splice(to,0,source);return result;});
  }
  function move(delta){if(!current)return;const group=draft.filter(p=>p.displayGroup===current.displayGroup&&p.color===current.color),index=group.findIndex(p=>p.id===selected),target=group[index+delta];if(target)reorder(selected,target.id);}
  return <dialog className="photo-dialog" ref={dialog} onCancel={e=>{e.preventDefault();onCancel();}} aria-labelledby="photo-dialog-title"><div className="dialog-heading"><div><span className="eyebrow">PHOTO WORKSPACE · {style}</span><h2 id="photo-dialog-title">사진 색상·구도 수정</h2><p>사진은 끌어서 순서를 바꾸고, 여러 장의 색상은 체크해서 변경하세요.</p></div><Button label="닫기" variant="ghost" icon={<X size={21}/>} onClick={onCancel}/></div><div className="batch-toolbar"><span><strong>{checked.length}</strong>장 체크</span><div className="batch-colors">{colors.map(color=><button key={color} disabled={!checked.length} onClick={()=>chooseColor(color)}>{color}</button>)}</div><Button label="색상별 정렬" variant="secondary" onClick={()=>{setDraft(items=>items.map(p=>({...p,displayGroup:p.color})));setMessage('변경한 색상별로 사진을 모았어요.');}}/></div><div className="editor-layout"><div className="editor-photos">{groups.map(group=><section className="editor-color-group" key={group}><h3>{group}<span>{draft.filter(p=>p.displayGroup===group).length}장</span></h3><div className="editor-grid">{draft.filter(p=>p.displayGroup===group).map((photo,i)=><div className={'editor-photo '+(selected===photo.id?'selected':'')} key={photo.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();reorder(dragged.current,photo.id);dragged.current=null;}}><label className="photo-checkbox"><input type="checkbox" checked={checked.includes(photo.id)} onChange={()=>{}} onClick={e=>toggleChecked(photo.id,e.shiftKey)} aria-label={group+' '+(i+1)+'번 색상 변경 체크'}/></label><button className="editor-photo-image" draggable onDragStart={e=>{dragged.current=photo.id;e.dataTransfer.setData('text/plain',photo.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{dragged.current=null;}} onClick={()=>setSelected(photo.id)} aria-label={group+' '+(i+1)+'번 사진 선택'} aria-pressed={selected===photo.id}><img src={photo.url} alt={photo.color+' 상품사진'}/>{photo.isMain&&<span className="main-ribbon"><Star size={12} fill="currentColor"/>대표</span>}</button><div className="editor-photo-caption"><span><Grip size={14}/>{i+1}</span><strong>{photo.angle}</strong></div>{photo.color!==photo.displayGroup&&<small className="changed-color">→ {photo.color}</small>}</div>)}</div></section>)}</div><aside className="photo-inspector">{current&&<><div className="inspector-heading">선택한 사진<Badge label={current.isMain?'대표사진':'상품사진'} variant={current.isMain?'success':'neutral'}/></div><img className="inspector-preview" src={current.url} alt="선택한 상품사진 확대"/><label className="select-field">색상<select aria-label="색상" value={current.color} onChange={e=>patch(current.id,{color:e.target.value})}>{sortColors([...colors,current.color]).map(c=><option key={c}>{c}</option>)}</select></label><label className="select-field">구도<select aria-label="구도" value={current.angle} onChange={e=>patch(current.id,{angle:e.target.value,roleMode:'manual'})}>{['확인 필요','정면','옆면','뒷면','디테일','케어라벨'].map(v=><option key={v}>{v}</option>)}</select></label><Button className={current.isMain?'':'primary-button'} label={current.isMain?'대표사진으로 선택됨':'대표사진으로 선택'} icon={<Star size={16}/>} variant={current.isMain?'secondary':'primary'} onClick={()=>setDraft(items=>items.map(p=>({...p,isMain:p.id===current.id})))}/><div className="photo-move-buttons"><Button label="앞으로" variant="secondary" icon={<ArrowLeft size={15}/>} onClick={()=>move(-1)}/><Button label="뒤로" variant="secondary" endContent={<ArrowRight size={15}/>} onClick={()=>move(1)}/></div><p className="inspector-note">같은 색상 안에서 순서를 바꿀 수 있어요. 직접 선택한 구도는 이동해도 유지돼요.</p></>}</aside></div><div className="dialog-footer"><span role="status">{message||'원본 사진은 그대로 보존돼요.'}</span><div><Button label="취소" variant="secondary" onClick={onCancel}/><Button className="primary-button" label="시안에 반영" icon={<Check size={17}/>} onClick={()=>onApply(draft.map(({displayGroup,...p})=>p))}/></div></div></dialog>;
}

createRoot(document.getElementById('root')).render(location.pathname==='/lotteon'?<LottePreview/>:<App/>);
