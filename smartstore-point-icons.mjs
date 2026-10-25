// Icons describe only the current point's wording, never add product claims.
const icons={
 wool:'<circle cx="23" cy="23" r="15.5"/><path d="M10 15c8 0 19 11 26 19M8 23c7-1 16 3 24 12M13 10c-1 8 6 18 18 26M23 8c-2 9 0 17 7 25M31 10c-5 7-7 17-5 25M11 29c10-8 18-11 26-10M16 35c7-8 15-11 22-10M34 35c9 0 10 7 5 7h-7"/>',
 turtleneck:'<path d="M15 20V9c5-3 13-3 18 0v11l8 7-5 8-5-3v9H17v-9l-5 3-5-8Z"/><path d="M15 20c4 5 14 5 18 0M15 9c5 3 13 3 18 0M19 11v10m5-9v10m5-11v10M17 36h14"/>',
 neckline:'<path d="m16 11-9 7 5 9 5-3v17h14V24l5 3 5-9-9-7M16 11c0 10 16 10 16 0M19 11c0 6 10 6 10 0M17 36h14"/>',
 zipper:'<path d="M11 8h26v32H11Z"/><path d="M22 8v32m4-32v32M20 13h8m-8 5h8m-8 5h8m-8 5h8m-8 5h8"/><rect x="20" y="15" width="8" height="9" rx="2"/><path d="M24 24v6"/>',
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
const surfaces={
 wool:'<circle cx="23" cy="23" r="15.5" fill="#eadab8"/><path d="M11 12c7-4 16-2 20 4-11-5-17 1-22 7-1-4 0-8 2-11" fill="#faf4e7"/>',
 turtleneck:'<path d="m15 20 9 3 9-3 8 7-5 8-5-3v9H17v-9l-5 3-5-8Z" fill="#e2e8d8"/><path d="M15 9c5-3 13-3 18 0v11c-4 5-14 5-18 0Z" fill="#faf8ed"/>',
 neckline:'<path d="m16 11-9 7 5 9 5-3v17h14V24l5 3 5-9-9-7c0 10-16 10-16 0" fill="#e2e8d8"/>',
 zipper:'<rect x="11" y="8" width="26" height="32" rx="3" fill="#e2e8d8"/><rect x="20" y="15" width="8" height="9" rx="2" fill="#faf8ed"/>',
 fit:'<path d="m16 10-10 8 6 9 5-3v15h14V24l5 3 6-9-10-8c-3 5-13 5-16 0" fill="#e2e8d8"/>',
 pocket:'<path d="M10 12h28v18c0 5-14 10-14 10s-14-5-14-10Z" fill="#e2e8d8"/>',
 embroidery:'<rect x="8" y="10" width="32" height="28" rx="7" fill="#e2e8d8"/>',
 hood:'<path d="M24 7c-12 0-17 14-17 24l10 10h14l10-10C41 21 36 7 24 7" fill="#e2e8d8"/>',
 material:'<rect x="10" y="10" width="28" height="28" rx="3" fill="#e2e8d8"/>',
 light:'<path d="M12 36c0-18 10-27 27-27 0 17-9 27-27 27" fill="#eadab8"/>',
 water:'<path d="M24 6S11 22 11 30a13 13 0 0 0 26 0C37 22 24 6 24 6" fill="#d6e5e2"/>',
 design:'<path d="m24 7 5 11 12 2-9 9 2 12-10-6-10 6 2-12-9-9 12-2Z" fill="#eadab8"/>',
};
const rules=[
 ['wool',/메리노|캐시미어|(?<!겨)울(?=100|혼|소재|니트|스웨터|\s|$)/],
 ['turtleneck',/터틀넥|목폴라|하이넥/],
 ['neckline',/네크라인|넥라인|라운드넥|브이넥|V넥/i],
 ['zipper',/집업|지퍼|쿼터집/],
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
 const warm=['wool','warmth','light','design'].includes(kind),cool=['water','cooling','airflow'].includes(kind);
 const tile=warm?'#f6f0e4':cool?'#edf3f1':'#edf1e7',border=warm?'#e9dfcc':cool?'#dce7e3':'#dfe6d7',ink=warm?'#8b7047':cool?'#557a72':'#536a4d';
 return `<svg data-point-icon="${kind}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" style="display:block;flex:none;" fill="none"><rect x="1" y="2" width="62" height="60" rx="17" fill="${tile}" stroke="${border}"/><path d="M10 13c3-5 7-7 14-7h25" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/><g transform="translate(8 7)"><ellipse cx="24" cy="41" rx="17" ry="2.5" fill="${ink}" opacity=".08"/>${surfaces[kind]||''}<g stroke="${ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[kind]}</g></g></svg>`;
}
