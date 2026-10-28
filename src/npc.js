import * as THREE from 'three';
import {createDialogueState,groupInRange,validateGroups,validRect} from '../lib/npc.mjs';
import {createNpcImageStore} from './npc-storage.js';
import {prepareNpcZip} from './npc-zip.js';
import {BOOK_GROUPS} from '../lib/book-characters.mjs';

// The host supplies fictional or private group positions; this module never uploads images.
export function createNpcSystem({scene,container,groups,ground,camera,storage,blocked=()=>true,onMeet=()=>{},imagePacks=null}){
 if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
 validateGroups(groups);
 // A pack can be added to PRIVATE npc-catalog.json without changing JS.
 // Preserve compatibility with the original 9-sheet ZIP on older installations.
 const defaultPack={id:'original-nine',name:'既存9枚の画像',spriteIds:BOOK_GROUPS.flatMap(g=>g.groupId==='twins'?['twins']:g.members.map(([id])=>id))};
 const packs=Array.isArray(imagePacks)&&imagePacks.length?imagePacks:[defaultPack];
 const imageStore=createNpcImageStore(),dialogue=createDialogueState(storage),live=new Map();let closed=false,mode='walk',px=0,pz=0,occluders=()=>[],refreshTime=0,generation=0;
 // Device-only size preference; preserve authored differences between characters.
 const sizeKey='michitanken.npc.size.v1';
 const scaleClamp=value=>Math.min(1.5,Math.max(.65,Number(value)||1));
 let scaleFactor=1;
 try{scaleFactor=scaleClamp(storage?.getItem(sizeKey));}catch{}
 const setScale=value=>{
  scaleFactor=scaleClamp(value);
  for(const v of live.values())for(const m of v.members){
   const height=m.baseHeight*scaleFactor,aspect=m.sprite.material.map.image.width/m.sprite.material.map.image.height;
   m.sprite.scale.set(height*aspect,height,1);
  }
  try{storage?.setItem(sizeKey,String(scaleFactor));}catch{}
 };
 const panel=document.createElement('section');panel.className='npc-dialog paper';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','会話');
 const speaker=document.createElement('strong'),line=document.createElement('p'),next=document.createElement('button');next.textContent='つぎへ';panel.append(speaker,line,next);container.append(panel);
 const showLine=()=>{const item=dialogue.current?.lines[dialogue.current.index];if(!item){panel.hidden=true;return;}speaker.textContent=item[0];line.textContent=item[1];next.textContent=dialogue.current.index===dialogue.current.lines.length-1?'おしまい':'つぎへ';panel.hidden=false;};
 const advance=()=>{if(!dialogue.current)return false;dialogue.advance();showLine();return true;};next.onclick=advance;
 const stopDialogue=()=>{dialogue.close();showLine();};
 const makeSilhouette=id=>{const c=document.createElement('canvas');c.width=128;c.height=192;const ctx=c.getContext('2d');ctx.fillStyle='#46534c';if(id==='jiji'){ctx.beginPath();ctx.moveTo(24,85);ctx.lineTo(20,42);ctx.lineTo(47,61);ctx.lineTo(80,61);ctx.lineTo(108,42);ctx.lineTo(104,85);ctx.ellipse(64,93,44,40,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(64,151,35,39,0,0,Math.PI*2);ctx.fill();}else{ctx.beginPath();ctx.arc(64,43,31,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(40,70);ctx.lineTo(88,70);ctx.lineTo(108,188);ctx.lineTo(20,188);ctx.closePath();ctx.fill();}return c;};
 function canvasTexture(canvas){const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;}
 async function textureFor(id){
  const record=await imageStore.get(id).catch(()=>null);
  if(!record||!validRect(record.rect,record.width,record.height))return {texture:canvasTexture(makeSilhouette(id))};
  let bitmap;try{
   bitmap=await createImageBitmap(record.blob);if(bitmap.width!==record.width||bitmap.height!==record.height)throw Error('size mismatch');
   const columns=record.columns||1,rows=record.rows||1;
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(bitmap.width/columns);canvas.height=Math.ceil(bitmap.height/rows);
   const texture=canvasTexture(canvas);
   function draw(frame){const col=frame%columns,row=Math.floor(frame/columns),x=Math.round(col*bitmap.width/columns),y=Math.round(row*bitmap.height/rows),w=Math.round((col+1)*bitmap.width/columns)-x,h=Math.round((row+1)*bitmap.height/rows)-y;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,x,y,w,h,Math.floor((canvas.width-w)/2),canvas.height-h,w,h);texture.needsUpdate=true;}
   if(columns===1&&rows===1){const r=record.rect;canvas.width=r.width;canvas.height=r.height;canvas.getContext('2d').drawImage(bitmap,r.x,r.y,r.width,r.height,0,0,r.width,r.height);texture.needsUpdate=true;bitmap.close();return {texture};}
   draw(0);return {texture,bitmap,draw,frames:columns*rows,frame:0,time:0};
  }catch{bitmap?.close();return {texture:canvasTexture(makeSilhouette(id))};}
 }
 function release(id){const v=live.get(id);if(!v)return;live.delete(id);v.cancelled=true;for(const m of v.members){scene.remove(m.sprite);m.sprite.material.map?.dispose();m.animation?.bitmap?.close();m.sprite.material.dispose();}}
 async function mount(g){if(live.has(g.groupId)||closed)return;const v={group:g,members:[],cancelled:false,x:g.spawnAnchor[0],z:g.spawnAnchor[1],target:null,wait:1+Math.random()*3};live.set(g.groupId,v);const token=generation;
  const sharedSpriteId=g.visualSpriteId||(g.groupId==='twins'?'twins':null);
  const visualMembers=sharedSpriteId?[{...g.members[0],id:sharedSpriteId,offset:[0,0]}]:g.members;v.visualCount=visualMembers.length;
  for(const m of visualMembers){let y;try{y=ground(g.spawnAnchor[0]+m.offset[0],g.spawnAnchor[1]+m.offset[1]);}catch{release(g.groupId);return;}if(!Number.isFinite(y)){release(g.groupId);return;}
   const animation=await textureFor(m.id),tex=animation.texture;if(closed||v.cancelled||token!==generation){tex.dispose();animation.bitmap?.close();return;}const material=new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.05,depthTest:true,depthWrite:true});const sprite=new THREE.Sprite(material);const aspect=tex.image.width/tex.image.height;sprite.scale.set(m.height*scaleFactor*aspect,m.height*scaleFactor,1);sprite.center.set(.5,0);sprite.position.set(g.spawnAnchor[0]+m.offset[0],y,g.spawnAnchor[1]+m.offset[1]);sprite.name='npc-'+m.id;sprite.visible=false;scene.add(sprite);v.members.push({id:m.id,sprite,animation,offset:m.offset,baseHeight:m.height,speed:.65+Math.random()*.12});
  }
  for(const member of v.members)member.sprite.visible=true;
 }
 function move(v,dt){
  if(v.members.length!==v.visualCount)return false;
  if(dialogue.current?.groupId===v.group.groupId)return false;
  const g=v.group,step=Math.min(Math.max(dt,0),.1);
  if(v.wait>0){v.wait-=step;return;}
  if(!v.target){
   const angle=Math.random()*Math.PI*2,dist=2+Math.random()*6;
   const x=v.x+Math.cos(angle)*dist,z=v.z+Math.sin(angle)*dist;
   if(Math.hypot(x-g.spawnAnchor[0],z-g.spawnAnchor[1])>14){v.wait=.5;return;}
   v.target={x,z};
  }
  const dx=v.target.x-v.x,dz=v.target.z-v.z,d=Math.hypot(dx,dz),travel=Math.min(d,.68*step);
  if(d<.05){v.target=null;v.wait=1.5+Math.random()*3;return;}
  const nx=v.x+dx/d*travel,nz=v.z+dz/d*travel;
  if(g.members.some(m=>blocked(nx+m.offset[0],nz+m.offset[1]))){v.target=null;v.wait=.7+Math.random();return;}
  // Commit a movement step only if every member can move safely. Otherwise
  // the group centre would drift onward and leave a blocked companion behind.
  const proposed=[];
  for(const m of v.members){
   const p=m.sprite.position,tx=nx+m.offset[0],tz=nz+m.offset[1],fx=tx-p.x,fz=tz-p.z,fd=Math.hypot(fx,fz),amount=Math.min(fd,m.speed*step);
   const x=fd>0?p.x+fx/fd*amount:p.x,z=fd>0?p.z+fz/fd*amount:p.z;
   let y;try{if(blocked(x,z))throw Error('blocked');y=ground(x,z);}catch{v.target=null;v.wait=.7+Math.random();return;}
   if(!Number.isFinite(y)){v.target=null;v.wait=.7+Math.random();return;}
   proposed.push([m.sprite.position,x,y,z]);
  }
  v.x=nx;v.z=nz;
  for(const [position,x,y,z] of proposed)position.set(x,y,z);
  return travel>0;
 }
 function update({dt,playerX,playerZ,currentMode,occlusion=()=>[]}){px=playerX;pz=playerZ;mode=currentMode;occluders=occlusion;dialogue.observe(groups,px,pz);if(mode!=='walk'&&dialogue.current)stopDialogue();for(const v of live.values()){const moving=mode==='walk'&&move(v,dt);for(const m of v.members){const a=m.animation;if(!a?.draw)continue;a.time=moving?a.time+Math.min(Math.max(dt,0),.1):0;const frame=moving?Math.floor(a.time*6)%a.frames:0;if(frame!==a.frame){a.frame=frame;a.draw(frame);}}}refreshTime+=dt;if(refreshTime<.25)return;refreshTime=0;for(const g of groups){if(groupInRange(g,px,pz,mode))void mount(g);else release(g.groupId);}}
 const ray=new THREE.Raycaster();
 function interactAt(clientX,clientY,rect){if(closed||mode!=='walk'||dialogue.current||!rect||rect.width<=0||rect.height<=0)return false;const nx=(clientX-rect.left)/rect.width*2-1,ny=1-(clientY-rect.top)/rect.height*2;if(Math.abs(nx)>1||Math.abs(ny)>1)return false;camera.updateMatrixWorld();ray.setFromCamera(new THREE.Vector2(nx,ny),camera);ray.far=camera.far;
  const candidates=[];for(const v of live.values()){const g=v.group;if(v.members.length!==v.visualCount)continue;for(const m of v.members){if(Math.hypot(m.sprite.position.x-px,m.sprite.position.z-pz)>g.interactionRadius)continue;m.sprite.updateWorldMatrix(true,false);const hit=ray.intersectObject(m.sprite)[0];if(hit)candidates.push({g,hit});}}
  candidates.sort((a,b)=>a.hit.distance-b.hit.distance);if(!candidates.length)return false;const candidate=candidates[0];ray.far=Math.max(0,candidate.hit.distance-.01);const obstacles=occluders().filter(o=>o?.visible);for(const o of obstacles)o.updateWorldMatrix(true,true);if(ray.intersectObjects(obstacles,true).length)return false;
  dialogue.start(candidate.g);showLine();if(dialogue.current){try{onMeet(candidate.g);}catch(error){console.warn('NPC encounter recording failed',error);}}return !!dialogue.current;
 }
 function interactNearest(){if(dialogue.current)return advance();const choices=[...live.values()].filter(v=>v.members.length===v.visualCount&&v.members.some(m=>Math.hypot(m.sprite.position.x-px,m.sprite.position.z-pz)<=v.group.interactionRadius)).sort((a,b)=>Math.min(...a.members.map(m=>Math.hypot(m.sprite.position.x-px,m.sprite.position.z-pz)))-Math.min(...b.members.map(m=>Math.hypot(m.sprite.position.x-px,m.sprite.position.z-pz))));if(!choices.length)return false;const m=choices[0].members.slice().sort((a,b)=>Math.hypot(a.sprite.position.x-px,a.sprite.position.z-pz)-Math.hypot(b.sprite.position.x-px,b.sprite.position.z-pz))[0].sprite,p=m.position.clone();p.y+=m.scale.y*.5;p.project(camera);const rect=container.getBoundingClientRect();return interactAt(rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2,rect);}
 async function refreshImages(){generation++;for(const id of [...live.keys()])release(id);refreshTime=.25;}
 function installSettings(menu){const section=document.createElement('details');section.className='npc-settings';const summary=document.createElement('summary');summary.textContent='登場人物の画像・大きさ';section.append(summary);
  const sizeLabel=document.createElement('label');sizeLabel.className='npc-size-setting';sizeLabel.textContent='登場人物の大きさ ';
  const sizeOutput=document.createElement('output');sizeOutput.textContent=Math.round(scaleFactor*100)+'%';
  const sizeInput=document.createElement('input');sizeInput.type='range';sizeInput.min='65';sizeInput.max='150';sizeInput.step='5';sizeInput.value=String(Math.round(scaleFactor*100));sizeInput.setAttribute('aria-label','登場人物の大きさ');sizeInput.oninput=()=>{setScale(Number(sizeInput.value)/100);sizeOutput.textContent=sizeInput.value+'%';};sizeLabel.append(sizeInput,sizeOutput);section.append(sizeLabel);
  const explanation=document.createElement('p');explanation.textContent='画像ZIPはこの端末にだけ保存されます。新キャラの画像は追加ZIPで登録でき、既存画像は消えません。';section.append(explanation);
  // Sprite packs are independent transactions: importing a new group never
  // requires re-selecting the original nine images or changing sprite IDs.
  for(const pack of packs){
   const zipLabel=document.createElement('label');zipLabel.textContent=pack.name+'：ZIPを登録';
   const zipInput=document.createElement('input');zipInput.type='file';zipInput.accept='.zip,application/zip,application/x-zip-compressed';
   zipInput.setAttribute('aria-label',pack.spriteIds.length+'枚の画像ZIP');zipLabel.append(zipInput);section.append(zipLabel);
   const zipStatus=document.createElement('p');zipStatus.setAttribute('role','status');zipStatus.textContent='ZIPを選択してください';section.append(zipStatus);
   zipInput.onchange=async()=>{
    const file=zipInput.files?.[0];if(!file)return;
    zipInput.disabled=true;zipStatus.textContent='ZIPの画像を確認しています…';
    try{
     const records=await prepareNpcZip(file,pack.spriteIds);
     await imageStore.putMany(records);
     await refreshImages();
     zipStatus.textContent=records.length+'枚の画像を登録しました';
    }catch(error){zipStatus.textContent=error?.message||'画像ZIPを読み込めませんでした';}
    finally{zipInput.disabled=false;zipInput.value='';}
   };
  }
  menu.append(section);
 }
 function dispose(){closed=true;generation++;stopDialogue();for(const id of [...live.keys()])release(id);panel.remove();void imageStore.close().catch(()=>{});}
 return {update,interactAt,interactNearest,advance,close:stopDialogue,installSettings,dispose,targets(){const rect=container.getBoundingClientRect();return [...live.values()].flatMap(v=>v.members.map(m=>{const p=m.sprite.position.clone();p.y+=m.sprite.scale.y/2;p.project(camera);return {id:m.id,x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};}));},get talking(){return !!dialogue.current;},snapshot(){return [...live.values()].map(v=>({groupId:v.group.groupId,
  visuals:v.members.map(m=>({id:m.id,x:m.sprite.position.x,z:m.sprite.position.z,frame:m.animation?.frame??0,frames:m.animation?.frames??1})),
  talking:dialogue.current?.groupId===v.group.groupId}));},
 get visibleCount(){return [...live.values()].reduce((n,v)=>n+v.members.length,0);}};
}


