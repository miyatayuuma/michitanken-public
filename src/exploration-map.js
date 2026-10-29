import {createMapTerrain} from './map-terrain.js';
import {MAP_MARKER,nearestMapPoint} from '../lib/map-marker.mjs';
import {canWarp} from '../lib/warp.mjs';
import {createExplorationMapStore} from '../lib/exploration-map.mjs';
import {createMapView} from '../lib/map-view.mjs';
import {iconButton,icon} from './notebook-ui.js';
export const MAP_ICONS={};
export async function createExplorationMap({container,registry,baseURL,onDiscover=()=>{},onSelect=()=>{},onWarp=()=>{},warps=null,npcGroups=[]}){
 const response=await fetch(baseURL+'data/exploration-map.json');if(!response.ok)throw Error('Map unavailable');const data=await response.json();
 if(data.schema!==1||!data.bounds||!Array.isArray(data.lines)||!Array.isArray(data.areas))throw Error('Invalid map');
 let storage;try{storage=localStorage;}catch{}
 const store=createExplorationMapStore({bounds:data.bounds,storage,ids:registry.points.map(p=>p.id)}),b=data.bounds;
 const panel=document.createElement('section');panel.id='exploration-map';panel.hidden=true;panel.setAttribute('aria-label','全体マップ');
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','北が上の地図。現在地と発見済みの地点');canvas.tabIndex=0;
 const label=document.createElement('output');label.id='map-selection';label.setAttribute('aria-live','polite');const confirm=document.createElement('button');confirm.id='map-warp';confirm.textContent='ここへいく';confirm.hidden=true;panel.append(canvas,label,confirm);container.append(panel);
 const title=document.createElement('h2');title.className='map-title';title.textContent='たんけん地図';
 const card=document.createElement('div');card.className='map-card paper';card.hidden=true;card.append(label,confirm);confirm.className='primary';
 const zoomBar=document.createElement('div');zoomBar.className='map-zoom';const minus=iconButton('minus','地図を縮小','map-minus'),plus=iconButton('plus','地図を拡大','map-plus'),zoomLabel=document.createElement('output');zoomLabel.setAttribute('aria-label','地図の倍率');zoomBar.append(minus,zoomLabel,plus);panel.append(title,card,zoomBar);
 // A meeting is recorded only after the player talks to that group. All
 // coordinates and discovered places are kept on this device, not uploaded.
 const npcKey='michitanken.npc.met.v1';
 const npcLocations=npcGroups.filter(g=>typeof g.groupId==='string'&&Array.isArray(g.spawnAnchor)&&g.spawnAnchor.length===2&&g.spawnAnchor.every(Number.isFinite));
 const npcById=new Map(npcLocations.map(g=>[g.groupId,g]));
 const npcMet=new Map();let npcCheat=new URLSearchParams(location.search).get('npcCheat')==='1';
 try{
  const saved=JSON.parse(storage?.getItem(npcKey)||'null');
  if(saved?.schema===1&&Array.isArray(saved.places))for(const p of saved.places){
   if(npcById.has(p.id)&&Number.isFinite(p.x)&&Number.isFinite(p.z))
    npcMet.set(p.id,{x:p.x,z:p.z});
  }
 }catch{}
 const cheatButton=document.createElement('button');cheatButton.type='button';
 cheatButton.id='npc-map-cheat';cheatButton.className='npc-map-cheat';
 cheatButton.setAttribute('aria-label','チートモード：全キャラの位置を表示');
 const updateCheatButton=()=>{cheatButton.textContent=npcCheat?'チート: 全員表示中':'チート: 全員表示';cheatButton.setAttribute('aria-pressed',String(npcCheat));};
 updateCheatButton();panel.append(cheatButton);
 cheatButton.onclick=()=>{npcCheat=!npcCheat;updateCheatButton();clearSelection();invalidate();};
 const view=createMapView();
 const ctx=canvas.getContext('2d');
 const terrain=createMapTerrain(data,store);
 // The raster owns visual detail now. Retain only compact biome cells, not parsed map geometry.
 const mapBytes=JSON.stringify(data).length;data.lines.length=0;data.areas.length=0;
 let cursorVisible=false;let busy=false,open=false,px=0,pz=0,cursor={x:.5,y:.5},selected=null,selectedNpc=null,changed=true,flushElapsed=0,closed=false,frame=0,drawMs=0,drawCount=0;
 const pulses=new Map();let w=1,h=1,side=1,left=0,top=0;
 function layout(){w=panel.clientWidth;h=panel.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);const header=Math.max(84,title.offsetTop+title.offsetHeight+12);side=Math.max(1,Math.min(w-28,h-header-106));left=(w-side)/2;top=header+(h-header-106-side)/2;view.layout(side,left,top);invalidate();}
 const inset=()=>Math.min(24,side*.2),fraction=()=>1-2*inset()/side;
 const position=p=>view.project(inset()/side+(p[0]-b.minX)/(b.maxX-b.minX)*fraction(),inset()/side+(p[2]-b.minZ)/(b.maxZ-b.minZ)*fraction());
 function invalidate(){if(open&&!closed&&!frame)frame=requestAnimationFrame(draw);}
 function draw(){frame=0;if(!open||closed)return;drawCount++;const start=performance.now(),v=view.snapshot(),origin=view.project(inset()/side,inset()/side);ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.rect(left,top,side,side);ctx.clip();if(changed){terrain.update();changed=false;}ctx.imageSmoothingEnabled=true;ctx.drawImage(terrain.canvas,origin.x,origin.y,side*fraction()*v.zoom,side*fraction()*v.zoom);

 for(const p of registry.points){if(!store.has(p.id))continue;const {x,y}=position(p.position);if(x<left||x>left+side||y<top||y>top+side)continue;const chosen=selected===p.id,available=canWarp(warps,store,p.id);
 ctx.fillStyle=available?'#245b4d':'#fff5df';ctx.strokeStyle=available?'#245b4d':'#71644e';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,MAP_MARKER.radius,0,Math.PI*2);ctx.fill();ctx.stroke();
 if(chosen){ctx.strokeStyle='#9b4b25';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,MAP_MARKER.selectedRadius,0,Math.PI*2);ctx.stroke();}
 }

 // Discovered NPC meeting spots remain visible; cheat mode reveals all spots.
 for(const g of npcLocations){
  const met=npcMet.get(g.groupId);
  if(!met&&!npcCheat)continue;
  const {x,y}=position(met?[met.x,0,met.z]:[g.spawnAnchor[0],0,g.spawnAnchor[1]]);
  if(x<left||x>left+side||y<top||y>top+side)continue;
  ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);
  ctx.fillStyle=met?'#e1ad45':'#b75c72';
  ctx.globalAlpha=met?1:.8;ctx.fill();
  ctx.lineWidth=1.5;ctx.strokeStyle='#303b35';ctx.stroke();
  ctx.fillStyle='#303b35';ctx.font='bold 10px system-ui';ctx.textAlign='center';
  ctx.fillText('★',x,y+3.3);ctx.textAlign='start';ctx.globalAlpha=1;
  if(selectedNpc===g.groupId){ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.strokeStyle='#9b4b25';ctx.lineWidth=2;ctx.stroke();}
 }
 const p=position([px,0,pz]);ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fillStyle='#9b4b25';ctx.fill();ctx.strokeStyle='#fff5df';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y-13);ctx.lineTo(p.x-4,p.y-7);ctx.lineTo(p.x+4,p.y-7);ctx.closePath();ctx.fill();
 if(cursorVisible){const {x,y}=view.project(cursor.x,cursor.y);ctx.strokeStyle='#9b4b25';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,23,0,Math.PI*2);ctx.moveTo(x-27,y);ctx.lineTo(x-17,y);ctx.moveTo(x+17,y);ctx.lineTo(x+27,y);ctx.stroke();}
 ctx.restore();ctx.strokeStyle='#71644e';ctx.lineWidth=1.5;ctx.strokeRect(left,top,side,side);ctx.fillStyle='#fff5df';ctx.fillRect(left+2,top+2,48,30);ctx.fillStyle='#303b35';ctx.font='bold 14px system-ui';ctx.fillText('N ↑',left+10,top+22);
 const scale=view.scale((b.maxX-b.minX)/fraction(),Math.min(80,w*.23));ctx.font='12px system-ui';ctx.fillText(scale.distance+'m',left,h-24);ctx.fillRect(left,h-18,scale.pixels,2);zoomLabel.textContent=Number(v.zoom.toFixed(1))+'×';minus.disabled=busy||v.zoom<=1;plus.disabled=busy||v.zoom>=4;drawMs=performance.now()-start;}
 const observer=new ResizeObserver(()=>{if(open)layout();});observer.observe(panel);
 function clearSelection(){const had=selected!==null||selectedNpc!==null;selected=null;selectedNpc=null;label.textContent='';confirm.hidden=true;card.hidden=true;if(had)invalidate();return had;}
 const categoryNames={park:'公園',shrine:'神社',temple:'寺院',bridge:'橋',water:'川・水辺',library:'図書館',school:'学校',hospital:'病院',fire_station:'消防署',civic:'公共施設',culture:'文化施設',station:'駅'};
 function select(activate=true){if(!open||busy)return null;const v=view.project(cursor.x,cursor.y);
 const nearest=nearestMapPoint(registry.points.filter(p=>store.has(p.id)).map(p=>({...p,...position(p.position)})),v,{left,top,side});
 const nearbyNpc=npcLocations
  .filter(g=>npcCheat||npcMet.has(g.groupId))
  .map(g=>{const met=npcMet.get(g.groupId),p=met?[met.x,0,met.z]:[g.spawnAnchor[0],0,g.spawnAnchor[1]];return {g,...position(p)};})
  .map(item=>({...item,distance:Math.hypot(item.x-v.x,item.y-v.y)}))
  .filter(item=>item.distance<=14)
  .sort((a,b)=>a.distance-b.distance)[0];
 if(nearbyNpc&&(!nearest||nearbyNpc.distance<=Math.hypot(nearest.x-v.x,nearest.y-v.y))){
  selected=null;selectedNpc=nearbyNpc.g.groupId;card.hidden=false;label.replaceChildren();
  const name=document.createElement('span'),detail=document.createElement('small');
  name.textContent=nearbyNpc.g.displayName||nearbyNpc.g.groupId;
  detail.textContent=npcMet.has(nearbyNpc.g.groupId)?'★ 出会った場所 · もう一度会いにいこう':'★ 未発見のキャラクター（チート表示）';
  label.append(name,detail);confirm.hidden=true;onSelect();invalidate();return selectedNpc;
 }
 selectedNpc=null;
 // Pointer selection is always separate from execution. Pad/keyboard requires a second press.
 if(activate&&nearest&&selected===nearest.id&&canWarp(warps,store,nearest.id)){onWarp(nearest.id);return selected;}
 selected=nearest?.id||null;card.hidden=!nearest;label.replaceChildren();
 if(nearest){const name=document.createElement('span'),detail=document.createElement('small');name.textContent=nearest.name;detail.textContent=(categoryNames[nearest.category]||'ランドマーク')+' · '+(canWarp(warps,store,nearest.id)?'ワープできます':'ワープできません');label.append(name,detail);}
 confirm.hidden=!nearest||!canWarp(warps,store,nearest.id);if(nearest)onSelect();invalidate();return selected;}
 confirm.addEventListener('click',()=>{if(open&&!busy&&selected&&canWarp(warps,store,selected))onWarp(selected);});
 function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 const pointers=new Map();let gesture=false,dragged=false,down=null;
 const center=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};};
 function zoom(value,anchor){if(busy)return;clearSelection();view.zoom(value,anchor?.x,anchor?.y);invalidate();}
 function zoomStep(delta){zoom(view.snapshot().zoom+delta);}
 minus.onclick=()=>zoomStep(-1);plus.onclick=()=>zoomStep(1);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(view.snapshot().zoom*Math.exp(-e.deltaY*.002),point(e));},{passive:false});
 canvas.addEventListener('pointerdown',e=>{if(busy||e.button>0)return;cursorVisible=false;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,point(e));if(pointers.size===1){down=point(e);dragged=false;gesture=false;}else{gesture=true;clearSelection();}e.preventDefault();});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||busy)return;const old=pointers.get(e.pointerId),q=point(e),before=pointers.size>=2?center():null;pointers.set(e.pointerId,q);if(pointers.size>=2){const after=center();zoom(view.snapshot().zoom*after.d/Math.max(1,before.d),before);view.pan(after.x-before.x,after.y-before.y);gesture=true;}else if(down){if(Math.hypot(q.x-down.x,q.y-down.y)>=8)dragged=true;if(dragged){clearSelection();view.pan(q.x-old.x,q.y-old.y);invalidate();}}e.preventDefault();});
 function end(e,cancel=false){if(!pointers.has(e.pointerId))return;const q=point(e);pointers.delete(e.pointerId);if(!cancel&&!gesture&&!dragged&&down){cursor=view.inverse(q.x,q.y);select(false);}if(!pointers.size){down=null;gesture=false;}else{down=null;gesture=true;}}
 canvas.addEventListener('pointerup',e=>end(e));canvas.addEventListener('pointercancel',e=>end(e,true));canvas.addEventListener('lostpointercapture',e=>end(e,true));
 function recordNpcMeet(group){
  const g=npcById.get(group?.groupId);
  if(!g||npcMet.has(g.groupId))return false;
  npcMet.set(g.groupId,{x:g.spawnAnchor[0],z:g.spawnAnchor[1]});
  try{storage?.setItem(npcKey,JSON.stringify({schema:1,places:[...npcMet].map(([id,p])=>({id,x:p.x,z:p.z}))}));}catch{}
  invalidate();return true;
 }
 return {store,zoomStep,cancel:clearSelection,recordNpcMeet,setBusy(value){busy=value;confirm.disabled=value;confirm.innerHTML=value?icon('busy'):'ここへいく';confirm.setAttribute('aria-busy',String(value));invalidate();},failure(){card.hidden=false;label.textContent='！いどうできませんでした';},setOpen(value){clearSelection();open=value;panel.hidden=!value;cancelAnimationFrame(frame);frame=0;if(value){view.reset();cursorVisible=false;layout();cursor=view.inverse(position([px,0,pz]).x,position([px,0,pz]).y);cancelAnimationFrame(frame);frame=0;draw();canvas.focus();}else store.flush();},move(input,dt){if(open&&!busy&&(input.moveX||input.moveY)){clearSelection();cursorVisible=true;view.pan(-input.moveX*dt*side*.65,-input.moveY*dt*side*.65);const v=view.snapshot();if(v.zoom>1)cursor=view.inverse(left+side/2,top+side/2);if(v.zoom===1){cursor.x=Math.max(0,Math.min(1,cursor.x+input.moveX*dt*.55));cursor.y=Math.max(0,Math.min(1,cursor.y+input.moveY*dt*.55));}invalidate();}},select,

 update(x,z,dt,walking=true){if(closed)return;const moved=x!==px||z!==pz;px=x;pz=z;if(moved)invalidate();if(walking){changed=store.reveal(x,z)||changed;for(const p of registry.points)if(Math.hypot(p.position[0]-x,p.position[2]-z)<=75&&store.discover(p.id)){pulses.set(p.id,performance.now());onDiscover(p);}}if(changed)invalidate();flushElapsed+=dt;if(flushElapsed>1){store.flush();flushElapsed=0;}},
 isFound:id=>store.has(id),pulse:id=>{const t=pulses.get(id);if(t===undefined)return 0;const elapsed=performance.now()-t;if(elapsed>650){pulses.delete(id);return 0;}return 1-elapsed/650;},
 biomeAt(x,z){const v=data.biomes,c=Math.floor((x-b.minX)/v.step),r=Math.floor((z-b.minZ)/v.step);return ['urban','grassland','woodland','waterside'][c>=0&&c<v.cols&&r>=0&&r<v.rows?+v.cells[r*v.cols+c]:0];},
 snapshot:()=>({...store.snapshot(),open,selected,selectedNpc,npcMet:[...npcMet.keys()],npcCheat,npcCount:npcLocations.length,cursor:{...cursor},view:view.snapshot(),marker:MAP_MARKER,points:registry.points.filter(p=>store.has(p.id)).map(p=>({id:p.id,...position(p.position)})),drawMs,drawCount,canvasPixels:canvas.width*canvas.height,basePixels:terrain.pixels,terrainStyle:'A',terrainUpdates:terrain.updates,mapBytes,warpEnabled:!!warps?.enabled,unlocked:registry.points.filter(p=>canWarp(warps,store,p.id)).map(p=>p.id),busy}),dispose(){closed=true;store.flush();cancelAnimationFrame(frame);observer.disconnect();panel.remove();terrain.dispose();}};
}
