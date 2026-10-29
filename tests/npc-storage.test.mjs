import test from 'node:test';import assert from 'node:assert/strict';import {createNpcImageStore} from '../src/npc-storage.js';
function fakeIndexedDB(){const map=new Map();return {open(){const r={result:{createObjectStore(){},close(){},transaction(){const tx={objectStore(){return {get(key){return request(()=>map.get(key),tx);},put(value,key){return request(()=>map.set(key,value),tx);},delete(key){return request(()=>map.delete(key),tx);}}}};return tx;}}};queueMicrotask(()=>{r.onupgradeneeded();r.onsuccess();});return r;}};}
function request(fn,tx){tx.pending=(tx.pending||0)+1;const r={};queueMicrotask(()=>{r.result=fn();r.onsuccess?.();if(--tx.pending===0)tx.oncomplete?.();});return r;}
test('images survive store instances, can be replaced and deleted',async()=>{const db=fakeIndexedDB(),a=createNpcImageStore(db),b=createNpcImageStore(db),rect={x:0,y:1,width:2,height:2};const image=new Blob(['a'],{type:'image/png'});await a.put('kiki',image,rect,3,3);assert.equal((await b.get('kiki')).blob.size,1);await b.put('kiki',new Blob(['bbb'],{type:'image/webp'}),rect,3,3);assert.equal((await a.get('kiki')).blob.size,3);await b.delete('kiki');assert.equal(await a.get('kiki'),undefined);await a.close();await b.close();});
test('invalid format and out-of-bounds frame never reach storage',async()=>{const a=createNpcImageStore(fakeIndexedDB());await assert.rejects(a.put('jiji',new Blob(['x'],{type:'image/jpeg'}),{x:0,y:0,width:1,height:1},1,1));await assert.rejects(a.put('jiji',new Blob(['x'],{type:'image/png'}),{x:0,y:0,width:2,height:1},1,1));assert.equal(await a.get('jiji'),undefined);});

test('a single transaction registers the full 10-person ZIP pack',async()=>{
 const db=fakeIndexedDB(),store=createNpcImageStore(db);
 const ids=['king','cat','kiki','jiji','skipper','twin-1','twin-2','zorori','ishishi','noshishi'];
 const items=ids.map(id=>({id,blob:new Blob(['sprite'],{type:'image/png'}),rect:{x:0,y:0,width:10,height:10},width:10,height:10}));
 assert.equal(await store.putMany(items),10);
 for(const id of ids)assert.equal((await store.get(id)).rect.width,10);
 await store.close();
});
test('invalid ZIP member prevents batch changes',async()=>{
 const store=createNpcImageStore(fakeIndexedDB()),good={id:'king',blob:new Blob(['ok'],{type:'image/png'}),rect:{x:0,y:0,width:2,height:2},width:2,height:2};
 await assert.rejects(store.putMany([good,{...good,id:'jiji',rect:{x:0,y:0,width:4,height:4}}]));
 assert.equal(await store.get('king'),undefined);
 await store.close();
});
