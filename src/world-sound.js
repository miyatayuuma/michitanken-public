import {createBiomeGate} from '../lib/exploration-map.mjs';

// World ZIP audio is self-contained. The music files never leave the device.
export function createWorldSound(){
 const gate=createBiomeGate(),abort=new AbortController(),{signal}=abort;
 let config=null,audio=null,currentPath=null,error=null,activated=false,closed=false,muted=false,muteButton=null,playPending=false,playBlocked=false;
 try{muted=localStorage.getItem('michi-world-bgm-muted')==='1';}catch{}
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
   const credit=document.createElement('small');credit.textContent=' 音楽：甘茶の音楽工房';
   slot.append(credit);
  }
  sync();
 })().catch(e=>{error=e.message;});
 document.addEventListener('pointerdown',event=>{if(event.isTrusted)activate();},{capture:true,signal});
 document.addEventListener('keydown',event=>{if(event.isTrusted)activate();},{capture:true,signal});
 document.addEventListener('visibilitychange',sync,{signal});
 return {
  activate,
  update(biome,dt){gate.update(biome,dt);sync();},
  se(){return false;},
  snapshot:()=>({configured:!!config,activated,biome:gate.current,currentId:currentPath,volume:audio?.volume??0,paused:audio?.paused??true,error}),
  dispose(){closed=true;abort.abort();audio?.pause();audio?.removeAttribute('src');audio?.load();muteButton?.parentElement?.replaceChildren();}
 };
}
