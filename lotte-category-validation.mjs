import {readFileSync,statSync} from 'node:fs';
import {commonFor} from './category-catalog.mjs';
import {isMensUnderwear,MENS_UNDERWEAR_CATEGORY} from './category.mjs';

const cache=new Map();
function data(name){
  try{
    const url=new URL('./data/'+name,import.meta.url),stamp=statSync(url).mtimeMs;
    if(cache.get(name)?.stamp===stamp)return cache.get(name).value;
    const value=JSON.parse(readFileSync(url,'utf8'));cache.set(name,{stamp,value});return value;
  }catch{return null;}
}
const compact=value=>String(value||'').replace(/\s/g,'');
const label=value=>compact(String(value||'').replace(/^[A-Z0-9]+\s*[:：]\s*/i,''));
const code=value=>String(value||'').match(/^([A-Z0-9]+)\s*[:：]/i)?.[1]||'';
// A supplied code and its label must both match; a name-only entry may be canonicalised.
export const sameCategoryLabel=(input,stored)=>label(input)===label(stored)&&(!code(input)||code(input)===code(stored));
const nodeMatches=(input,node)=>sameCategoryLabel(input,node.code+' : '+node.name);
export function allLotteStandardPaths(catalog=data('category-catalog-standard.json')){
  return (catalog?.majors||[]).flatMap(major=>(major.middles||[]).flatMap(middle=>(middle.smalls||[]).flatMap(small=>(small.details?.length?small.details:[null]).map(detail=>({major,middle,small,detail})))));
}
export const LOTTE_ACCESSORY_COMMON_PATHS=[
    ['L0001 : 패션/장신','M0357 : 패션액세서리','01068 : 머플러'],
    ['L0022 : 가방/피혁잡화','M0307 : 벨트','01033 : 남성벨트'],
    ['L0022 : 가방/피혁잡화','M0307 : 벨트','01032 : 여성벨트'],
];
export function lotteCategoryGenderIssues(product,category=product.category||{}){
  const gender=product.gender,issues=[];
  const source=[...new Set((product.sourceCategory||[]).map(value=>({MEN:'남성',WOMEN:'여성',남성:'남성',여성:'여성'}[String(value).trim().toUpperCase()])).filter(Boolean))];
  if(!['남성','여성'].includes(gender))issues.push({code:'gender',message:'성별을 확인해 주세요.'});
  if(source.length===1&&source[0]!==gender)issues.push({code:'source-gender',message:'공식 상품 경로와 입력한 성별이 다릅니다.'});
  for(const [prefix,keys] of [['common',['commonMajor','commonMiddle','commonSmall']],['channel',['channelMajor','channelMiddle','channelSmall','channelDetail']]]){
    const opposite=keys.map(key=>label(category[key]).match(/^(?:브랜드)?(남성|여성)/)?.[1]).find(value=>value&&value!==gender);
    if(opposite)issues.push({code:prefix+'-gender',message:(prefix==='common'?'1차 공통분류':'2차 채널분류')+'의 성별이 '+gender+' 상품과 다릅니다. '+gender+' 분류를 선택해 주세요.'});
  }
  return issues;
}
function accessoryCommon(c){
  return LOTTE_ACCESSORY_COMMON_PATHS.find(p=>(!c.commonMajor||sameCategoryLabel(c.commonMajor,p[0]))&&sameCategoryLabel(c.commonMiddle,p[1])&&sameCategoryLabel(c.commonSmall,p[2]));
}
function verifiedAccessory(product,c,matches){
  if(!['잡화','브랜드가방'].includes(c.channelMajor)||c.channelDetail)return null;
  for(const match of matches?.matches||[]){
    let key;try{key=JSON.parse(match.key);}catch{continue;}
    const a=match.actual;
    if(!match.verification||!match.verifiedAt||!a||a.detail||key[0]!==product.gender)continue;
    if(!sameCategoryLabel(c.commonMiddle,key[1])||!sameCategoryLabel(c.commonSmall,key[2]))continue;
    if(a.major===c.channelMajor&&a.middle===c.channelMiddle&&a.small===c.channelSmall)return a;
  }
  return null;
}
export function validateLotteCategory(product,{standard=data('category-catalog-standard.json'),common=data('category-catalog-common.json'),matches=data('category-matches.json')}={}){
  const c={...product.category},issues=[];
  const add=(code,message)=>issues.push({code,message});
  const gender=product.gender;
  issues.push(...lotteCategoryGenderIssues(product,c));
  const title=String(product.rawName||product.name||'');
  if(gender==='남성'&&/반팔/.test([title,...(product.sourceCategory||[])].join(' '))&&/긴팔/.test(c.channelMiddle||''))add('sleeve-conflict','반팔 상품이 긴팔 채널분류로 연결되어 있습니다. 반팔티셔츠 경로를 확인해 주세요.');
  if(/조끼|베스트/.test(title)&&/패딩|다운|푸퍼/.test(title)&&c.channelSmall==='패딩/다운점퍼')add('vest-conflict','패딩 조끼가 점퍼로 연결되어 있습니다. 패딩조끼 경로를 확인해 주세요.');
  if(isMensUnderwear(product)&&c.channelSmall!=='남성내의'&&!(c.channelMajor==='브랜드언더웨어'&&c.channelMiddle==='남성내의'))add('underwear-conflict','확인된 남성 내의는 남성내의 상품군의 2차 경로를 사용합니다.');
  if(/양말|장갑|벨트|머플러|볼캡|버킷햇|비니|백팩|숄더백|토트백|(?:^|\s)브라(?:렛|탑)?(?:$|\s)|드로즈|팬티/.test(title)&&(!c.channelMajor||/^브랜드(?:남성|여성)의류$/.test(c.channelMajor)))add('accessory-conflict','잡화·속옷을 일반 의류의 소재 분류로 연결할 수 없습니다. 해당 상품군의 실제 경로를 확인해 주세요.');
  const required={commonMiddle:'공통 중분류',commonSmall:'공통 소분류',channelMiddle:'롯데ON 중분류',channelSmall:'롯데ON 소분류'};
  for(const [key,title] of Object.entries(required))if(!String(c[key]||'').trim())add('missing-'+key,title+'가 비어 있습니다.');
  const commonMajor=c.commonMajor||gender+'의류',channelMajor=c.channelMajor||'브랜드'+gender+'의류';
  let commonPath=[commonMajor,c.commonMiddle,c.commonSmall].filter(Boolean),channelPath=[channelMajor,c.channelMiddle,c.channelSmall,c.channelDetail].filter(Boolean);
  let exactCommon=null,exactStandard=null,evidence='저장된 실제 목록';
  if(!common||common.incomplete)add('common-catalog','공통분류 목록이 없거나 수집이 끝나지 않았습니다.');
  else{
    const groups=(common.genders||[]).filter(g=>g.gender===gender&&sameCategoryLabel(commonMajor,g.major));
    const found=groups.flatMap(g=>(g.middles||[]).filter(m=>sameCategoryLabel(c.commonMiddle,m.middle)).flatMap(m=>(m.children||[]).filter(s=>sameCategoryLabel(c.commonSmall,s)).map(s=>[g.major,m.middle,s])));
    exactCommon=found.length===1?found[0]:accessoryCommon(c);
    if(!exactCommon)add('common-path','공통 대·중·소분류의 이름·코드·부모 경로가 저장 목록과 일치하지 않습니다.');
    else commonPath=exactCommon;
  }
  if(!standard?.complete)add('standard-catalog','롯데ON 표준분류 목록 수집이 완료되지 않았습니다.');
  else{
    const paths=allLotteStandardPaths(standard).filter(p=>nodeMatches(channelMajor,p.major)&&nodeMatches(c.channelMiddle,p.middle)&&nodeMatches(c.channelSmall,p.small));
    const found=paths.filter(p=>p.detail?nodeMatches(c.channelDetail,p.detail):!c.channelDetail);
    if(found.length===1){
      exactStandard=found[0];channelPath=[exactStandard.major.name,exactStandard.middle.name,exactStandard.small.name,exactStandard.detail?.name].filter(Boolean);
      for(const level of ['major','middle','small','detail'])if(c.channelCodes?.[level]&&c.channelCodes[level]!==String(exactStandard[level]?.code||''))add('channel-code-'+level,'롯데ON '+({major:'대',middle:'중',small:'소',detail:'세'}[level])+'분류 이름과 코드가 다릅니다. 분류를 다시 확인해 주세요.');
      const expected=commonFor(exactStandard,gender,common||{genders:[]});
      if(expected&&exactCommon&&!sameCategoryLabel(exactCommon[2],expected.small))add('crosswalk','공통분류와 롯데ON 분류의 상품 유형이 다릅니다. 권장 공통분류: '+expected.small);
      if(!expected){
        if(exactStandard.small.code==='BC35100100'){
          if(!exactCommon||!sameCategoryLabel(exactCommon[2],'01068 : 머플러'))add('crosswalk','머플러 채널분류에 맞는 공통분류는 01068 : 머플러입니다.');
        }else if(['BC30040100','BC30040200'].includes(exactStandard.small.code)){
          const desired=exactStandard.small.code==='BC30040100'?'01033 : 남성벨트':'01032 : 여성벨트';
          if(!exactCommon||!sameCategoryLabel(exactCommon[2],desired))add('crosswalk','벨트 채널분류에 맞는 공통분류를 확인해 주세요: '+desired);
        }else add('crosswalk-unmapped','이 롯데ON 경로는 세부 분류를 확인하고 필요하면 직접 수정할 수 있습니다.');
      }
    }else if(isMensUnderwear(product)&&['commonMajor','commonMiddle','commonSmall','channelMajor','channelMiddle','channelSmall'].every(k=>sameCategoryLabel(c[k]||(k==='commonMajor'?commonMajor:k==='channelMajor'?channelMajor:''),MENS_UNDERWEAR_CATEGORY[k]))&&!c.channelDetail&&!Object.values(c.channelCodes||{}).some(Boolean)){
      channelPath=['남성의류','남성속옷','남성내의'];evidence='사용자가 확인한 남성내의 경로';
    }else if(exactCommon&&verifiedAccessory(product,{...c,channelMajor},matches)){
      if(Object.values(c.channelCodes||{}).some(Boolean))add('accessory-code','잡화의 저장된 선택 기록에는 코드 검증 근거가 없습니다. 분류 코드를 다시 확인해 주세요.');
      evidence='판매처 선택 확인 기록';
    }else if(paths.length&&!c.channelDetail&&paths.some(p=>p.detail))add('channel-detail','롯데ON 세분류가 필요한 경로입니다. 세분류를 선택해 주세요.');
    else add('channel-path','롯데ON 대·중·소·세분류가 하나의 저장 경로와 일치하지 않습니다.');
  }
  const ready=issues.length===0;
  const category={...c};
  if(exactCommon)[category.commonMajor,category.commonMiddle,category.commonSmall]=exactCommon;
  if(exactStandard){
    Object.assign(category,{channelMajor:exactStandard.major.name,channelMiddle:exactStandard.middle.name,channelSmall:exactStandard.small.name,channelDetail:exactStandard.detail?.name||'',channelCodes:Object.fromEntries(['major','middle','small','detail'].map(k=>[k,exactStandard[k]?.code||'']))});
  }
  return {status:ready?'ready':'blocked',ready,summary:ready?'저장 목록 대조 통과 · 판매처에서 실제 선택 시 다시 확인합니다.':'상품분류 확인이 필요합니다.',issues,commonPath,channelPath,category,catalogDate:standard?.completedAt||standard?.collectedAt||'',scope:'성인 남녀 의류 및 개별 확인된 잡화 경로',evidence};
}
export function assertLotteCategory(product){
  const result=validateLotteCategory(product);
  if(!result.ready)throw Error(result.summary+' '+result.issues.map(x=>x.message).join(' '));
  return result.category;
}
