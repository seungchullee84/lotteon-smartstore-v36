import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { normalizeSmartstoreProductLink } from './smartstore-product-link.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validStyle = style => typeof style === 'string' && /^\d{6}$/.test(style);
const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const maxImageBytes = 19000000;

export async function loadSmartstoreLinkedComparison(dataRoot, style, { preview = false } = {}) {
 if (!validStyle(style)) return null;
 const root = path.join(dataRoot, 'smartstore-details', style, 'linked-comparison');
 const manifestPath = path.join(root, 'manifest.json');
 let manifestBytes;
 try {
  const metadata = await lstat(manifestPath);
  if (!metadata.isFile() || metadata.size > 16000) throw Error('비교 상세 구성 파일을 확인해 주세요.');
  manifestBytes = await readFile(manifestPath);
 } catch (error) {
  if (error.code === 'ENOENT') return null;
  throw error;
 }
 const manifest = JSON.parse(manifestBytes.toString('utf8'));
 const items = manifest.parts;
 if (manifest.version !== 1 || manifest.style !== style || !Array.isArray(items) || items.length < 3 || items.length > 12 ||
     items[0]?.kind !== 'intro' || items[1]?.kind !== 'photo' || items[2]?.kind !== 'photo' ||
     items.slice(3).some(item => item?.kind !== 'detail')) throw Error('비교 상세의 품번과 사진 순서를 확인해 주세요.');
 const photoStyles = items.slice(1, 3).map(item => item.style);
 if (!photoStyles.every(validStyle) || new Set(photoStyles).size !== 2 || !photoStyles.includes(style)) throw Error('비교 상세의 두 상품 품번을 확인해 주세요.');
 const canonicalRoot = await realpath(root);
 const dataDirectory = await realpath(dataRoot);
 const relativeRoot = path.relative(dataDirectory, canonicalRoot);
 if (!relativeRoot || relativeRoot === '..' || relativeRoot.startsWith('..' + path.sep) || path.isAbsolute(relativeRoot)) {
  throw Error('비교 상세 자료 위치를 확인해 주세요.');
 }
 const filenames = new Set();
 const destinations = new Set();
 const parts = [];
 for (const item of items) {
  if (typeof item.name !== 'string' || !/^comparison-[a-z0-9-]+\.png$/.test(item.name) || filenames.has(item.name) ||
      typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('비교 상세 파일명과 원본 확인값을 확인해 주세요.');
  filenames.add(item.name);
  const file = path.join(canonicalRoot, item.name);
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.size > maxImageBytes) throw Error('비교 상세 사진의 형식이나 용량을 확인해 주세요.');
  const bytes = await readFile(file);
  if (sha256(bytes) !== item.sha256) throw Error('비교 상세 사진이 바뀌었습니다: ' + item.name);
  const image = await sharp(bytes).metadata();
  if (image.format !== 'png' || !image.width || image.width > 860 || !image.height) throw Error('비교 상세 이미지 크기를 확인해 주세요.');
  const part = {kind:item.kind, file, sha256:item.sha256};
  if (item.kind === 'photo') {
   const link = item.purchaseLink;
   if (link?.source !== 'user' || link.style !== item.style) throw Error('품번별 구매 주소 확인 자료가 없습니다.');
   const identity = normalizeSmartstoreProductLink(link.url);
   if (destinations.has(identity)) throw Error('두 상품에 같은 구매 주소가 지정되어 있습니다.');
   destinations.add(identity);
   Object.assign(part, {style:item.style, url:link.url.trim()});
  }
  if (preview) part.src = 'data:image/png;base64,' + bytes.toString('base64');
  parts.push(part);
 }
 return {parts, revision:sha256(manifestBytes)};
}

export function prependSmartstoreLinkedComparison(base, comparison) {
 if (!comparison) return base;
 const count = comparison.parts.length;
 return {
  ...base,
  files: [...comparison.parts.map(part => part.file), ...base.files],
  videoAfterIndex: (base.videoAfterIndex ?? 0) + count,
  footerIndex: base.footerIndex === undefined ? undefined : base.footerIndex + count,
  bannerLink: base.bannerLink ? {...base.bannerLink, index:base.bannerLink.index + count} : base.bannerLink,
  hash: sha256(JSON.stringify([base.hash, comparison.revision])),
  imageLinks: comparison.parts.flatMap((part, index) => part.kind === 'photo' ? [{...part, index}] : [])
 };
}

export function linkedComparisonPreview(comparison) {
 if (!comparison) return '';
 const [intro, ...rest] = comparison.parts;
 const image = (part, alt) => `<img src="${part.src}" alt="${alt}" style="display:block;width:100%;height:auto">`;
 const photos = rest.slice(0, 2).map(photo =>
  `<a href="${escape(photo.url)}" target="_blank" rel="noopener noreferrer" aria-label="${photo.style} 구매 페이지 열기">${image(photo, photo.style + ' 정면 사진과 구매 페이지 안내')}</a>`).join('');
 const details = rest.slice(2).map(part => image(part, '두 터틀넥 비교 정보')).join('');
 return `<section aria-label="두 터틀넥 비교" style="max-width:848px;margin:auto;background:#f4f2eb">${image(intro, '같은 터틀넥, 다른 원단의 매력')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:0 24px 16px">${photos}</div><p style="margin:0 24px 20px;padding:15px;text-align:center;background:#e5eae2;color:#253b2f;font-size:25px;font-weight:bold">사진을 누르면 해당 상품의 구매 페이지로 이동되요.</p>${details}</section>`;
}
