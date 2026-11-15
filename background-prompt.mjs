import path from 'node:path';

export function backgroundPrompt(result,{root,nodePath}){
 const helper=path.join(root,'background-finish.mjs');
 const command=action=>'& '+JSON.stringify(nodePath)+' '+JSON.stringify(helper)+' '+action+' --job '+result.jobId;
 return [
  '품번 '+result.style+'의 '+result.key+' 원본 배경 확장 요청입니다. 요청 번호: '+result.jobId+'.',
  '먼저 다음 명령으로 현재 상품·사진 선택·원본을 검증해 주세요: '+command('inspect'),
  '검증에 실패하면 중단하고 이전 요청으로 다시 준비하거나 직접 manifest를 수정하지 마세요. 품번이나 선택이 바뀌었다가 돌아와도 이 요청은 취소됩니다.',
  '검증된 원본 '+JSON.stringify(result.sourcePath)+'을 직접 확인하고 내장 이미지 생성 도구로 배경만 정사각형으로 자연스럽게 확장해 주세요. 인물·의상·색상·비율과 원본의 보이는 전체 영역을 유지하고 자르지 마세요. 별도 유료 API로 전환하지 마세요.',
  '생성된 배경을 확인한 뒤 다음 명령의 경로를 실제 생성 파일 절대 경로로 바꿔 실행하세요: '+command('stage')+' --image "생성파일절대경로"',
  '이 명령은 원본 전체를 비율 유지한 채 불투명하게 중앙 합성하고 1500×1500 JPEG를 만듭니다. 원본 파일은 보존합니다. 반환된 previewPath를 직접 열어 인물·옷·색상·전체 영역과 배경 연결부를 확인해 주세요. 경계나 그림자가 부자연스러우면 적용하지 말고 알려 주세요.',
  '최종 이미지 검수 후 다음 명령으로 대표이미지 적용과 결과 캐시를 함께 완료하세요: '+command('apply')+' --reviewed',
  '품번·선택·원본·작업 상태를 서버가 적용 직전 다시 검증합니다. 검증 실패 시 중단하세요. 완성본은 선택 자리와 관계없이 현재 상품의 대표이미지에만 적용합니다. 판매처 저장·등록은 누르지 마세요.'
 ].join('\n\n');
}
