import {createBiomeGate} from '../lib/exploration-map.mjs';
/** Uses DreamCore's exact settings and BgmPlayer. At most two streamed BGM elements. */
export function createMichiSound(){
 const gate=createBiomeGate();let config=null,player=null,activated=false,closed=false,lastBiome=null,error=null,pending=false,settings=null,seAudio=null,unbind=null;
 const cooldown=new Map(),abort=new AbortController(),{signal}=abort;
 const base=import.meta.env.BASE_URL;
 const ready=(async()=>{const r=await fetch(base+'data/sound.json');if(!r.ok)return;config=await r.json();
  const moduleURL=new URL(config.playerModule,location.origin);if(moduleURL.origin!==location.origin)throw Error('External player refused');
  const m=await import(/* @vite-ignore */ moduleURL.href);settings=globalThis.DreamcoreAudio;if(!settings)throw Error('DreamcoreAudio unavailable');player=new m.BgmPlayer();
 })().catch(e=>{error=e.message;});
 async function sync(){if(pending||closed||!player||!activated||document.hidden||!config)return;if(settings.gain('bgm')===0){if(lastBiome!==null){player.stop({fadeMs:0});lastBiome=null;}return;}const id=config.biomes[gate.current];if(!id||lastBiome===id)return;pending=true;try{if(await player.play(id,{fadeMs:850}))lastBiome=id;}finally{pending=false;}}
 function activate(){if(closed)return;activated=true;void ready.then(sync);}
 document.addEventListener('pointerdown',e=>{if(e.isTrusted)activate();},{capture:true,signal});
 document.addEventListener('keydown',e=>{if(e.isTrusted)activate();},{capture:true,signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){player?.stop({fadeMs:0});seAudio?.pause();lastBiome=null;}else if(activated)void sync();},{signal});
 return {activate,update(biome,dt){gate.update(biome,dt);void sync();},se(kind){if(!activated||document.hidden||!settings||settings.gain('se')<=0||!config?.se?.[kind])return false;const now=performance.now();if(now-(cooldown.get(kind)??-Infinity)<250)return false;if(seAudio&&!seAudio.paused&&kind!=='discover')return false;cooldown.set(kind,now);unbind?.();seAudio?.pause();seAudio?.removeAttribute('src');seAudio?.load();seAudio=new Audio(new URL(config.se[kind],location.origin).href);seAudio.preload='none';unbind=settings.bindMedia(seAudio,'se',.22);void seAudio.play().catch(()=>{});return true;},snapshot:()=>({activated,biome:gate.current,currentId:player?.currentId||null,retiring:player?.retiring.size||0,mediaCount:player?(player.currentAudio?1:0)+player.retiring.size:0,volume:player?.currentAudio?.volume??0,paused:player?.currentAudio?.paused??true,currentTime:player?.currentAudio?.currentTime??0,readyState:player?.currentAudio?.readyState??0,bufferedSeconds:player?.currentAudio?.buffered?.length?player.currentAudio.buffered.end(player.currentAudio.buffered.length-1):0,seVolume:seAudio?.volume??null,error,configured:!!config}),dispose(){closed=true;abort.abort();player?.destroy();unbind?.();seAudio?.pause();seAudio?.removeAttribute('src');}};
}
