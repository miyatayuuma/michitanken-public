import {validateWorldPack,createWorldPackStore} from './world-pack.js';

const store=createWorldPackStore(),base=new URL(import.meta.env.BASE_URL,location.origin);
const root=document.createElement('section');
root.style.cssText='position:fixed;inset:0;z-index:10000;background:#fff8e8;display:grid;place-items:center;padding:1em;font:16px sans-serif';
const box=document.createElement('div');box.style.cssText='max-width:32rem;line-height:1.6';
const title=document.createElement('h1');title.textContent='みちたんけん';
const status=document.createElement('p');status.setAttribute('role','status');
const label=document.createElement('label');label.textContent='自分のワールドZIPを選ぶ ';
const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';label.append(input);
const demo=document.createElement('button');demo.textContent='架空の街で遊ぶ';
const erase=document.createElement('button');erase.textContent='端末のワールドパックだけ削除';
const back=document.createElement('button');back.textContent='もどる';back.hidden=true;
const controls=document.createElement('div');controls.append(label,document.createElement('br'),demo,erase,back);
box.append(title,status,controls);root.append(box);document.body.append(root);
// Keep world switching available, but never cover the walking/run controls.
const button=document.createElement('button');
button.id='world-open';button.type='button';button.className='paper';
button.textContent='ワールドを変更';
button.onclick=()=>{
 document.querySelector('#menu-close')?.click();
 root.hidden=false;root.style.display='grid';
};
document.querySelector('#notebook-menu').insertBefore(button,document.querySelector('#standalone-audio'));
let current=null,started=false;
const hide=()=>{root.hidden=true;root.style.display='none';};
back.onclick=hide;
const contentType=name=>name.endsWith('.json')?'application/json':name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':name.endsWith('.glb')?'model/gltf-binary':name.endsWith('.ogg')?'audio/ogg':name.endsWith('.mp3')?'audio/mpeg':name.endsWith('.wav')?'audio/wav':'application/octet-stream';
const originalFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async function(resource,options){
 const request=resource instanceof Request?resource:null;
 const url=new URL(request?request.url:String(resource),location.href);
 if(current&&url.origin!==base.origin&&url.protocol!=='blob:')return new Response('',{status:403});
 if(current&&url.origin===base.origin&&url.pathname.startsWith(base.pathname)){
  const path=decodeURIComponent(url.pathname.slice(base.pathname.length));
  if(path.startsWith('data/')||path.startsWith('assets/')){
   const bytes=current.files.get(path);
   return bytes?new Response(bytes,{status:200,headers:{'Content-Type':contentType(path)}}):new Response('',{status:404});
  }
 }
 return originalFetch(resource,options);
};
const objectURLs=new Map();
globalThis.michiWorldActive=()=>!!current;
globalThis.michiWorldPackId=()=>current?.manifest?.packId||'demo';
globalThis.michiWorldAsset=path=>{
 if(!current)return null;
 const bytes=current.files.get(path);if(!bytes)return null;
 if(!objectURLs.has(path))objectURLs.set(path,URL.createObjectURL(new Blob([bytes],{type:contentType(path)})));
 return objectURLs.get(path);
};
async function start(){hide();if(!started){started=true;back.hidden=false;await import('./main.js');}}
async function load(blob){status.textContent='ZIPを確認しています…';const parsed=await validateWorldPack(blob);return parsed;}
input.onchange=async()=>{
 const blob=input.files?.[0];if(!blob)return;input.disabled=true;
 try{const candidate=await load(blob);await store.put(blob);current=candidate;status.textContent='保存しました。';if(started)location.reload();else await start();}
 catch(e){status.textContent='読み込めませんでした。ZIPと端末の空き容量を確認してください。';console.error(e);}
 finally{input.disabled=false;input.value='';}
};
demo.onclick=async()=>{current=null;if(started){sessionStorage.setItem('michi-demo-once','1');location.reload();}else await start();};
erase.onclick=async()=>{if(!confirm('この端末のワールドパックだけを削除します。探索のセーブは残ります。'))return;try{await store.delete();current=null;status.textContent='パックを削除しました。';if(started)location.reload();}catch{status.textContent='パックを削除できませんでした。';}};
try{const demoOnce=sessionStorage.getItem('michi-demo-once');sessionStorage.removeItem('michi-demo-once');const saved=demoOnce?null:await store.get();if(saved){current=await load(saved);status.textContent='保存済みのワールドを読み込みました。';await start();}
else if(new URLSearchParams(location.search).has('test'))await start();
else status.textContent='ZIPを選ぶか、架空の街をお試しください。';}
catch(e){status.textContent='保存済みパックを開けません。ZIPを選び直してください。';console.error(e);}
