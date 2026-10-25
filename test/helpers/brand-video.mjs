import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
// File-transport fixture only. Real decoding/autoplay is checked with the user's local MP4 separately.
export const fixtureVideo=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32000000086d646174','hex');
export const videoOptions={expectedHash:createHash('sha256').update(fixtureVideo).digest('hex')};
export async function prepareVideo(dataRoot){await mkdir(path.join(dataRoot,'brand-video'),{recursive:true});await writeFile(path.join(dataRoot,'brand-video/common.mp4'),fixtureVideo);await writeFile(path.join(dataRoot,'brand-video/women.mp4'),fixtureVideo);return {dataRoot,videoOptions};}
