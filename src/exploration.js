import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';
import {OBJECTS,createDiscoveryStore,validateSpawnTile,nearbySpawns,hash} from '../lib/exploration.mjs';
const models={bird:new URL('./assets/exploration/bird.glb',import.meta.url).href,caterpillar:new URL('./assets/exploration/caterpillar.glb',import.meta.url).href};
function treasure(type){
 const g=new THREE.Group();
 const part=(geometry,color,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color}));mesh.position.set(x,y,z);mesh.renderOrder=3;g.add(mesh);return mesh;};
 if(type==='acorn'){part(new THREE.SphereGeometry(.24,8,6),'#a66c32',0,.24);const cap=part(new THREE.SphereGeometry(.27,8,4),'#68462c',0,.4);cap.scale.y=.45;part(new THREE.CylinderGeometry(.045,.055,.16,5),'#68462c',0,.54);}
 if(type==='stone'){const m=part(new THREE.IcosahedronGeometry(.38,0),'#7fc9d2',0,.28);m.scale.set(1,.65,.8);part(new THREE.OctahedronGeometry(.10,0),'#e9fcff',-.1,.45,.03);}
 if(type==='feather'){const stem=part(new THREE.CylinderGeometry(.025,.035,.8,5),'#e8d7af',0,.45);stem.rotation.z=-.35;for(let i=0;i<6;i++){const b=part(new THREE.SphereGeometry(.15,6,4),i%2?'#f9ebc5':'#d9dcc0',.12-i*.035,.25+i*.1);b.scale.set(1.6,.45,.5);b.rotation.z=.5;}}
 if(type==='chest'){part(new THREE.BoxGeometry(.95,.55,.68),'#b3783c',0,.28);const lid=part(new THREE.CylinderGeometry(.35,.35,.95,8,1,false,0,Math.PI),'#c58b43',0,.55);lid.rotation.z=Math.PI/2;for(const x of [-.33,.33])part(new THREE.BoxGeometry(.08,.7,.72),'#f0ce71',x,.35);part(new THREE.BoxGeometry(.17,.2,.07),'#ffea96',0,.4,.38);}
 return g;
}
export function createExploration({scene,container,baseURL,baseElevation,ground,low=false,onCollect=()=>{}}){
 let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('storage unavailable');},setItem(){throw Error('storage unavailable');}};}
 const records=createDiscoveryStore(storage),tiles=new Map(),loaded=new Map(),live=new Map(),templates=new Map(),loader=new GLTFLoader();
 const abort=new AbortController(),{signal}=abort;let elapsed=0,time=0,closed=false,mode='walk',px=0,pz=0,nearest=null,errorCount=0;
 const limit=low?6:12,interval=low?.2:.1;let sharedColormap=null;
 const highlight=new THREE.Group(),ringGeometry=new THREE.RingGeometry(.55,.65,24),ringMaterial=new THREE.MeshBasicMaterial({color:0x245b4d,side:THREE.DoubleSide,depthWrite:false}),paperMaterial=new THREE.MeshBasicMaterial({color:0xfff5df,side:THREE.DoubleSide,depthWrite:false});
 const paperRing=new THREE.Mesh(new THREE.RingGeometry(.50,.71,24),paperMaterial),ring=new THREE.Mesh(ringGeometry,ringMaterial);paperRing.rotation.x=ring.rotation.x=-Math.PI/2;paperRing.position.y=.06;ring.position.y=.07;highlight.add(paperRing,ring);
 const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(.12,0),ringMaterial);diamond.position.y=1;highlight.add(diamond);paperRing.renderOrder=5;ring.renderOrder=6;diamond.renderOrder=6;highlight.visible=false;scene.add(highlight);
 const success=new THREE.Group(),successMaterial=new THREE.LineBasicMaterial({color:0x245b4d,depthTest:true});
 const successGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.7,.4,0),new THREE.Vector3(-.9,.7,0),new THREE.Vector3(0,.8,0),new THREE.Vector3(0,1.2,0),new THREE.Vector3(.7,.4,0),new THREE.Vector3(.9,.7,0)]);const successLines=new THREE.LineSegments(successGeometry,successMaterial);successLines.renderOrder=6;success.add(successLines);success.visible=false;scene.add(success);let successUntil=0,lastCamera=null,lastOccluders=[];
 const raycaster=new THREE.Raycaster(),targetPoint=new THREE.Vector3(),projected=new THREE.Vector3(),bounds=new THREE.Box3();
 // Each accepted sample must intersect the actual treasure mesh before any terrain/building.
 function clearHit(v,ndc){
  if(!lastCamera||!v?.ready||!v.group.visible||records.taken.has(v.item.id))return null;
  v.group.updateWorldMatrix(true,true);lastCamera.updateWorldMatrix(true,false);
  raycaster.setFromCamera(ndc,lastCamera);raycaster.far=lastCamera.far;
  const hit=raycaster.intersectObject(v.group,true)[0];if(!hit)return null;
  raycaster.far=Math.max(0,hit.distance-.01);
  for(const object of lastOccluders)object.updateWorldMatrix(true,true);
  return raycaster.intersectObjects(lastOccluders,true).length?null:hit;
 }
 function projection(v){
  v.group.updateWorldMatrix(true,true);bounds.setFromObject(v.group);bounds.getCenter(targetPoint);
  projected.copy(targetPoint).project(lastCamera);
  return projected;
 }
 function visible(item){
  if(!lastCamera)return false;const v=live.get(item.id);if(!v?.ready)return false;
  const p=projection(v);if(p.z < -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1)return false;
  return !!clearHit(v,new THREE.Vector2(p.x,p.y));
 }
 function collectAt(clientX,clientY,rect){
  if(closed||mode!=='walk'||!lastCamera||!rect||rect.width<=0||rect.height<=0)return false;
  const x=clientX-rect.left,y=clientY-rect.top;
  if(x<0||y<0||x>rect.width||y>rect.height)return false;
  const ndc=new THREE.Vector2(x/rect.width*2-1,1-y/rect.height*2),exact=[],near=[];
  for(const v of live.values()){
   if(!v.ready||OBJECTS[v.item.type].kind!=='treasure'||records.taken.has(v.item.id)||Math.hypot(v.item.x-px,v.item.z-pz)>4.5)continue;
   const p=projection(v).clone();if(p.z < -1||p.z>1)continue;
   const hit=clearHit(v,ndc);
   if(hit){exact.push({v,d:hit.distance});continue;}
   // A 44 CSS-pixel target for tiny meshes. Tolerance never bypasses a mesh ray or occlusion.
   const distance=Math.hypot((p.x+1)*rect.width/2-x,(1-p.y)*rect.height/2-y);
   if(distance<=22&&clearHit(v,new THREE.Vector2(p.x,p.y)))near.push({v,d:distance});
  }
  const candidates=exact.length?exact:near;
  candidates.sort((a,b)=>a.d-b.d||a.v.item.id.localeCompare(b.v.item.id));
  return candidates.length?collect(candidates[0].v.item):false;
 }

 const safeGround=(x,z,fallback)=>{try{const y=ground(x,z);return Number.isFinite(y)?y:fallback;}catch{return fallback;}};
 const model=type=>{if(!templates.has(type))templates.set(type,loader.loadAsync(models[type]).then(gltf=>{const retired=new Set();gltf.scene.traverse(o=>{for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){if(!m.map)continue;if(!sharedColormap)sharedColormap=m.map;else if(m.map!==sharedColormap){retired.add(m.map);m.map=sharedColormap;}}});retired.forEach(t=>t.dispose());return gltf;}).catch(e=>{errorCount++;throw e;}));return templates.get(type);};
 async function register(entry){
  const token={controller:new AbortController()};tiles.get(entry.id)?.controller.abort();tiles.set(entry.id,token);
  try{const response=await fetch(baseURL+'data/exploration/'+entry.id+'.json',{signal:token.controller.signal});if(!response.ok)throw Error('spawn tile '+response.status);const rows=validateSpawnTile(await response.json(),entry);if(closed||tiles.get(entry.id)!==token)return;loaded.set(entry.id,rows);
  }catch(error){if(error.name!=='AbortError'){errorCount++;console.warn('Exploration unavailable',entry.id);}}
 }
 function stop(id){const v=live.get(id);if(!v)return;scene.remove(v.group);v.mixer?.stopAllAction();v.group.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});live.delete(id);if(v.owned)v.group.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
 function unregister(id){tiles.get(id)?.controller.abort();tiles.delete(id);loaded.delete(id);for(const [k,v] of live)if(v.item.tileId===id)stop(k);}
 async function start(item){
  const d=OBJECTS[item.type],group=new THREE.Group(),v={item,group,ready:false,owned:d.kind==='treasure',state:'idle',reaction:0};live.set(item.id,v);
  try{if(d.kind==='treasure')group.add(treasure(item.type));else{const gltf=await model(item.type);if(closed||live.get(item.id)!==v)return;const c=cloneSkinned(gltf.scene);const box=new THREE.Box3().setFromObject(c);const span=box.max.y-box.min.y;const scale=Math.min(d.height/span,1.8/Math.max(box.max.x-box.min.x,box.max.z-box.min.z));const holder=new THREE.Group();holder.scale.setScalar(scale);holder.position.set(-(box.max.x+box.min.x)/2*scale,-box.min.y*scale,-(box.max.z+box.min.z)/2*scale);holder.add(c);group.add(holder);v.mixer=new THREE.AnimationMixer(c);const clip=gltf.animations.find(a=>a.name===(item.type==='bird'?'idle':'walk'));if(clip)v.mixer.clipAction(clip).play();c.traverse(o=>{if(o.isMesh){o.renderOrder=3;if(o.isSkinnedMesh)o.frustumCulled=false;}});}
   if(closed||live.get(item.id)!==v)return;v.ready=true;group.name='exploration-'+item.type;group.position.set(item.x,item.y-baseElevation,item.z);scene.add(group);
  }catch{if(live.get(item.id)===v)stop(item.id);}
 }
 function discover(type){return records.discover(type);}
 function collect(p=nearest){if(closed||mode!=='walk'||!p||Math.hypot(p.x-px,p.z-pz)>4.5||!visible(p))return false;const result=records.collect(p);if(!result)return false;success.scale.setScalar(1);success.position.copy(live.get(p.id).group.position);success.visible=true;successUntil=time+.45;highlight.visible=false;stop(p.id);nearest=null;onCollect();return true;}
 function update({dt,playerX,playerZ,currentMode,camera,occluders=[]}){
  if(closed)return;lastCamera=camera;lastOccluders=occluders;mode=currentMode;px=playerX;pz=playerZ;elapsed+=dt;time+=dt;success.visible=time<successUntil&&mode==='walk';if(success.visible&&!low&&!matchMedia('(prefers-reduced-motion: reduce)').matches)success.scale.setScalar(1+(time-(successUntil-.45))*.6);if(elapsed<interval)return;elapsed=0;
  const desired=nearbySpawns([...loaded.values()].flat(),px,pz,{limit,radius:65,taken:records.taken}),ids=new Set(desired.map(p=>p.id));
  if(mode!=='walk')ids.clear();for(const k of [...live.keys()])if(!ids.has(k))stop(k);
  if(mode==='walk')for(const p of desired)if(!live.has(p.id))void start(p);
  nearest=null;let closest=4.5;
  for(const v of live.values()){
   if(!v.ready)continue;v.mixer?.update(interval);const p=v.item,d=OBJECTS[p.type],distance=Math.hypot(p.x-px,p.z-pz),phase=(hash(p.id)%628)/100;
   v.group.visible=mode==='walk';if(d.kind==='animal'&&distance<d.notice)discover(p.type);
   if(d.kind==='treasure'&&distance<closest&&visible(p)){closest=distance;nearest=p;}
   {if(distance<5)v.reaction=1;else if(distance>10)v.reaction=Math.max(0,v.reaction-.08);}
   v.state=v.reaction>0?'react':'idle';
   const drift=d.kind==='animal'&&p.type==='caterpillar'?(v.reaction?.03:.18):0;
   const x=p.x+Math.cos(time*.6+phase)*drift,z=p.z+Math.sin(time*.6+phase)*drift;
   const y=safeGround(x,z,p.y-baseElevation);
   v.group.position.set(x,y+(p.type==='bird'?v.reaction*(1.2+.15*Math.sin(time*8)):0),z);
   v.group.rotation.y=phase+(p.type==='caterpillar'?Math.sin(time*.5)*.3:0);
  }
  highlight.visible=!!nearest&&mode==='walk';if(highlight.visible)highlight.position.copy(live.get(nearest.id).group.position);
 }
 function snapshot(){return {loadedTiles:[...loaded.keys()].sort(),loadedCount:[...loaded.values()].reduce((n,a)=>n+a.length,0),live:[...live.values()].map(v=>({...v.item,ready:v.ready,state:v.state,position:v.group.position.toArray()})),nearest:nearest?.id||null,highlight:highlight.visible,success:success.visible,limit,errors:errorCount,records:records.snapshot()};}
 function dispose(){scene.remove(highlight,success);ringGeometry.dispose();paperRing.geometry.dispose();diamond.geometry.dispose();ringMaterial.dispose();paperMaterial.dispose();successGeometry.dispose();successMaterial.dispose();closed=true;abort.abort();for(const t of tiles.values())t.controller.abort();for(const id of [...live.keys()])stop(id);for(const p of templates.values())p.then(g=>{const gs=new Set(),ms=new Set(),ts=new Set();g.scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){ms.add(m);for(const value of Object.values(m))if(value?.isTexture)ts.add(value);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}).catch(()=>{});}
 return {register,unregister,update,collect,collectAt,discover,snapshot,dispose};
}
