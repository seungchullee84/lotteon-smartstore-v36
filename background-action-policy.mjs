const workflow=new Set(['background-selection','background-prepare','background-dispatch','background-inspect','background-result','background-complete','background-cancel','background-retry','background-fail']);
const concurrent=new Set(['notice-region-text','price-changer/open','naver-verify','naver-keywords','naver-settings','browser-login-settings','smartstore-optimize-title','smartstore-tags-search','smartstore-tags-remove','smartstore-tags-selection','smartstore-tags-selected','smartstore-tags','smartstore-tags-validate','smartstore-template-headline','smartstore-point-selection','smartstore-template','smartstore-photo-review-draft','background-settings','smartstore-ai-settings','smartstore-open','smartstore-plan','learn-washing-icon','smartstore-two-choice-save','save-main-image','save-detail-images','branding','lotte-category-suggest','run','lotte-current-brushed-category','smartstore-test','smartstore-extra-only','smartstore-detail-only','smartstore-two-choice-upload','open','continue','stop','background-request']);

// Unknown future mutations remain conservative. Source-changing routes cancel
// before reading the request body, so a change away and back cannot revive a job.
export function backgroundActionKind(pathname){
 const action=pathname.startsWith('/api/')?pathname.slice(5):pathname;
 return workflow.has(action)?'workflow':concurrent.has(action)?'concurrent':'source-change';
}
