import {deflateRawSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';

const table=Array.from({length:256},(_,index)=>{
  let value=index;
  for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=table[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
export async function writeUpdateZip(destination,entries){
  if(entries.length>65535)throw Error('Too many ZIP entries');
  const records=[],directory=[];let offset=0;
  for(const {name,bytes} of entries){
    const filename=Buffer.from(name,'utf8'),compressed=deflateRawSync(bytes);
    if(filename.length>65535||offset+compressed.length>0xffffffff)throw Error('ZIP64 is required');
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);
    const checksum=crc32(bytes);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);
    central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    records.push(local,filename,compressed);directory.push(central,filename);offset+=local.length+filename.length+compressed.length;
  }
  const size=directory.reduce((sum,part)=>sum+part.length,0),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
  await writeFile(destination,Buffer.concat([...records,...directory,end]));
}
