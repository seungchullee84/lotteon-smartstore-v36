import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';
import {ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, Clock3, ClipboardCheck, Expand, ExternalLink, FileText, Image, Images, Layers3, ListChecks, LoaderCircle, Maximize2, Monitor, Package, Pencil, Play, Rocket, Search, ShieldCheck, SlidersHorizontal, Sparkles, Star, Store, X} from 'lucide-react';
import './lotte.css';

const workflow=[['판매자 화면 준비','로그인 · 상품등록 화면',Monitor],['상품 수집·검토','기본정보 · 사진 · 옵션',Package],['입력 시작','검토 내용 · 진행 상태',Rocket]];
const reviewTabs=[['basic','기본정보',FileText],['images','사진·상세',Images],['options','옵션·분류',Layers3]];
const officialLabels={detail:'상품 상세',size:'사이즈표',check:'체크업',info:'정보고시'};
const currency=value=>value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value).toLocaleString('ko-KR')+'원':'확인 필요';
const colorOrder=colors=>[...colors].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));

function Dialog({title,kicker,children,onClose,footer,className=''}){
  const ref=useRef(null);
  useEffect(()=>{ref.current.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=before;};},[]);
  return <dialog ref={ref} className={'lp-dialog '+className} onCancel={event=>{event.preventDefault();onClose();}} aria-label={title}>
    <header className="lp-dialog-head"><div>{kicker&&<span className="lp-kicker">{kicker}</span>}<h2>{title}</h2></div><Button label="닫기" isIconOnly icon={<X size={20}/>} variant="ghost" onClick={onClose}/></header>
    <div className="lp-dialog-body">{children}</div>{footer&&<footer className="lp-dialog-footer">{footer}</footer>}
  </dialog>;
}

function StatusItem({icon:Icon,label,value,ready}){
  return <div className="lp-status-item"><Icon size={16}/><span>{label}</span><strong className={ready?'ready':''}>{value}</strong></div>;
}

