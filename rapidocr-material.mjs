import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline';

export const rapidOcrInstallRoot=path.join(
 process.env.LOCALAPPDATA||path.join(homedir(),'AppData','Local'),
 'CodexRegistrar','RapidOCR-3.10.0',
);

const recognize=String.raw`
import json
import sys
from base64 import b64decode
from pathlib import Path

packages = Path(sys.argv[1])
sys.path.insert(0, str(packages))
from rapidocr import ModelType, OCRVersion, RapidOCR

models = packages / "rapidocr" / "models"
engine = RapidOCR(params={
    "Det.ocr_version": OCRVersion.PPOCRV5,
    "Det.model_type": ModelType.MOBILE,
    "Det.model_path": str(models / "ch_PP-OCRv5_det_mobile.onnx"),
    "Rec.lang_type": "korean",
    "Rec.ocr_version": OCRVersion.PPOCRV5,
    "Rec.model_type": ModelType.MOBILE,
    "Rec.model_path": str(models / "korean_PP-OCRv5_rec_mobile.onnx"),
    "Global.use_cls": False,
    "Global.text_score": 0.0,
    "EngineConfig.onnxruntime.intra_op_num_threads": 2,
    "EngineConfig.onnxruntime.inter_op_num_threads": 1,
})
for line in sys.stdin.buffer:
    try:
        result = engine(b64decode(line))
        text = "\n".join(result.txts) if result.txts and min(result.scores) >= 0.8 else ""
        print(json.dumps({"text": text}), flush=True)
    except Exception:
        print(json.dumps({"error": True}), flush=True)
`;

let worker;
let queue=Promise.resolve();

function startWorker(python,packages){
 const child=spawn(python,['-I','-B','-c',recognize,packages],{windowsHide:true,stdio:['pipe','pipe','ignore']});
 const lines=createInterface({input:child.stdout});
 const current={child,pending:null,idleTimer:null};
 function stop(error){
  clearTimeout(current.idleTimer);
  if(worker===current)worker=undefined;
  lines.close();
  current.pending?.finish(error);
  child.kill();
 }
 current.stop=stop;
 child.on('error',stop);
 child.on('exit',()=>stop(Error('RapidOCR 실행이 종료되었습니다.')));
 child.stdin.on('error',stop);
 child.stdout.on('error',stop);
 lines.on('line',line=>{
  const pending=current.pending;
  if(!pending)return;
  try{
   const result=JSON.parse(line);
   if(typeof result.text!=='string'||result.text.length>1000)throw Error('RapidOCR 소재 인식 결과를 확인해 주세요.');
   pending.finish(null,result.text);
  }catch(error){stop(error);}
 });
 return current;
}

async function recognizeMaterial(image,signal){
 signal?.throwIfAborted();
 if(!worker){
  const python=(await readFile(path.join(rapidOcrInstallRoot,'python.txt'),'utf8')).trim();
  signal?.throwIfAborted();
  if(!path.isAbsolute(python))throw Error('RapidOCR 실행 경로를 확인해 주세요.');
  worker=startWorker(python,path.join(rapidOcrInstallRoot,'packages'));
 }
 const current=worker;
 const {child}=current;
 clearTimeout(current.idleTimer);
 child.ref();
 child.stdin.ref?.();
 child.stdout.ref?.();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>current.stop(Error('RapidOCR 소재 판독 시간이 초과되었습니다.')),12000);
  const abort=()=>current.stop(signal.reason);
  current.pending={finish(error,text){
   current.pending=null;
   clearTimeout(timer);
   signal?.removeEventListener('abort',abort);
   if(error){reject(error);return;}
   current.idleTimer=setTimeout(()=>current.stop(),60000);
   current.idleTimer.unref();
   child.unref();
   child.stdin.unref?.();
   child.stdout.unref?.();
   resolve(text);
  }};
  signal?.addEventListener('abort',abort,{once:true});
  child.stdin.write(image.toString('base64')+'\n');
 });
}

export function readRapidOcrMaterial(image,{signal}={}){
 const job=queue.then(()=>recognizeMaterial(image,signal));
 queue=job.catch(()=>{});
 return job;
}
