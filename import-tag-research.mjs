import {importTagResearch} from './apparel-tag-research.mjs';
const source=process.argv[2];
if(!source)throw Error('사용법: node import-tag-research.mjs "조사자료 JSON 파일 경로"');
const result=await importTagResearch(source);console.log('태그 조사 자료 '+result.count+'개 연결 완료 · 공유 태그 인덱스에 보관');