export function LottePreview(){
  const [payload,setPayload]=useState(null),[form,setForm]=useState({}),[query,setQuery]=useState('');
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[step,setStep]=useState(2),[tab,setTab]=useState('basic');
  const [reviewed,setReviewed]=useState({basic:false,images:false,options:false}),[selectedColors,setSelectedColors]=useState([]),[selectedSizes,setSelectedSizes]=useState([]);
  const [stocks,setStocks]=useState({}),[excluded,setExcluded]=useState([]),[modal,setModal]=useState(null),[message,setMessage]=useState('');
  const [editCategory,setEditCategory]=useState(false),[category,setCategory]=useState({});
  const [demo,setDemo]=useState('idle'),[elapsed,setElapsed]=useState(0),[sellerChecked,setSellerChecked]=useState(false);
  const request=useRef(0),formPanel=useRef(null);
  async function load(style=''){
    const id=++request.current;setLoading(true);setError('');
    try{
      const response=await fetch('/lotte-preview-data'+(style?'?style='+encodeURIComponent(style):''));
      const data=await response.json();if(!response.ok)throw Error(data.error||'저장된 자료를 불러오지 못했어요.');
      if(id!==request.current)return;
      setPayload(data);setForm({...data.product});setQuery(data.product.style);setCategory({...data.product.category});
      setSelectedColors(data.product.colors);setSelectedSizes(data.product.sizes);setStocks({});setExcluded([]);
      setReviewed({basic:false,images:false,options:false});setDemo('idle');setElapsed(0);setEditCategory(false);setModal(null);setMessage('');
    }catch(e){if(id===request.current)setError(e.message);}
    finally{if(id===request.current)setLoading(false);}
  }
  useEffect(()=>{document.title='롯데ON 상품등록기 · Astryx 시안';load();return()=>{request.current++;};},[]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),4200);return()=>clearTimeout(timer);},[message]);
  useEffect(()=>{
    if(demo!=='running')return;
    const start=Date.now();setElapsed(0);
    const timer=setInterval(()=>{const value=Math.floor((Date.now()-start)/1000);setElapsed(value);if(value>=10){setDemo('done');clearInterval(timer);}},200);
    return()=>clearInterval(timer);
  },[demo]);
  const product=payload?.product,images=payload?.images||{};
  const extras=['extra1','extra2'].filter(key=>images[key]&&!excluded.includes(key));
  const combinations=useMemo(()=>selectedColors.flatMap(color=>selectedSizes.map(size=>({color,size,key:JSON.stringify([color,size])}))),[selectedColors,selectedSizes]);
  const complete=Object.values(reviewed).filter(Boolean).length;
  const dirty=(section)=>setReviewed(prev=>({...prev,[section]:false}));
  const setField=(key,value)=>{setForm(prev=>({...prev,[key]:value}));dirty('basic');};
  const changeTab=value=>{setTab(value);setStep(2);};
  const markReviewed=()=>{setReviewed(prev=>({...prev,[tab]:true}));const index=reviewTabs.findIndex(item=>item[0]===tab);if(index<2)setTab(reviewTabs[index+1][0]);else setStep(3);};
  const toggleOption=(value,selected,setter)=>{setter(selected.includes(value)?selected.filter(x=>x!==value):[...selected,value]);dirty('options');};
  const channelNames=[category.channelMajor||product?.channelPath?.[0]?.name,category.channelMiddle,category.channelSmall,category.channelDetail].filter(Boolean);

  return <Theme theme={neutralTheme} mode="light"><div className="lotte-preview">
    <header className="lp-header"><a className="lp-brand" href="/lotteon"><span className="lp-brand-icon"><Store size={21}/></span><span><strong>롯데<span className="lp-on">ON</span></strong><span className="lp-brand-divider"/>상품등록기</span></a><div className="lp-header-actions"><a href="/" className="lp-other-channel">스마트스토어 시안<ArrowRight size={14}/></a><Badge label="Astryx 시안" variant="neutral"/></div></header>
    <main className="lp-workspace">
      <div className="lp-title-row"><div><span className="lp-kicker">LOTTEON WORKSPACE</span><h1>수집한 상품, 한눈에 검토하세요.</h1><p>정보와 이미지를 살펴보고, 준비가 끝나면 입력을 시작해요.</p></div><span className="lp-preview-label"><ShieldCheck size={16}/>변경은 이 시안 안에만 반영돼요.</span></div>
      <nav className="lp-workflow" aria-label="롯데ON 작업 순서">{workflow.map(([title,description,Icon],index)=><button key={title} className={step===index+1?'active':''} aria-current={step===index+1?'step':undefined} onClick={()=>setStep(index+1)}><span className="lp-step-number">{index+1}</span><span><strong>{title}</strong><small>{description}</small></span><Icon className="lp-step-icon" size={21}/>{index<2&&<ChevronRight className="lp-step-chevron" size={17}/>}</button>)}</nav>
      <section className="lp-collection" aria-label="상품 불러오기"><div className="lp-collection-copy"><span className="lp-collection-icon"><Search size={20}/></span><div><strong>어떤 상품을 준비할까요?</strong><p>품번으로 저장된 공식몰 자료를 불러오세요.</p></div></div><form onSubmit={e=>{e.preventDefault();load(query);}}><TextInput label="롯데ON 품번" isLabelHidden value={query} onChange={value=>setQuery(value)} placeholder="품번 6자리"/><Button className="lp-primary" label="상품 불러오기" icon={<Search size={16}/>} type="submit" isLoading={loading}/></form></section>
      {error&&<div className="lp-error" role="alert">{error}</div>}
      <div className="lp-content-grid">
        <aside className="lp-product-column">
          <section className="lp-card lp-photo-card"><div className="lp-card-heading"><span><Star size={15} fill="currentColor"/>대표이미지</span><span className="lp-dimension">정사각형 배치</span></div><button className="lp-main-image" onClick={()=>setModal({type:'image',role:'main',title:'대표이미지 원본'})} disabled={!images.main} aria-label="대표이미지 원본 크게 보기">{images.main?<img src={images.main.url} alt={(product?.rawName||'현재 상품')+' 공식몰 대표사진'}/>:<div className="lp-image-empty"><Image size={30}/><span>저장된 사진이 없어요</span></div>}<span className="lp-expand"><Expand size={15}/></span></button><div className="lp-product-title"><span className="lp-style">STYLE NO. {product?.style||'—'}</span><h2>{product?.rawName||'상품을 불러오는 중이에요.'}</h2><span className="lp-price">{currency(form.consumerPrice)}<small>공식몰 소비자가</small></span></div><div className="lp-image-tools"><Button label="배경 늘리기·합성" className="lp-photo-primary" icon={<Sparkles size={16}/>} variant="secondary" onClick={()=>setModal({type:'background'})} isDisabled={!images.main}/><Button label="1500×1500 배치 확인" icon={<Maximize2 size={15}/>} variant="ghost" onClick={()=>setModal({type:'image',role:'main',title:'대표이미지 정사각형 배치',square:true})} isDisabled={!images.main}/></div><div className="lp-extra-heading"><strong>추가이미지</strong><span>{extras.length} / 2장</span></div><div className="lp-extra-grid">{['extra1','extra2'].map((role,index)=><div className={'lp-extra '+(excluded.includes(role)?'excluded':'')} key={role}>{images[role]?<><button className="lp-extra-photo" aria-label={'추가이미지 '+(index+1)+' 크게 보기'} onClick={()=>setModal({type:'image',role,title:'추가이미지 '+(index+1)})}><img src={images[role].url} alt={'공식몰 추가이미지 '+(index+1)}/></button><div><span>추가 {index+1}</span><button onClick={()=>{setExcluded(prev=>prev.includes(role)?prev.filter(x=>x!==role):[...prev,role]);dirty('images');}} aria-label={'추가이미지 '+(index+1)+(excluded.includes(role)?' 다시 포함':' 제외')}>{excluded.includes(role)?'다시 포함':<X size={13}/>}</button></div></>:<div className="lp-extra-empty"><Image size={22}/><span>사진 없음</span></div>}</div>)}</div><p className="lp-photo-source"><ShieldCheck size={13}/>저장된 공식몰 원본 · 전체 비율 유지</p></section>
          <section className="lp-source-card"><FileText size={19}/><div><strong>근거는 공식 자료에서</strong><p>상품 상세와 정보고시 원본을 나란히 확인할 수 있어요.</p><button onClick={()=>changeTab('images')}>공식 원본 보기<ArrowRight size={14}/></button></div></section>
        </aside>

        <section className="lp-review-card lp-card" ref={formPanel}>
          <div className="lp-review-heading"><div><span className="lp-kicker">{step===1?'SELLER CENTER':step===2?'PRODUCT REVIEW':'READY TO START'}</span><h2>{step===1?'판매자 화면 준비':step===2?'상품 정보 검토':'입력 전 마지막 확인'}</h2></div><Badge label={step===2?complete+' / 3 검토':step===1?'연결 전':'시안 체험'} variant="neutral"/></div>
          {step===2&&<nav className="lp-review-tabs" aria-label="검토 항목">{reviewTabs.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} aria-pressed={tab===key} onClick={()=>setTab(key)}><Icon size={16}/><span>{label}</span>{reviewed[key]&&<Check size={14}/>}</button>)}</nav>}
          <div className="lp-review-body">
            {step===1&&<div className="lp-seller"><div className="lp-feature-icon"><Monitor size={29}/></div><h3>입력할 상품등록 화면을 준비해요.</h3><p>롯데 파트너포탈에서 로그인하고, 온라인 상품등록 화면을 열어 두세요.</p><ol className="lp-seller-path"><li><span>01</span><div><strong>파트너포탈 로그인</strong><p>사용할 계정과 점포 확인</p></div></li><li><span>02</span><div><strong>온라인 채널연계 → 상품 관리</strong><p>가격관리와 구분해 상품등록으로 진입</p></div></li><li><span>03</span><div><strong>상품등록 화면 확인</strong><p>입력할 화면 한 개를 확인</p></div></li></ol><label className="lp-check-line"><input type="checkbox" checked={sellerChecked} onChange={e=>setSellerChecked(e.target.checked)}/><span>화면 준비 체크 표시 체험</span></label><div className="lp-note"><CircleHelp size={16}/><span>시안에서는 판매자센터를 연결하지 않아요. 위 체크는 화면 구성 확인용이에요.</span></div><Button className="lp-primary" label="상품 검토로 이동" endContent={<ArrowRight size={16}/>} onClick={()=>setStep(2)}/></div>}
            {step===2&&tab==='basic'&&<>
              <div className="lp-section-label"><strong>기본정보</strong><span>저장된 자료를 바탕으로 수정할 수 있어요.</span></div>
              <div className="lp-fields"><div className="lp-field-full"><TextInput label="상품명" value={form.name||''} onChange={value=>setField('name',value)}/></div><label className="lp-select-label">성별<select aria-label="성별" value={form.gender||''} onChange={e=>setField('gender',e.target.value)}><option value="">확인 필요</option><option value="여성">여성</option><option value="남성">남성</option><option value="남녀공용">남녀공용</option></select></label><TextInput label="공식몰 소비자가 (원)" value={String(form.consumerPrice??'')} onChange={value=>setField('consumerPrice',value.replace(/[^0-9]/g,''))} inputMode="numeric"/></div>
              <div className="lp-section-label lp-divided"><strong>소재와 관리</strong><button onClick={()=>setModal({type:'image',role:'info',title:'공식몰 정보고시 원본'})} disabled={!images.info}>정보고시 원본 확인<ExternalLink size={13}/></button></div>
              <div className="lp-fields"><label className="lp-textarea-label lp-field-full">제품 소재<textarea aria-label="제품 소재" value={form.material||''} onChange={e=>setField('material',e.target.value)} rows={3}/></label><TextInput label="제조국" value={form.country||''} onChange={value=>setField('country',value)}/><TextInput label="제조연월" value={form.manufactured||''} onChange={value=>setField('manufactured',value)} placeholder="YYYY-MM"/><label className="lp-textarea-label lp-field-full">세탁방법<textarea aria-label="세탁방법" value={form.washing||''} onChange={e=>setField('washing',e.target.value)} rows={2}/></label></div>
              <div className="lp-section-label lp-divided"><strong>검색키워드</strong><span className={(form.keywords||'').length>40?'lp-over-limit':''}>{(form.keywords||'').length} / 40자</span></div><TextInput label="검색키워드" isLabelHidden value={form.keywords||''} onChange={value=>setField('keywords',value)}/><p className="lp-field-help">쉼표 포함 40자 이내 · 현재 상품과 관련된 단어를 사용해요.</p>
              {product?.sourceUrl&&<a className="lp-official-link" href={product.sourceUrl} target="_blank" rel="noreferrer">공식몰 상품 정보 보기<ExternalLink size={14}/></a>}
            </>}
            {step===2&&tab==='images'&&<>
              <div className="lp-section-label"><strong>공식몰 상세 원본</strong><span>사진을 눌러 크게 확인하세요.</span></div><div className="lp-official-grid">{Object.entries(officialLabels).map(([role,label],i)=><button className="lp-official-card" key={role} disabled={!images[role]} onClick={()=>setModal({type:'image',role,title:'공식몰 '+label+' 원본'})}><div className={'lp-official-crop '+(role==='detail'?'detail':'')}>{images[role]?<img src={images[role].url} alt={'공식몰 '+label} loading="lazy"/>:<div className="lp-image-empty"><Image size={25}/><span>원본 없음</span></div>}<span><Expand size={14}/></span></div><div className="lp-official-card-label"><span><small>0{i+1}</small><strong>{label}</strong></span><ChevronRight size={16}/></div></button>)}</div><div className="lp-note"><ShieldCheck size={17}/><span>저장된 공식 상세와 사이즈·체크업·정보고시 원본이에요. 시안에서는 원본을 새로 만들거나 변경하지 않아요.</span></div><div className="lp-image-checks"><StatusItem icon={Star} label="대표이미지" value={images.main?'원본 있음':'확인 필요'} ready={!!images.main}/><StatusItem icon={Images} label="추가이미지" value={extras.length+'장 포함'} ready={extras.length>0}/><StatusItem icon={FileText} label="공식 상세 원본" value={images.detail?'원본 있음':'확인 필요'} ready={!!images.detail}/></div>
            </>}
            {step===2&&tab==='options'&&<>
              <div className="lp-section-label"><strong>판매 옵션</strong><span>{selectedColors.length}색상 × {selectedSizes.length}사이즈</span></div><span className="lp-option-label">색상</span><div className="lp-option-chips">{colorOrder(product?.colors||[]).map(color=><button key={color} aria-pressed={selectedColors.includes(color)} onClick={()=>toggleOption(color,selectedColors,setSelectedColors)}><span>{selectedColors.includes(color)&&<Check size={12}/>}</span>{color}</button>)}</div><span className="lp-option-label">사이즈</span><div className="lp-option-chips lp-size-chips">{(product?.sizes||[]).map(size=><button key={size} aria-pressed={selectedSizes.includes(size)} onClick={()=>toggleOption(size,selectedSizes,setSelectedSizes)}><span>{selectedSizes.includes(size)&&<Check size={12}/>}</span>{size}</button>)}</div><div className="lp-option-total"><Layers3 size={18}/><span>선택한 옵션 조합</span><strong>{combinations.length}<small>개</small></strong></div>
              <div className="lp-section-label lp-divided"><strong>상품분류</strong><Button label={editCategory?'분류 수정 닫기':'분류 수정'} icon={<Pencil size={14}/>} variant="ghost" onClick={()=>setEditCategory(!editCategory)}/></div><div className="lp-category-path"><span>1차 공통분류</span><p>{[category.commonMajor,category.commonMiddle,category.commonSmall].filter(Boolean).join(' → ')||'저장된 분류 없음'}</p></div><div className="lp-category-path"><span>2차 채널분류</span><p>{channelNames.join(' → ')||'저장된 분류 없음'}</p></div>{editCategory&&<div className="lp-fields lp-category-fields">{[['commonMiddle','공통 중분류'],['commonSmall','공통 소분류'],['channelMiddle','채널 중분류'],['channelSmall','채널 소분류']].map(([key,label])=><TextInput key={key} label={label} value={category[key]||''} onChange={value=>{setCategory(prev=>({...prev,[key]:value}));dirty('options');}}/>)}</div>}<p className="lp-field-help">저장된 분류를 표시해요. 판매처에서의 실제 선택 결과는 별도 확인이 필요해요.</p>
              <details className="lp-inventory"><summary>입력할 옵션 재고 확인<span>{combinations.length}개 조합<ChevronRight size={14}/></span></summary><p>등록 입력값을 편집하는 시안이에요. 현재 판매 중인 재고를 조회한 값은 아니에요.</p><div className="lp-option-table-wrap"><table><thead><tr><th>색상</th><th>사이즈</th><th>입력 재고</th></tr></thead><tbody>{combinations.map(({color,size,key})=><tr key={key}><td>{color}</td><td>{size}</td><td><input aria-label={color+' '+size+' 입력 재고'} type="number" min="0" value={stocks[key]??10} onChange={e=>{setStocks(prev=>({...prev,[key]:e.target.value}));dirty('options');}}/></td></tr>)}</tbody></table></div></details>
            </>}
            {step===3&&<div className="lp-start"><div className="lp-feature-icon"><ClipboardCheck size={29}/></div><h3>확인한 내용으로 입력할 준비.</h3><p>필요한 항목을 다시 살펴보고 진행 화면을 체험해 보세요.</p><div className="lp-final-checks">{reviewTabs.map(([key,label,Icon])=><button key={key} onClick={()=>changeTab(key)}><Icon size={18}/><span>{label}</span><strong className={reviewed[key]?'done':''}>{reviewed[key]?'확인했어요':'검토 전'}</strong><ChevronRight size={15}/></button>)}</div><div className="lp-start-summary"><div><span>품번</span><strong>{product?.style||'—'}</strong></div><div><span>추가이미지</span><strong>{extras.length}장</strong></div><div><span>옵션 조합</span><strong>{combinations.length}개</strong></div></div><div className="lp-note"><CircleHelp size={17}/><span>입력 진행 표시는 시뮬레이션이에요. 상품 입력·임시저장·최종등록은 실행되지 않아요.</span></div><Button label="입력 진행 화면 체험" className="lp-primary lp-start-demo" icon={<Play size={17}/>} size="lg" onClick={()=>{setModal({type:'progress'});setDemo('running');setElapsed(0);}} isDisabled={!product}/></div>}
          </div>
          {step===2&&<footer className="lp-review-footer"><span><ShieldCheck size={15}/>검토한 내용은 시안에만 반영돼요.</span><Button label={tab==='options'?'검토 완료 · 다음 단계':'확인하고 다음 항목'} icon={<Check size={16}/>} variant="secondary" onClick={markReviewed} isDisabled={!product||loading}/></footer>}
        </section>
      </div>
      <footer className="lp-actionbar"><div className="lp-action-status"><span className="lp-action-icon"><ListChecks size={21}/></span><div><strong>{complete===3?'세 항목을 모두 살펴봤어요.':'입력 전, 세 항목을 확인해 주세요.'}</strong><span>기본정보 · 사진·상세 · 옵션·분류 <b>{complete}/3</b></span></div></div><div className="lp-action-buttons"><button className="lp-reset-view" onClick={()=>{setStep(2);setTab('basic');}}>검토 화면으로</button><Button className="lp-primary lp-input-button" label="검토한 내용으로 입력 시작" endContent={<ArrowRight size={17}/>} size="lg" onClick={()=>setStep(3)} isDisabled={!product||loading}/></div></footer>
      <div className="lp-bottom-note"><span>Astryx · LOTTEON preview</span><span>기존 등록기의 자료와 판매처 입력에는 영향을 주지 않아요.</span></div>
    </main>

    {modal?.type==='image'&&<Dialog title={modal.title} kicker={'OFFICIAL SOURCE · '+(product?.style||'')} onClose={()=>setModal(null)} className="lp-image-dialog" footer={<><span>저장된 원본 · 상품 전체 비율 유지</span><Button label="확인" variant="secondary" onClick={()=>setModal(null)}/></>}><div className={'lp-original-image '+(modal.square?'square':'')}>{images[modal.role]?<img src={images[modal.role].url} alt={modal.title}/>:<p>저장된 원본을 찾지 못했어요.</p>}</div>{modal.square&&<p className="lp-field-help">1500×1500 작업용 이미지의 배치 예시예요. 사진 크기와 원본 파일은 변경하지 않아요.</p>}</Dialog>}
    {modal?.type==='background'&&<Dialog title="대표이미지 배경 작업" kicker="IMAGE WORKSPACE" onClose={()=>setModal(null)} className="lp-background-dialog" footer={<><span>디자인 미리보기 · 합성 실행 전</span><Button label="확인했어요" className="lp-primary" onClick={()=>{setModal(null);setMessage('대표이미지 작업 화면을 확인했어요.');}}/></>}><div className="lp-background-layout"><div><span className="lp-sub-label">선택한 공식몰 원본</span><div className="lp-background-image"><img src={images.main?.url} alt="배경 작업 대상 공식몰 원본"/></div></div><div className="lp-background-copy"><span className="lp-feature-icon"><Sparkles size={24}/></span><h3>원본을 중심에,<br/>배경은 자연스럽게.</h3><p>인물과 옷, 색상과 비율을 그대로 유지하며 바깥 여백을 정리하는 작업이에요.</p><ul><li><Check size={15}/>원본과 결과를 나란히 비교</li><li><Check size={15}/>진행 단계와 경과 시간 표시</li><li><Check size={15}/>검수 사유와 회차별 결과 확인</li></ul><div className="lp-note"><CircleHelp size={16}/><span>이 시안은 화면 구성만 보여줘요. 이미지 생성이나 대표사진 교체는 실행하지 않아요.</span></div></div></div></Dialog>}
    {modal?.type==='progress'&&<Dialog title="입력 진행 화면 체험" kicker="PREVIEW ONLY" onClose={()=>setModal(null)} className="lp-progress-dialog" footer={<><span>{demo==='running'?'창을 닫아도 체험 시간은 이어져요.':'실제 판매처 입력은 실행되지 않았어요.'}</span><Button label={demo==='running'?'체험 중지':'닫기'} variant="secondary" onClick={()=>{if(demo==='running')setDemo('stopped');else setModal(null);}}/></>}><div className={'lp-demo-hero '+(demo==='running'?'running':'')}><Rocket size={29}/></div><h3>{demo==='running'?'입력 작업을 한눈에 확인해요.':demo==='done'?'진행 화면 체험을 마쳤어요.':'체험을 중지했어요.'}</h3><p className="lp-demo-caption">시뮬레이션 · 실제 상품등록은 실행되지 않아요.</p><div className="lp-demo-time"><Clock3 size={17}/><strong>{elapsed}</strong>초 경과</div><ol className="lp-demo-stages">{['검토 정보 확인','대표·추가이미지 준비','옵션·분류 확인','판매자 화면 입력','입력 결과 확인'].map((label,i)=>{const done=elapsed>=(i+1)*2,active=demo==='running'&&Math.floor(elapsed/2)===i;return <li key={label} className={done?'done':active?'active':''}><span>{done?<Check size={15}/>:active?<LoaderCircle size={15}/>:i+1}</span><strong>{label}</strong><small>{done?'체험 완료':active?'진행 중':'대기'}</small></li>;})}</ol></Dialog>}
    {demo==='running'&&modal?.type!=='progress'&&<button className="lp-demo-mini" onClick={()=>setModal({type:'progress'})}><Rocket size={18}/><span>입력 진행 체험 중 · {elapsed}초</span><ChevronRight size={15}/></button>}
    {message&&<div className="lp-toast" role="status"><Check size={18}/>{message}</div>}
  </div></Theme>;
}
