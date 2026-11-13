import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';

export const rapidOcrInstallRoot=path.join(
 process.env.LOCALAPPDATA||path.join(homedir(),'AppData','Local'),
 'CodexRegistrar','RapidOCR-3.10.0',
);

const recognize=String.raw`
import json
import sys
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
result = engine(sys.stdin.buffer.read())
text = "\n".join(result.txts) if result.txts and min(result.scores) >= 0.8 else ""
print(json.dumps(text))
`;

export async function readRapidOcrMaterial(image,{signal}={}){
 signal?.throwIfAborted();
 const python=(await readFile(path.join(rapidOcrInstallRoot,'python.txt'),'utf8')).trim();
 signal?.throwIfAborted();
 if(!path.isAbsolute(python))throw Error('RapidOCR 실행 경로를 확인해 주세요.');
 const packages=path.join(rapidOcrInstallRoot,'packages');
 return new Promise((resolve,reject)=>{
  const child=execFile(python,['-I','-B','-c',recognize,packages],{
   signal,windowsHide:true,timeout:12000,maxBuffer:65536,
  },(error,stdout)=>{
   if(error){reject(error);return;}
   try{
    const text=JSON.parse(stdout);
    if(typeof text!=='string'||text.length>1000)throw Error('RapidOCR 소재 인식 결과를 확인해 주세요.');
    resolve(text);
   }catch(error){reject(error);}
  });
  child.stdin.on('error',()=>{}); // The child may close its pipe before consuming input on abort.
  child.stdin.end(image);
 });
}
