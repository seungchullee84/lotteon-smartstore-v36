import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(root,'dist'),{recursive:true});
await build({absWorkingDir:root,entryPoints:['src/main.jsx'],bundle:true,minify:true,outdir:'dist',entryNames:'app',jsx:'automatic',target:['chrome120'],define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'warning'});
await copyFile(path.join(root,'index.html'),path.join(root,'dist','index.html'));
console.log('Astryx preview built');
