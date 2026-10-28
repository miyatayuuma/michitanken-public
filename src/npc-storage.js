import {validRect} from '../lib/npc.mjs';
const DB='michitanken-npc-images',STORE='images';
export function createNpcImageStore(indexedDB=globalThis.indexedDB){
 let dbPromise;
 function open(){if(!indexedDB)return Promise.reject(Error('IndexedDB unavailable'));if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('IndexedDB blocked'));}).catch(e=>{dbPromise=null;throw e;});return dbPromise;}
 async function transaction(mode,action){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);let result;try{const request=action(tx.objectStore(STORE));request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('Image storage failed'));});}
 async function putMany(records){
  if(!Array.isArray(records)||!records.length||new Set(records.map(r=>r.id)).size!==records.length)throw Error('画像ZIPの登録対象が不正です');
  for(const r of records){
   if(typeof r.id!=='string'||!r.id||!(r.blob instanceof Blob)||!['image/png','image/webp'].includes(r.blob.type)||r.blob.size>12*1024*1024||!validRect(r.rect,r.width,r.height))throw Error('ZIP内に不正な画像があります');
  }
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);
   tx.oncomplete=()=>resolve(records.length);
   tx.onabort=tx.onerror=()=>reject(tx.error||Error('画像ZIPを保存できませんでした'));
   try{for(const r of records)store.put({blob:r.blob,rect:r.rect,width:r.width,height:r.height},r.id);}
   catch(error){try{tx.abort();}catch{}reject(error);}
  });
 }
 return {putMany,get:id=>transaction('readonly',s=>s.get(id)),async put(id,blob,rect,width,height){if(!(blob instanceof Blob)||!['image/png','image/webp'].includes(blob.type)||blob.size>12*1024*1024||!validRect(rect,width,height))throw Error('PNG/WebPと画像内の正しい範囲を指定してください');return transaction('readwrite',s=>s.put({blob,rect,width,height},id));},delete:id=>transaction('readwrite',s=>s.delete(id)),async close(){if(dbPromise)(await dbPromise).close();dbPromise=null;}};
}
