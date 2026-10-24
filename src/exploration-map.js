import {canWarp} from '../lib/warp.mjs';
import {createExplorationMapStore} from '../lib/exploration-map.mjs';
import {createMapView} from '../lib/map-view.mjs';
import {ICONS,iconButton,icon} from './notebook-ui.js';
export const MAP_ICONS={};
export async function createExplorationMap({container,registry,baseURL,onDiscover=()=>{},onSelect=()=>{},onWarp=()=>{},warps=null}){
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
 const view=createMapView();
 const ctx=canvas.getContext('2d'),base=document.createElement('canvas'),fog=document.createElement('canvas'),images={};base.width=base.height=1000;fog.width=store.cols;fog.height=store.rows;
 const g=base.getContext('2d');g.fillStyle='#eddfb7';g.fillRect(0,0,1000,1000);
 const project=p=>[(p[0]-b.minX)/(b.maxX-b.minX)*1000,(p[1]-b.minZ)/(b.maxZ-b.minZ)*1000];
 const ring=points=>{points.forEach((p,i)=>{const [x,y]=project(p);i?g.lineTo(x,y):g.moveTo(x,y);});g.closePath();};
 for(const a of data.areas){g.beginPath();ring(a.ring);for(const h of a.holes||[])ring(h);g.fillStyle={wood:'#a1b282',green:'#c2ce93',water:'#8ebfc3'}[a.kind];g.fill('evenodd');}
 for(const kind of ['river','road'])for(const l of data.lines.filter(l=>l.kind===kind)){g.beginPath();l.points.forEach((p,i)=>{const [x,y]=project(p);i?g.lineTo(x,y):g.moveTo(x,y);});g.lineWidth=Math.max(kind==='river'?2:1,(l.width||4)*1000/(b.maxX-b.minX));g.strokeStyle=kind==='river'?'#7bb2bd':'#faf2dc';g.lineCap='round';g.stroke();}
 for(const [k,url] of Object.entries(MAP_ICONS)){const im=new Image();im.src=url;images[k]=im;}
 // The raster owns visual detail now. Retain only compact biome cells, not parsed map geometry.
 const mapBytes=JSON.stringify(data).length;data.lines.length=0;data.areas.length=0;
 let cursorVisible=false;let busy=false,open=false,px=0,pz=0,cursor={x:.5,y:.5},selected=null,changed=true,flushElapsed=0,closed=false,frame=0,drawMs=0;
 const pulses=new Map();let w=1,h=1,side=1,left=0,top=0;
 function layout(){w=panel.clientWidth;h=panel.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);const header=Math.max(84,title.offsetTop+title.offsetHeight+12);side=Math.max(1,Math.min(w-28,h-header-106));left=(w-side)/2;top=header+(h-header-106-side)/2;view.layout(side,left,top);}
 const inset=()=>Math.min(24,side*.2),fraction=()=>1-2*inset()/side;
 const position=p=>view.project(inset()/side+(p[0]-b.minX)/(b.maxX-b.minX)*fraction(),inset()/side+(p[2]-b.minZ)/(b.maxZ-b.minZ)*fraction());
 function fogUpdate(){const f=fog.getContext('2d');f.clearRect(0,0,store.cols,store.rows);f.fillStyle='#e5ebeb';for(let r=0;r<store.rows;r++)for(let c=0;c<store.cols;c++)if(!store.cells[r*store.cols+c])f.fillRect(c,r,1,1);changed=false;}
 function draw(){const start=performance.now(),v=view.snapshot(),origin=view.project(inset()/side,inset()/side);ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.rect(left,top,side,side);ctx.clip();ctx.drawImage(base,origin.x,origin.y,side*fraction()*v.zoom,side*fraction()*v.zoom);if(changed)fogUpdate();ctx.imageSmoothingEnabled=true;ctx.drawImage(fog,origin.x,origin.y,side*fraction()*v.zoom,side*fraction()*v.zoom);
 const labelBoxes=[];
 for(const p of registry.points){if(!store.has(p.id))continue;const {x,y}=position(p.position);if(x<left-20||x>left+side+20||y<top-20||y>top+side+20)continue;const chosen=selected===p.id;ctx.fillStyle='#fff5df';ctx.strokeStyle=chosen?'#9b4b25':canWarp(warps,store,p.id)?'#245b4d':'#71644e';ctx.lineWidth=chosen?4:2;ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fill();ctx.stroke();if(chosen){ctx.beginPath();ctx.arc(x,y,21,0,Math.PI*2);ctx.lineWidth=1;ctx.stroke();}
 ctx.save();ctx.translate(x-11,y-11);ctx.scale(22/24,22/24);ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(new Path2D(ICONS[p.category]||ICONS.flag));ctx.restore();
 // Labels only when they fit; the selection card always exposes the full name.
 if(v.zoom>=2||chosen){ctx.font='12px system-ui';const text=p.name.length>14?p.name.slice(0,13)+'…':p.name,tw=ctx.measureText(text).width;const box={x:x-tw/2-3,y:y+21,w:tw+6,h:19};if(box.x>=left&&box.x+box.w<=left+side&&box.y+box.h<=top+side&&!labelBoxes.some(q=>box.x<q.x+q.w+4&&box.x+box.w+4>q.x&&box.y<q.y+q.h&&box.y+box.h>q.y)){ctx.fillStyle='#fff5df';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.fillStyle='#303b35';ctx.fillText(text,x-tw/2,y+35);labelBoxes.push(box);}}
 }
 const p=position([px,0,pz]);ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fillStyle='#9b4b25';ctx.fill();ctx.strokeStyle='#fff5df';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y-13);ctx.lineTo(p.x-4,p.y-7);ctx.lineTo(p.x+4,p.y-7);ctx.closePath();ctx.fill();
 if(cursorVisible){const {x,y}=view.project(cursor.x,cursor.y);ctx.strokeStyle='#9b4b25';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,23,0,Math.PI*2);ctx.moveTo(x-27,y);ctx.lineTo(x-17,y);ctx.moveTo(x+17,y);ctx.lineTo(x+27,y);ctx.stroke();}
 ctx.restore();ctx.strokeStyle='#71644e';ctx.lineWidth=1.5;ctx.strokeRect(left,top,side,side);ctx.fillStyle='#fff5df';ctx.fillRect(left+2,top+2,48,30);ctx.fillStyle='#303b35';ctx.font='bold 14px system-ui';ctx.fillText('N ↑',left+10,top+22);
 const scale=view.scale((b.maxX-b.minX)/fraction(),Math.min(80,w*.23));ctx.font='12px system-ui';ctx.fillText(scale.distance+'m',left,h-24);ctx.fillRect(left,h-18,scale.pixels,2);zoomLabel.textContent=Number(v.zoom.toFixed(1))+'×';minus.disabled=busy||v.zoom<=1;plus.disabled=busy||v.zoom>=4;drawMs=performance.now()-start;frame=requestAnimationFrame(draw);}
 const observer=new ResizeObserver(()=>{if(open)layout();});observer.observe(panel);
 function clearSelection(){const had=selected!==null;selected=null;label.textContent='';confirm.hidden=true;card.hidden=true;return had;}
 function select(){if(!open||busy)return null;let nearest=null,distance=24;for(const p of registry.points){if(!store.has(p.id))continue;const q=position(p.position),d=Math.hypot(q.x-view.project(cursor.x,cursor.y).x,q.y-view.project(cursor.x,cursor.y).y);if(d<distance){nearest=p;distance=d;}}
 if(nearest&&selected===nearest.id&&canWarp(warps,store,nearest.id)){onWarp(nearest.id);return selected;}
 selected=nearest?.id||null;card.hidden=!nearest;label.textContent=nearest?.name||'';confirm.hidden=!nearest||!canWarp(warps,store,nearest.id);if(nearest)onSelect();return selected;}
 confirm.addEventListener('click',()=>{if(open&&!busy&&selected&&canWarp(warps,store,selected))onWarp(selected);});
 function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 const pointers=new Map();let gesture=false,dragged=false,down=null;
 const center=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};};
 function zoom(value,anchor){if(busy)return;clearSelection();view.zoom(value,anchor?.x,anchor?.y);}
 function zoomStep(delta){zoom(view.snapshot().zoom+delta);}
 minus.onclick=()=>zoomStep(-1);plus.onclick=()=>zoomStep(1);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(view.snapshot().zoom*Math.exp(-e.deltaY*.002),point(e));},{passive:false});
 canvas.addEventListener('pointerdown',e=>{if(busy||e.button>0)return;cursorVisible=false;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,point(e));if(pointers.size===1){down=point(e);dragged=false;gesture=false;}else{gesture=true;clearSelection();}e.preventDefault();});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||busy)return;const old=pointers.get(e.pointerId),q=point(e),before=pointers.size>=2?center():null;pointers.set(e.pointerId,q);if(pointers.size>=2){const after=center();zoom(view.snapshot().zoom*after.d/Math.max(1,before.d),before);view.pan(after.x-before.x,after.y-before.y);gesture=true;}else if(down){if(Math.hypot(q.x-down.x,q.y-down.y)>=8)dragged=true;if(dragged){clearSelection();view.pan(q.x-old.x,q.y-old.y);}}e.preventDefault();});
 function end(e,cancel=false){if(!pointers.has(e.pointerId))return;const q=point(e);pointers.delete(e.pointerId);if(!cancel&&!gesture&&!dragged&&down){cursor=view.inverse(q.x,q.y);select();}if(!pointers.size){down=null;gesture=false;}else{down=null;gesture=true;}}
 canvas.addEventListener('pointerup',e=>end(e));canvas.addEventListener('pointercancel',e=>end(e,true));canvas.addEventListener('lostpointercapture',e=>end(e,true));
 return {store,zoomStep,cancel:clearSelection,setBusy(value){busy=value;confirm.disabled=value;confirm.innerHTML=value?icon('busy'):'ここへいく';confirm.setAttribute('aria-busy',String(value));},failure(){card.hidden=false;label.textContent='！いどうできませんでした';},setOpen(value){clearSelection();open=value;panel.hidden=!value;cancelAnimationFrame(frame);if(value){view.reset();cursorVisible=false;layout();cursor=view.inverse(position([px,0,pz]).x,position([px,0,pz]).y);draw();canvas.focus();}else store.flush();},move(input,dt){if(open&&!busy&&(input.moveX||input.moveY)){clearSelection();cursorVisible=true;view.pan(-input.moveX*dt*side*.65,-input.moveY*dt*side*.65);const v=view.snapshot();if(v.zoom>1)cursor=view.inverse(left+side/2,top+side/2);if(v.zoom===1){cursor.x=Math.max(0,Math.min(1,cursor.x+input.moveX*dt*.55));cursor.y=Math.max(0,Math.min(1,cursor.y+input.moveY*dt*.55));}}},select,

 update(x,z,dt,walking=true){if(closed)return;px=x;pz=z;if(walking){changed=store.reveal(x,z)||changed;for(const p of registry.points)if(Math.hypot(p.position[0]-x,p.position[2]-z)<=75&&store.discover(p.id)){pulses.set(p.id,performance.now());onDiscover(p);}}flushElapsed+=dt;if(flushElapsed>1){store.flush();flushElapsed=0;}},
 isFound:id=>store.has(id),pulse:id=>{const t=pulses.get(id);if(t===undefined)return 0;const elapsed=performance.now()-t;if(elapsed>650){pulses.delete(id);return 0;}return 1-elapsed/650;},
 biomeAt(x,z){const v=data.biomes,c=Math.floor((x-b.minX)/v.step),r=Math.floor((z-b.minZ)/v.step);return ['urban','grassland','woodland','waterside'][c>=0&&c<v.cols&&r>=0&&r<v.rows?+v.cells[r*v.cols+c]:0];},
 snapshot:()=>({...store.snapshot(),open,selected,cursor:{...cursor},view:view.snapshot(),points:registry.points.filter(p=>store.has(p.id)).map(p=>({id:p.id,...position(p.position)})),drawMs,canvasPixels:canvas.width*canvas.height,basePixels:1000000,mapBytes,warpEnabled:!!warps?.enabled,unlocked:registry.points.filter(p=>canWarp(warps,store,p.id)).map(p=>p.id),busy}),dispose(){closed=true;store.flush();cancelAnimationFrame(frame);observer.disconnect();panel.remove();base.width=base.height=fog.width=fog.height=0;}};
}
