import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {prepareNpcZip,readNpcZip} from '../src/npc-zip.js';

const IDS=['king','cat','kiki','jiji','skipper','twin-1','twin-2','zorori','ishishi','noshishi'];
const PNG=Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]);
const table=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const v of b)c=table[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
function zip(files,method=0){
 const local=[],central=[];let offset=0;
 for(const [name,value] of Object.entries(files)){
  const nameBytes=Buffer.from(name),raw=Buffer.from(value),packed=method?deflateRawSync(raw):raw,checksum=crc(raw);
  const a=Buffer.alloc(30);a.writeUInt32LE(0x04034b50);a.writeUInt16LE(20,4);a.writeUInt16LE(method,8);
  a.writeUInt32LE(checksum,14);a.writeUInt32LE(packed.length,18);a.writeUInt32LE(raw.length,22);a.writeUInt16LE(nameBytes.length,26);
  const b=Buffer.alloc(46);b.writeUInt32LE(0x02014b50);b.writeUInt16LE(20,4);b.writeUInt16LE(20,6);b.writeUInt16LE(method,10);
  b.writeUInt32LE(checksum,16);b.writeUInt32LE(packed.length,20);b.writeUInt32LE(raw.length,24);b.writeUInt16LE(nameBytes.length,28);b.writeUInt32LE(offset,42);
  local.push(a,nameBytes,packed);central.push(b,nameBytes);offset+=a.length+nameBytes.length+packed.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);
 end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);
 end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return new Blob([Buffer.concat([...local,dir,end])],{type:'application/zip'});
}
const files=()=>Object.fromEntries(IDS.map(id=>[id+'.png',PNG]));
const bitmap=async()=>({width:160,height:160,close(){}});
test('plain ZIP with ten named images imports without pixel inputs',async()=>{
 const items=await prepareNpcZip(zip(files()),IDS,bitmap);
 assert.equal(items.length,10);
 assert.deepEqual(items[0].rect,{x:0,y:0,width:160,height:160});
 assert.equal(items[9].id,'noshishi');
});
test('manifest uses grid dimensions and auto-selects first frame',async()=>{
 const entries=files(),members=Object.fromEntries(IDS.map(id=>[id,{file:id+'.png',columns:4,rows:4,frame:id==='kiki'?5:0}]));
 entries['npc-images.json']=Buffer.from(JSON.stringify({schema:1,members}));
 const items=await prepareNpcZip(zip(entries),IDS,bitmap);
 assert.deepEqual(items.find(x=>x.id==='kiki').rect,{x:40,y:40,width:40,height:40});
});
test('common deflate ZIP is supported',async()=>{
 const prepared=await prepareNpcZip(zip(files(),8),IDS,bitmap);
 assert.equal(prepared.length,10);
});
test('missing member, invalid grid and traversal paths are rejected',async()=>{
 const broken=files();delete broken['jiji.png'];
 await assert.rejects(prepareNpcZip(zip(broken),IDS,bitmap),/jiji/);
 const entries=files(),members=Object.fromEntries(IDS.map(id=>[id,{file:id+'.png'}]));
 members.kiki={file:'kiki.png',columns:3,rows:2,frame:0};
 entries['npc-images.json']=Buffer.from(JSON.stringify({schema:1,members}));
 await assert.rejects(prepareNpcZip(zip(entries),IDS,bitmap),/分割/);
 await assert.rejects(readNpcZip(zip({'../king.png':PNG})),/ファイル名/);
});
test('corrupted PNG bytes and ZIP checksums reject import',async()=>{
 const filesWithInvalid=files();filesWithInvalid['king.png']=Buffer.from('not a PNG');
 await assert.rejects(prepareNpcZip(zip(filesWithInvalid),IDS,bitmap),/PNG/);
 const z=zip(files()),buffer=Buffer.from(await z.arrayBuffer());
 // Flip first local file payload after its 30-byte header and filename.
 buffer[30+'king.png'.length+9]^=1;
 await assert.rejects(prepareNpcZip(new Blob([buffer]),IDS,bitmap),/チェックサム/);
});
