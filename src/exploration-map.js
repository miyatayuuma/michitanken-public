import {createExplorationMapStore} from '../lib/exploration-map.mjs';
export const MAP_ICONS={park:new URL('./assets/cartography/treePines.png',import.meta.url).href,shrine:new URL('./assets/cartography/gate.png',import.meta.url).href,temple:new URL('./assets/cartography/houseViking.png',import.meta.url).href,bridge:new URL('./assets/cartography/bridge.png',import.meta.url).href,water:new URL('./assets/cartography/lake.png',import.meta.url).href};
export async function createExplorationMap({container,registry,baseURL,onDiscover=()=>{},onSelect=()=>{}}){
 const response=await fetch(baseURL+'data/exploration-map.json');if(!response.ok)throw Error('Map unavailable');const data=await response.json();
 if(data.schema!==1||!data.bounds||!Array.isArray(data.lines)||!Array.isArray(data.areas))throw Error('Invalid map');
 let storage;try{storage=localStorage;}catch{}
 const store=createExplorationMapStore({bounds:data.bounds,storage,ids:registry.points.map(p=>p.id)}),b=data.bounds;
 const panel=document.createElement('section');panel.id='exploration-map';panel.hidden=true;panel.setAttribute('aria-label','全体マップ');
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','北が上の地図。現在地と発見済みの地点');canvas.tabIndex=0;
 const label=document.createElement('output');label.id='map-selection';label.setAttribute('aria-live','polite');panel.append(canvas,label);container.append(panel);
 const ctx=canvas.getContext('2d'),base=document.createElement('canvas'),fog=document.createElement('canvas'),images={};base.width=base.height=1000;fog.width=store.cols;fog.height=store.rows;
 const g=base.getContext('2d');g.fillStyle='#eddfb7';g.fillRect(0,0,1000,1000);
 const project=p=>[(p[0]-b.minX)/(b.maxX-b.minX)*1000,(p[1]-b.minZ)/(b.maxZ-b.minZ)*1000];
 const ring=points=>{points.forEach((p,i)=>{const [x,y]=project(p);i?g.lineTo(x,y):g.moveTo(x,y);});g.closePath();};
 for(const a of data.areas){g.beginPath();ring(a.ring);for(const h of a.holes||[])ring(h);g.fillStyle={wood:'#a1b282',green:'#c2ce93',water:'#8ebfc3'}[a.kind];g.fill('evenodd');}
 for(const kind of ['river','road'])for(const l of data.lines.filter(l=>l.kind===kind)){g.beginPath();l.points.forEach((p,i)=>{const [x,y]=project(p);i?g.lineTo(x,y):g.moveTo(x,y);});g.lineWidth=Math.max(kind==='river'?2:1,(l.width||4)*1000/(b.maxX-b.minX));g.strokeStyle=kind==='river'?'#7bb2bd':'#faf2dc';g.lineCap='round';g.stroke();}
 for(const [k,url] of Object.entries(MAP_ICONS)){const im=new Image();im.src=url;images[k]=im;}
 let open=false,px=0,pz=0,cursor={x:.5,y:.5},selected=null,changed=true,flushElapsed=0,closed=false,frame=0,drawMs=0;
 const pulses=new Map();let w=1,h=1,side=1,left=0,top=0;
 function layout(){w=panel.clientWidth;h=panel.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);side=Math.min(w-28,h-74);left=(w-side)/2;top=Math.max(10,(h-54-side)/2);label.style.top=(top+side+12)+'px';label.style.bottom='auto';}
 const position=p=>({x:left+(p[0]-b.minX)/(b.maxX-b.minX)*side,y:top+(p[2]-b.minZ)/(b.maxZ-b.minZ)*side});
 function fogUpdate(){const f=fog.getContext('2d');f.clearRect(0,0,store.cols,store.rows);f.fillStyle='#e5ebeb';for(let r=0;r<store.rows;r++)for(let c=0;c<store.cols;c++)if(!store.cells[r*store.cols+c])f.fillRect(c,r,1,1);changed=false;}
 function draw(){const start=performance.now();ctx.clearRect(0,0,w,h);ctx.drawImage(base,left,top,side,side);if(changed)fogUpdate();ctx.imageSmoothingEnabled=true;ctx.drawImage(fog,left,top,side,side);
 for(const p of registry.points){if(!store.has(p.id))continue;const {x,y}=position(p.position);ctx.fillStyle=selected===p.id?'#ffe38e':'#fff4d6';ctx.strokeStyle='#706047';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);ctx.fill();ctx.stroke();const im=images[p.category];if(im?.complete&&im.naturalWidth)ctx.drawImage(im,x-12,y-12,24,24);else{ctx.fillStyle='#566d51';ctx.fillRect(x-4,y-4,8,8);}}
 const p=position([px,0,pz]);ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fillStyle='#ce6746';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();
 const x=left+cursor.x*side,y=top+cursor.y*side;ctx.strokeStyle='#363d38';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.moveTo(x-18,y);ctx.lineTo(x-8,y);ctx.moveTo(x+8,y);ctx.lineTo(x+18,y);ctx.moveTo(x,y-18);ctx.lineTo(x,y-8);ctx.moveTo(x,y+8);ctx.lineTo(x,y+18);ctx.stroke();
 ctx.fillStyle='#394d44';ctx.font='bold 13px system-ui';ctx.fillText('N ↑',left+8,top+19);ctx.font='11px system-ui';ctx.fillText('500m',left+8,top+side-10);ctx.fillRect(left+8,top+side-7,side*500/(b.maxX-b.minX),2);drawMs=performance.now()-start;frame=requestAnimationFrame(draw);}
 const observer=new ResizeObserver(()=>{if(open)layout();});observer.observe(panel);
 function select(){let nearest=null,distance=30;for(const p of registry.points){if(!store.has(p.id))continue;const q=position(p.position),d=Math.hypot(q.x-left-cursor.x*side,q.y-top-cursor.y*side);if(d<distance){nearest=p;distance=d;}}selected=nearest?.id||null;label.textContent=nearest?.name||'';if(nearest)onSelect();return selected;}
 function point(e){const rect=canvas.getBoundingClientRect();cursor={x:Math.max(0,Math.min(1,(e.clientX-rect.left-left)/side)),y:Math.max(0,Math.min(1,(e.clientY-rect.top-top)/side))};}
 canvas.addEventListener('pointerdown',e=>{point(e);select();e.preventDefault();});
 return {store,setOpen(value){open=value;panel.hidden=!value;cancelAnimationFrame(frame);if(value){cursor={x:(px-b.minX)/(b.maxX-b.minX),y:(pz-b.minZ)/(b.maxZ-b.minZ)};layout();draw();canvas.focus();}else store.flush();},move(input,dt){if(open){cursor.x=Math.max(0,Math.min(1,cursor.x+input.moveX*dt*.55));cursor.y=Math.max(0,Math.min(1,cursor.y+input.moveY*dt*.55));}},select,
 update(x,z,dt,walking=true){if(closed)return;px=x;pz=z;if(walking){changed=store.reveal(x,z)||changed;for(const p of registry.points)if(Math.hypot(p.position[0]-x,p.position[2]-z)<=75&&store.discover(p.id)){pulses.set(p.id,performance.now());onDiscover(p);}}flushElapsed+=dt;if(flushElapsed>1){store.flush();flushElapsed=0;}},
 isFound:id=>store.has(id),pulse:id=>{const t=pulses.get(id);if(t===undefined)return 0;const elapsed=performance.now()-t;if(elapsed>1600){pulses.delete(id);return 0;}return 1-elapsed/1600;},
 biomeAt(x,z){const v=data.biomes,c=Math.floor((x-b.minX)/v.step),r=Math.floor((z-b.minZ)/v.step);return ['urban','grassland','woodland','waterside'][c>=0&&c<v.cols&&r>=0&&r<v.rows?+v.cells[r*v.cols+c]:0];},
 snapshot:()=>({...store.snapshot(),open,selected,cursor:{...cursor},drawMs,canvasPixels:canvas.width*canvas.height,basePixels:1000000,mapBytes:JSON.stringify(data).length,warpEnabled:false}),dispose(){closed=true;store.flush();cancelAnimationFrame(frame);observer.disconnect();panel.remove();base.width=base.height=fog.width=fog.height=0;}};
}
