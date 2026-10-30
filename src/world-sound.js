import {createBiomeGate} from '../lib/exploration-map.mjs';

// World ZIP audio is self-contained. The music files never leave the device.
export function createWorldSound(){
 const gate=createBiomeGate(),abort=new AbortController(),{signal}=abort;
 let config=null,audio=null,seAudio=null,currentPath=null,error=null,activated=false,closed=false,muted=false,seMuted=false,muteButton=null,seButton=null,credit=null,playPending=false,playBlocked=false;
 const seCooldown=new Map();
 try{muted=localStorage.getItem('michi-world-bgm-muted')==='1';}catch{}
 try{seMuted=localStorage.getItem('michi-world-se-muted')==='1';}catch{}
 const clamp=n=>Number.isFinite(n)?Math.min(1,Math.max(0,n)):0.08;
 function sync(force=false){
  if(closed)return;
  if(!activated||document.hidden||muted){audio?.pause();return;}
  const item=config?.worldBgm?.[gate.current];
  if(!item||typeof item.path!=='string'||!/^assets\/bgm\/[A-Za-z0-9_-]+\.mp3$/.test(item.path))return;
  if(currentPath!==item.path){
   const url=globalThis.michiWorldAsset?.(item.path);
   if(!url){error='ワールドZIP内にBGMがありません: '+item.path;return;}
   audio?.pause();audio?.removeAttribute('src');audio?.load();
   audio=new Audio(url);audio.loop=true;audio.preload='metadata';
   audio.volume=clamp(item.gain);
   audio.addEventListener('error',()=>{error='BGMを再生できませんでした';playBlocked=true;},{signal});
   currentPath=item.path;playBlocked=false;
  }
  if(audio?.paused&&!playPending&&(!playBlocked||force)){
   playPending=true;
   void audio.play().then(()=>{playBlocked=false;error=null;}).catch(e=>{playBlocked=true;error=e?.message||'BGM再生が許可されませんでした';}).finally(()=>{playPending=false;});
  }
 }
 function activate(){if(closed)return;activated=true;void ready.then(()=>sync(true));}
 const ready=(async()=>{
  const response=await fetch(import.meta.env.BASE_URL+'data/sound.json');
  if(!response.ok)throw Error('ワールド音楽設定がありません');
  const parsed=await response.json();
  if(!parsed||typeof parsed.worldBgm!=='object'||!parsed.worldBgm)throw Error('ワールド音楽設定が不正です');
  config=parsed;
  const slot=document.querySelector('#standalone-audio');
  if(slot){
   muteButton=document.createElement('button');muteButton.type='button';muteButton.className='paper';
   const label=()=>{muteButton.textContent=muted?'BGM：オフ':'BGM：オン';};
   label();
   muteButton.onclick=()=>{muted=!muted;try{localStorage.setItem('michi-world-bgm-muted',muted?'1':'0');}catch{}label();sync(true);};
   slot.append(muteButton);
   seButton=document.createElement('button');seButton.type='button';seButton.className='paper';
   const labelSE=()=>{seButton.textContent=seMuted?'効果音：オフ':'効果音：オン';};
   labelSE();seButton.onclick=()=>{seMuted=!seMuted;try{localStorage.setItem('michi-world-se-muted',seMuted?'1':'0');}catch{}labelSE();if(seMuted)seAudio?.pause();};
   slot.append(seButton);
   credit=document.createElement('small');credit.textContent=' 音楽：甘茶の音楽工房';
   slot.append(credit);
  }
  sync();
 })().catch(e=>{error=e.message;});
 document.addEventListener('pointerdown',event=>{if(event.isTrusted)activate();},{capture:true,signal});
 document.addEventListener('keydown',event=>{if(event.isTrusted)activate();},{capture:true,signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)seAudio?.pause();sync();},{signal});
 function se(kind){
  if(closed||!activated||document.hidden||seMuted)return false;
  const entry=config?.se?.[kind],path=typeof entry==='string'?entry:entry?.path;
  if(typeof path!=='string'||!/^assets\/(?:se|michi-se)\/[A-Za-z0-9_-]+\.(?:ogg|mp3|wav)$/.test(path))return false;
  const now=performance.now();
  if(now-(seCooldown.get(kind)??-Infinity)<250)return false;
  const url=globalThis.michiWorldAsset?.(path);
  if(!url){error='ワールドZIP内に効果音がありません: '+path;return false;}
  seCooldown.set(kind,now);
  if(seAudio){seAudio.pause();seAudio.removeAttribute('src');seAudio.load();}
  seAudio=new Audio(url);seAudio.preload='none';seAudio.volume=clamp(typeof entry==='object'?entry.gain:0.22);
  void seAudio.play().catch(()=>{});
  return true;
 }
 return {
  activate,
  update(biome,dt){gate.update(biome,dt);sync();},
  se,
  snapshot:()=>({configured:!!config,activated,biome:gate.current,currentId:currentPath,volume:audio?.volume??0,paused:audio?.paused??true,seConfigured:Object.keys(config?.se||{}).length,seMuted,error}),
  dispose(){closed=true;abort.abort();audio?.pause();audio?.removeAttribute('src');audio?.load();seAudio?.pause();seAudio?.removeAttribute('src');muteButton?.remove();seButton?.remove();credit?.remove();}
 };
}
