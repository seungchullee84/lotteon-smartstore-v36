// Icons describe only the current point's wording, never add product claims.
const icons={
 warmth:'<path d="M9 27c-5-5 5-7 0-13m15 13c-5-5 5-7 0-13m15 13c-5-5 5-7 0-13M7 35c9 6 25 6 34 0"/>',
 embroidery:'<rect x="8" y="10" width="32" height="28" rx="7"/><path stroke-dasharray="2 4" d="M13 15h22v18H13z"/><path d="m19 27 10-10m-6 0h6v6"/>',
 pocket:'<path d="M10 12h28v18c0 5-14 10-14 10s-14-5-14-10zM10 19h28m-23 5h18"/>',
 fit:'<path d="m16 10-10 8 6 9 5-3v15h14V24l5 3 6-9-10-8c-3 5-13 5-16 0M19 29h10m-7-3-3 3 3 3m4-6 3 3-3 3"/>',
 stretch:'<path d="M8 24h32M15 17l-7 7 7 7m18-14 7 7-7 7M17 10h14M17 38h14"/>',
 light:'<path d="M12 36c0-18 10-27 27-27 0 17-9 27-27 27Zm0 0 19-19M21 27v-8m0 8h8"/>',
 cooling:'<path d="M24 6v36M8 15l32 18M8 33l32-18M19 10l5 5 5-5m-10 28 5-5 5 5M9 21l7-2-2-7m20 24-2-7 7-2M9 27l7 2-2 7m20-24-2 7 7 2"/>',
 airflow:'<path d="M7 17h25c10 0 10-11 3-11-4 0-5 3-5 5M7 24h31M7 31h22c10 0 10 11 3 11-4 0-5-3-5-5"/>',
 water:'<path d="M24 6S11 22 11 30a13 13 0 0 0 26 0C37 22 24 6 24 6ZM17 30c0 4 3 7 7 7"/>',
 hood:'<path d="M24 7c-12 0-17 14-17 24l10 10h14l10-10C41 21 36 7 24 7ZM17 41V25c0-10 14-10 14 0v16M20 32v9m8-9v9"/>',
 material:'<path d="M10 10h28v28H10zm0 9h28M10 29h28M19 10v28m10-28v28"/>',
 design:'<path d="m24 7 5 11 12 2-9 9 2 12-10-6-10 6 2-12-9-9 12-2z"/>',
 neutral:'<path d="M24 8v32M8 24h32M13 13l22 22m0-22L13 35"/>',
};
const rules=[
 ['warmth',/기모|보온|포근|따뜻|웜|온기/],
 ['embroidery',/자수|아플리케|패치|NEW\s*YORK/i],
 ['pocket',/포켓|주머니|수납|실용/],
 ['stretch',/신축|스트레치|스판|늘어/],
 ['cooling',/쿨링|냉감|시원/],
 ['airflow',/통기|바람.*통|쾌적/],
 ['water',/발수|방수/],
 ['light',/가벼|가볍|경량/],
 ['fit',/핏|실루엣|여유|편안/],
 ['hood',/후드|스트링/],
 ['material',/소재|코튼|면|울|모달|테리|혼용/],
 ['design',/그래픽|디자인|프린트|포인트/],
];
export function sellingPointIconKind(point){
 for(const text of [point?.title,point?.description]){
  for(const [kind,pattern] of rules)if(pattern.test(String(text||'')))return kind;
 }
 return 'neutral';
}
export function sellingPointIcon(point){
 const kind=sellingPointIconKind(point);
 return `<svg data-point-icon="${kind}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="40" height="40" style="display:block;flex:none;color:#53694d;" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[kind]}</svg>`;
}
