import path from 'node:path';

export function backgroundPrompt(result,{root,nodePath}){
 const helper=path.join(root,'background-finish.mjs');
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const command=action=>'& '+quote(nodePath)+' '+quote(helper)+' '+action+' --job '+result.jobId;
 return [
  '등록기의 합성 진행 버튼으로 사용자가 승인한 품번 '+result.style+'의 '+result.key+' 원본 배경 확장 요청입니다. 요청 번호: '+result.jobId+'. 이 요청 한 건만 처리하고 종료하세요. 코드/설정/다른 상품/판매처를 수정하지 마세요.',
  '먼저 다음 명령으로 현재 상품·사진 선택·원본을 검증해 주세요: '+command('inspect'),
  '검증에 실패하면 중단하고 이전 요청으로 다시 준비하거나 직접 manifest를 수정하지 마세요. 품번이나 선택이 바뀌었다가 돌아와도 이 요청은 취소됩니다.',
  '검증된 원본 '+JSON.stringify(result.sourcePath)+'을 view_image로 직접 확인하고 내장 image_gen 도구로 배경만 정사각형으로 자연스럽게 확장해 주세요. 인물·의상·색상·비율과 원본의 보이는 전체 영역을 유지하고 자르지 마세요. 원본은 square 안에 비율 유지하여 전체 높이 또는 너비를 맞추고 중앙에 놓습니다. 원본 영역은 후처리에서 그대로 덮어쓰므로 새 배경은 가장자리와 명암·그림자가 이어져야 합니다. 원본 피사체를 확대하지 마세요. 별도 유료 API/CLI 이미지 스크립트로 전환하지 마세요. 내장 image_gen이 없으면 실패를 보고하고 종료하세요.',
  '생성된 배경을 확인한 뒤 다음 명령의 경로를 실제 생성 파일 절대 경로로 바꿔 실행하세요: '+command('stage')+' --image "생성파일절대경로"',
  '이 명령은 원본 전체를 비율 유지한 채 불투명하게 중앙 합성하고 1500×1500 JPEG를 만듭니다. 원본 파일은 보존합니다. 반환된 previewPath를 직접 열어 인물·옷·색상·전체 영역과 배경 연결부를 확인해 주세요. 경계나 그림자가 부자연스러우면 적용하지 말고 알려 주세요.',
  '최종 이미지 검수 후 다음 명령으로 대표이미지 적용과 결과 캐시를 함께 완료하세요: '+command('apply')+' --reviewed',
  '품번·선택·원본·작업 상태를 서버가 적용 직전 다시 검증합니다. 검증 실패 시 중단하세요. 완성본은 선택 자리와 관계없이 현재 상품의 대표이미지에만 적용합니다. helper 대신 product/selection/manifest 파일을 직접 수정하지 마세요. 판매처 저장·등록은 누르지 마세요. 최종 응답은 적용 성공 또는 중단 원인을 짧게 작성하고 저장된 previewPath 및 사용한 생성 프롬프트를 기록하세요.'
 ].join('\n\n');
}
