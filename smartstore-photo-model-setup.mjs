// Explicit, one-time model installation. Runtime photo inference stays offline.
import {readFile} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const settings=JSON.parse(await readFile(path.resolve(process.argv[2]||'data/photo-local-runtime.json'),'utf8'));
const {pipeline,env,Florence2ForConditionalGeneration,AutoProcessor}=await import(pathToFileURL(settings.transformersModule));env.cacheDir=settings.cacheDir;env.allowRemoteModels=true;
const opts={dtype:'q8',session_options:{intraOpNumThreads:2,interOpNumThreads:1}};
for(const [task,id,dtype]of [['zero-shot-image-classification','Xenova/clip-vit-base-patch32','q8'],['zero-shot-image-classification','Xenova/siglip-base-patch16-224','fp32'],['image-segmentation','Xenova/segformer_b0_clothes','q8'],['image-segmentation','Xenova/segformer_b2_clothes','q8']]){const model=await pipeline(task,id,{...opts,dtype});await model.dispose();console.log('설치 확인: '+id);}
const model=await Florence2ForConditionalGeneration.from_pretrained('onnx-community/Florence-2-base-ft',opts);await model.dispose();await AutoProcessor.from_pretrained('onnx-community/Florence-2-base-ft');console.log('사진 판독 모델 설치 완료 · 실제 사진의 외부 전송 없음');
