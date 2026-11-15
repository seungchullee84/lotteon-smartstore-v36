import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {BACKGROUND_COMPOSITE_VERSION,composeBackground} from '../background-composite.mjs';

async function sourcePhoto(width,height,{orientation}={}){
 const data=Buffer.alloc(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const rgb=y<12?[220,20,30]:y>=height-12?[230,210,20]:x<12?[20,210,40]:x>=width-12?[20,40,220]:[80+Math.floor(x/8)%2*50,90+Math.floor(y/8)%2*50,100];
  for(let c=0;c<3;c++)data[(y*width+x)*3+c]=rgb[c];
 }
 let image=sharp(data,{raw:{width,height,channels:3}});
 if(orientation)image=image.withMetadata({orientation});
 return image.jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer();
}
const background=colour=>sharp({create:{width:256,height:256,channels:3,background:colour}}).png().toBuffer();
async function pixels(bytes){return sharp(bytes).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});}
const pixel=(image,x,y)=>[...image.data.subarray((y*image.info.width+x)*3,(y*image.info.width+x)*3+3)];
function close(actual,expected,tolerance=8){for(let i=0;i<3;i++)assert(Math.abs(actual[i]-expected[i])<=tolerance,`${actual} differs from ${expected}`);}

for(const [label,width,height] of [['portrait',120,200],['landscape',200,120]])test(`${label}: preserve all source edges and aspect ratio, generated pixels only outside`,async()=>{
 const original=await sourcePhoto(width,height),generated=await background('#ce30d0'),before=Buffer.from(original);
 const output=await composeBackground({original,generated}),meta=await sharp(output).metadata(),actual=await pixels(output);
 assert.equal(meta.format,'jpeg');assert.equal(meta.width,1500);assert.equal(meta.height,1500);assert.equal(meta.chromaSubsampling,'4:4:4');
 const expected=await sharp(original).resize(1500,1500,{fit:'inside'}).raw().toBuffer({resolveWithObject:true});
 const left=(1500-expected.info.width)/2,top=(1500-expected.info.height)/2;
 assert.equal(expected.info.width/expected.info.height,width/height);
 let difference=0;
 for(let y=0;y<expected.info.height;y++)for(let x=0;x<expected.info.width;x++)for(let c=0;c<3;c++)difference+=Math.abs(actual.data[((top+y)*1500+left+x)*3+c]-expected.data[(y*expected.info.width+x)*3+c]);
 assert(difference/expected.data.length<2,'the entire source rectangle survives, within final JPEG compression error');
 for(const [x,y] of [[20,20],[expected.info.width-21,20],[20,expected.info.height-21],[expected.info.width-21,expected.info.height-21],[20,expected.info.height/2],[expected.info.width-21,expected.info.height/2]])close(pixel(actual,left+x,top+y),pixel(expected,x,y));
 close(pixel(actual,5,5),[206,48,208]);close(pixel(actual,1494,1494),[206,48,208]);
 const alternate=await pixels(await composeBackground({original,generated:await background('#12e12a')}));
 for(const [x,y] of [[40,40],[expected.info.width/2,expected.info.height/2],[expected.info.width-41,expected.info.height-41]])assert.deepEqual(pixel(actual,left+x,top+y),pixel(alternate,left+x,top+y),'the original is fully opaque over different generated backgrounds');
 assert.deepEqual(original,before,'input original bytes remain untouched');
});

test('EXIF orientation is respected without dropping any source edge',async()=>{
 const original=await sourcePhoto(200,120,{orientation:6}),output=await composeBackground({original,generated:await background('#888888')}),actual=await pixels(output);
 const expected=await sharp(original).rotate().resize(1500,1500,{fit:'inside'}).raw().toBuffer({resolveWithObject:true});
 assert.equal(expected.info.width,900);assert.equal(expected.info.height,1500);
 for(const [x,y] of [[20,20],[879,20],[20,1479],[879,1479]])close(pixel(actual,x+300,y),pixel(expected,x,y));
 assert.equal((await sharp(output).metadata()).orientation,undefined);
});

test('square source covers the generated image completely and output is deterministic',async()=>{
 const original=await sourcePhoto(120,120),first=await composeBackground({original,generated:await background('#ff0000')}),second=await composeBackground({original,generated:await background('#00ff00')});
 assert.deepEqual(first,second);assert.match(BACKGROUND_COMPOSITE_VERSION,/original-center-1500/);
});

test('invalid inputs, non-JPEG originals and non-square generated backgrounds are rejected',async()=>{
 const original=await sourcePhoto(120,200),generated=await background('#888888');
 await assert.rejects(composeBackground({original:null,generated}),/JPEG 원본/);
 await assert.rejects(composeBackground({original,generated:Buffer.alloc(0)}),/배경 이미지/);
 await assert.rejects(composeBackground({original:generated,generated}),/JPEG 사진/);
 await assert.rejects(composeBackground({original:Buffer.from('broken JPEG'),generated}));
 await assert.rejects(composeBackground({original,generated:Buffer.from('broken PNG')}));
 const rectangle=await sharp({create:{width:120,height:200,channels:3,background:'#fff'}}).png().toBuffer();
 await assert.rejects(composeBackground({original,generated:rectangle}),/정사각형/);
});
