// Offline ZIP import; no network requests, external libraries or remote image URLs.
const MAX_ARCHIVE=130*1024*1024,MAX_IMAGE=12*1024*1024,MAX_PIXELS=16777216;
const decoder=new TextDecoder('utf-8',{fatal:true});
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const fail=message=>{throw Error('画像ZIP: '+message);};
export async function readNpcZip(blob){
 if(!(blob instanceof Blob)||blob.size>MAX_ARCHIVE||blob.size<22)fail('ZIPは130MB以下にしてください');
 const data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer);
 const u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true);
 let footer=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)
  if(u32(i)===0x06054b50&&i+22+u16(i+20)===data.length){footer=i;break;}
 if(footer<0||u16(footer+4)||u16(footer+6))fail('標準ZIP形式ではありません');
 const count=u16(footer+10),size=u32(footer+12),offset=u32(footer+16);
 if(count===65535||size===0xffffffff||offset===0xffffffff||count<1||count>40||offset+size>footer)fail('ファイル数またはZIPサイズが不正です');
 const entries=new Map();let p=offset,total=0;
 for(let i=0;i<count;i++){
  if(p+46>offset+size||u32(p)!==0x02014b50)fail('ZIPのファイル一覧が破損しています');
  const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),packed=u32(p+20),raw=u32(p+24);
  const nameLen=u16(p+28),extra=u16(p+30),comment=u16(p+32),local=u32(p+42),end=p+46+nameLen+extra+comment;
  if(end>offset+size||flags&1||![0,8].includes(method))fail('暗号化または非対応のZIPです');
  const name=decoder.decode(data.subarray(p+46,p+46+nameLen));
  if(!/^[A-Za-z0-9_.-]+$/.test(name)||name==='.'||name==='..'||entries.has(name))fail('ファイル名が不正または重複しています');
  if(raw>MAX_IMAGE||packed>MAX_IMAGE||(total+=raw)>MAX_ARCHIVE)fail('画像または展開容量が大きすぎます');
  entries.set(name,{flags,method,crc,packed,raw,local});
  p=end;
 }
 if(p!==offset+size)fail('ZIPのファイル一覧が破損しています');
 return {names:[...entries.keys()],async read(name){
  const e=entries.get(name);if(!e)return null;
  const {local,method,packed,raw,crc,flags}=e;
  if(local+30>offset||u32(local)!==0x04034b50||u16(local+8)!==method||u16(local+6)!==flags)fail('ZIPの画像情報が破損しています');
  const nameLen=u16(local+26),start=local+30+nameLen+u16(local+28),end=start+packed;
  if(end>offset||decoder.decode(data.subarray(local+30,local+30+nameLen))!==name)fail('ZIPの画像位置が不正です');
  const packedBytes=data.subarray(start,end);let bytes;
  if(method===0)bytes=packedBytes;
  else{
   if(typeof DecompressionStream!=='function')fail('このブラウザは圧縮ZIPに未対応です');
   bytes=new Uint8Array(raw);let written=0;
   const reader=new Blob([packedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
   try{
    while(true){const {done,value}=await reader.read();if(done)break;
     if(written+value.length>raw)fail('ZIPの展開サイズが不正です');
     bytes.set(value,written);written+=value.length;
    }
   }finally{reader.releaseLock();}
   if(written!==raw)fail('ZIPの展開サイズが不正です');
  }
  if(bytes.length!==raw||crc32(bytes)!==crc)fail(name+' のチェックサムが一致しません');
  return bytes;
 }};
}
const png=b=>b.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
const webp=b=>b.length>=12&&String.fromCharCode(...b.subarray(0,4))==='RIFF'&&String.fromCharCode(...b.subarray(8,12))==='WEBP';
function rectangle(w,h,config){
 const columns=config.columns??1,rows=config.rows??1,frame=config.frame??0;
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>256||
    !Number.isInteger(frame)||frame<0||frame>=columns*rows||w%columns||h%rows)fail('スプライト分割設定が画像に合いません');
 return {x:frame%columns*(w/columns),y:Math.floor(frame/columns)*(h/rows),width:w/columns,height:h/rows};
}
export async function prepareNpcZip(blob,requiredIds,decodeImage=globalThis.createImageBitmap){
 if(typeof decodeImage!=='function')fail('この端末では画像を読み取れません');
 if(!Array.isArray(requiredIds)||requiredIds.length<1||new Set(requiredIds).size!==requiredIds.length)fail('キャラクター設定が不正です');
 const zip=await readNpcZip(blob),manifestBytes=await zip.read('npc-images.json');let members=null;
 if(manifestBytes){
  if(manifestBytes.length>65536)fail('設定ファイルが大きすぎます');
  try{const data=JSON.parse(decoder.decode(manifestBytes));if(data.schema!==1||!data.members||typeof data.members!=='object'||Array.isArray(data.members))throw Error();members=data.members;}catch{fail('npc-images.json が不正です');}
  if(Object.keys(members).length!==requiredIds.length||requiredIds.some(id=>!Object.hasOwn(members,id)))fail('全員分の設定が揃っていません');
 }
 const records=[];
 for(const id of requiredIds){
  const spec=members?members[id]:{};
  if(!spec||typeof spec!=='object'||Array.isArray(spec))fail(id+' の設定が不正です');
  const matches=zip.names.filter(n=>n===id+'.png'||n===id+'.webp');
  const filename=spec.file??(matches.length===1?matches[0]:null);
  if(typeof filename!=='string'||!([id+'.png',id+'.webp'].includes(filename))||!zip.names.includes(filename))fail(id+' の画像が見つかりません');
  const bytes=await zip.read(filename),type=filename.endsWith('.png')?'image/png':'image/webp';
  if(type==='image/png'?!png(bytes):!webp(bytes))fail(id+' はPNG/WebP画像ではありません');
  const image=new Blob([bytes],{type});
  let bitmap;
  try{
   bitmap=await decodeImage(image);
   const {width,height}=bitmap;
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_PIXELS)fail(id+' の画像が大きすぎます');
   records.push({id,blob:image,width,height,rect:rectangle(width,height,spec)});
  }catch(e){if(String(e?.message).startsWith('画像ZIP:'))throw e;fail(id+' の画像を開けません');}
  finally{bitmap?.close?.();}
 }
 return records;
}
