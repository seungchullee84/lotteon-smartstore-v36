const routes={open:'lotte',run:'lotte','smartstore-open':'smartstore','smartstore-plan':'smartstore','smartstore-test':'smartstore','smartstore-optimize-title':'smartstore','naver-settings':'smartstore'};
export function requireChannel(endpoint,channel){
 const expected=routes[endpoint];
 // Older open tabs omit channel; their endpoint already fixes the destination.
 if(expected&&channel!==undefined&&channel!==expected)throw Error('선택한 판매채널과 실행 요청이 다릅니다. 화면을 새로고침하고 판매채널을 확인해 주세요.');
 return expected;
}
