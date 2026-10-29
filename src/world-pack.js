// Data-only world pack validation. Nothing from an archive is executed.
const LIMIT=512*1024*1024, ENTRY=64*1024*1024, COUNT=1000;
const decoder=new TextDecoder('utf-8',{fatal:true});
const safe=n=>typeof n==='string' && /^(?:data|assets)\/[A-Za-z0-9_.\/-]+$/.test(n) && !n.split('/').some(x=>!x||x==='.'||x==='..');
const fail=()=>{throw Error('ワールドZIPが不正か、対応していません');};
const hex=buf=>Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,'0')).join('');
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
export async function validateWorldPack(blob){
 if(!(blob instanceof Blob)||blob.size<22||blob.size>LIMIT)fail();
 const b=new Uint8Array(await blob.arrayBuffer()),v=new DataView(b.buffer);
 const u16=i=>v.getUint16(i,true),u32=i=>v.getUint32(i,true);
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--){if(u32(i)===0x06054b50&&i+22+u16(i+20)===b.length){end=i;break;}}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))fail();
 const count=u16(end+10),size=u32(end+12),offset=u32(end+16);
 if(!count||count>COUNT||offset+size!==end)fail();
 const files=new Map(),ranges=[];let p=offset,total=0;
 for(let i=0;i<count;i++){
  if(p+46>end||u32(p)!==0x02014b50)fail();
  const made=u16(p+4),flags=u16(p+8),method=u16(p+10),crc=u32(p+16),packed=u32(p+20),raw=u32(p+24),nl=u16(p+28),extra=u16(p+30),comment=u16(p+32),disk=u16(p+34),attr=u32(p+38),local=u32(p+42),next=p+46+nl+extra+comment;
  if(next>end||flags&1||flags&8||method!==0||disk||packed!==raw||raw>ENTRY||(total+=raw)>LIMIT||((made>>>8)===3&&((attr>>>16)&0xf000)===0xa000))fail();
  const name=decoder.decode(b.subarray(p+46,p+46+nl));
  if((name!=='manifest.json'&&!safe(name))||files.has(name))fail();
  if(local+30>offset||u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method||u32(local+14)!==crc||u32(local+18)!==packed||u32(local+22)!==raw)fail();
  const ln=u16(local+26),start=local+30+ln+u16(local+28),finish=start+raw;
  if(finish>offset||decoder.decode(b.subarray(local+30,local+30+ln))!==name||crc32(b.subarray(start,finish))!==crc)fail();
  ranges.push([local,finish]);files.set(name,b.subarray(start,finish));p=next;
 }
 if(p!==end)fail();ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])fail();
 let manifest;try{manifest=JSON.parse(decoder.decode(files.get('manifest.json')));}catch{fail();}
 if(manifest?.schemaVersion!==1||manifest.gameId!=='michitanken'||typeof manifest.packId!=='string'||!manifest.packId||!Array.isArray(manifest.files)||manifest.files.length!==files.size-1)fail();
 const seen=new Set();for(const e of manifest.files){
  if(!safe(e.path)||seen.has(e.path)||!files.has(e.path)||!Number.isSafeInteger(e.size)||e.size!==files.get(e.path).length||!/^[a-f0-9]{64}$/.test(e.sha256))fail();
  seen.add(e.path);if(hex(await crypto.subtle.digest('SHA-256',files.get(e.path)))!==e.sha256)fail();
 }
 for(const n of ['data/tiles.json','data/field.json','data/site-config.json'])if(!seen.has(n))fail();
 return {manifest,files};
}
export function createWorldPackStore(indexedDB=globalThis.indexedDB){
 const open=()=>new Promise((resolve,reject)=>{if(!indexedDB){reject(Error('IndexedDB unavailable'));return;}const r=indexedDB.open('michitanken-world-pack',1);r.onupgradeneeded=()=>r.result.createObjectStore('packs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('IndexedDB blocked'));});
 const run=async(mode,action)=>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('packs',mode),request=action(tx.objectStore('packs'));let value;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||Error('保存できませんでした'));});}finally{db.close();}};
 return {get:()=>run('readonly',s=>s.get('active')),put:async blob=>{await validateWorldPack(blob);return run('readwrite',s=>s.put(blob,'active'));},delete:()=>run('readwrite',s=>s.delete('active'))};
}
