import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const job=JSON.parse(await readFile(process.argv[2],'utf8'));
const {pipeline,env}=await import(pathToFileURL(job.settings.transformersModule));
env.cacheDir=job.settings.cacheDir;env.allowRemoteModels=false;
const model=await pipeline('zero-shot-image-classification','Xenova/siglip-base-patch16-224',{dtype:'fp32',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
const roles=['front','side','back','detail'];
const roleLabels=['The straight front view of a garment worn by a mannequin, showing its front opening, chest or front pockets.','The side view of a garment worn by a mannequin, body turned sideways.','The back view of a garment worn by a mannequin, showing the back panel.','A close-up detail or care label photo of clothing, not a full garment view.'];
const colorWords=[[/라이트카키/,'light khaki beige'],[/아이보리|화이트/,'ivory white'],[/베이지/,'beige tan'],[/올리브|카키/,'olive green'],[/차콜/,'charcoal gray'],[/블랙/,'black'],[/블루|네이비/,'blue navy'],[/체리|버건디/,'burgundy red'],[/브라운/,'brown'],[/핑크/,'pink'],[/그레이/,'gray']];
const colorLabels=job.colors.map(c=>'A photo of a '+(colorWords.find(([re])=>re.test(c))?.[1]||c.replace(/^\d+/,''))+' colored garment on a mannequin.');
const output=[];
for(const photo of job.photos){
 const r=await model(photo.file,roleLabels),c=await model(photo.file,colorLabels);const ri=roleLabels.indexOf(r[0].label),ci=colorLabels.indexOf(c[0].label);
 output.push({role:roles[ri],roleScore:r[0].score,roleMargin:r[0].score-(r[1]?.score||0),color:job.colors[ci],colorScore:c[0].score,colorMargin:c[0].score-(c[1]?.score||0)});
}
await writeFile(process.argv[3],JSON.stringify(output));
