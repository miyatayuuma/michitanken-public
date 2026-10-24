import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';
import {terrainMeshHeight} from '../lib/geo.mjs';
import {waterSurfaceElevationAt} from '../lib/water-field.mjs';

// Kenney Cube Pets bee and Gobkit duck: both CC0, sources recorded in PRIVATE.
// No simulation of verified wildlife habitat. These are decorative inhabitants.
const ACTIVE_LIMIT=7,UPDATE_INTERVAL=.12,MAX_DISTANCE=92;
const species={bee:{height:.40,hover:1.6},duck:{height:.85,hover:0}};
const WATER_CLEARANCE=.04;

export function wildlifeFootHeight(field,x,z,baseElevation,profiles=[]){
 const terrain=terrainMeshHeight(field.terrain,x,z);
 const water=waterSurfaceElevationAt(field,[x,z],profiles);
 return Math.max(terrain,water===null?-Infinity:water+WATER_CLEARANCE)-baseElevation;
}
const hash=s=>{
 let h=2166136261;
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
 return (h>>>0)/4294967296;
};
function inside(x,z,poly){
 let hit=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
function nearPath(x,z,path,distance){
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1];
  const den=dx*dx+dz*dz,t=den?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/den)):0;
  if(Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<distance)return true;
 }
 return false;
}
function safePoint(x,z,field){
 const h=field.size/2;
 if(Math.abs(x)>h-12||Math.abs(z)>h-12)return false;
 const osm=field.osm||{};
 for(const b of osm.buildings||[])if(inside(x,z,b.footprint)||nearPath(x,z,[...b.footprint,b.footprint[0]],3))return false;
 for(const area of osm.waterAreas||[])if(inside(x,z,area.footprint))return false;
 for(const road of osm.roads||[])if(nearPath(x,z,road.points,(road.width||4)/2+3))return false;
 for(const rail of osm.railways||[])if(nearPath(x,z,rail.points,7))return false;
 return true;
}
/** Pure deterministic candidate selection; never distributes inhabitants over unmapped housing. */
export function wildlifeCandidates(entry,field,overlay){
 const result=[],h=field.size/2;
 if(overlay?.schema!==1||overlay.tileId!==entry.id)return result;
 const areas=(overlay.areas||[]).filter(area=>['wood','grove','park','grass','shrub','scrub'].includes(area.kind)
    &&area.ring?.length>=3).sort((a,b)=>hash(String(a.id))-hash(String(b.id)));
 for(const a of areas){
  if(result.filter(p=>p.species==='bee').length>=12)break;
  const xs=a.ring.map(p=>p[0]),zs=a.ring.map(p=>p[1]);
  const xmin=Math.max(-h,Math.min(...xs)),xmax=Math.min(h,Math.max(...xs));
  const zmin=Math.max(-h,Math.min(...zs)),zmax=Math.min(h,Math.max(...zs));
  if((xmax-xmin)*(zmax-zmin)<25)continue;
  for(let i=0;i<10;i++){
   const seed=entry.id+':bee:'+a.id+':'+i;
   const x=xmin+(xmax-xmin)*hash(seed+'x'),z=zmin+(zmax-zmin)*hash(seed+'z');
   if(!inside(x,z,a.ring)||(a.holes||[]).some(p=>inside(x,z,p))||!safePoint(x,z,field))continue;
   result.push({id:seed,species:'bee',x,z,phase:hash(seed+'p')*Math.PI*2});
   break;
  }
 }
 // Ducks are allowed only beside mapped non-tunnel streams; never on arbitrary ground.
 const waterways=[...(field.osm?.waterways||[])].filter(w=>!w.tunnel&&w.layer>=0&&w.points?.length>=2)
  .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 for(const way of waterways){
  if(result.filter(p=>p.species==='duck').length>=3)break;
  for(let i=1;i<way.points.length;i++){
   const a=way.points[i-1],b=way.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
   const length=Math.hypot(dx,dz);if(length<6)continue;
   const seed=entry.id+':duck:'+way.id+':'+i;
   const side=hash(seed)>0.5?1:-1,margin=(way.width||3)/2+4.5;
   const x=(a[0]+b[0])/2+side*-dz/length*margin;
   const z=(a[1]+b[1])/2+side*dx/length*margin;
   if(!safePoint(x,z,field)||nearPath(x,z,way.points,(way.width||3)/2+2)||
     result.some(p=>p.species==='duck'&&Math.hypot(p.x-x,p.z-z)<35))continue;
   result.push({id:seed,species:'duck',x,z,phase:hash(seed+'p')*Math.PI*2});
   break;
  }
 }
 return result;
}

/** Near-field only; no artificial physics, expensive AI, or 25-tile fauna atlas. */
export function createWildlifeRenderer({scene,baseURL,baseElevation,onDiscover=()=>{}}){
 const loader=new GLTFLoader(),models=new Map(),tiles=new Map(),waterProfiles=new Map(),live=new Map(),pending=new Set();
 let elapsed=0,closed=false,mode='walk',player={x:0,z:0},visibleCount=0;
 const locate=item=>({
  x:item.entry.offset[0]+item.x,
  z:item.entry.offset[1]+item.z
 });
 const model=kind=>{
  if(!models.has(kind))models.set(kind,loader.loadAsync(baseURL.replace(/\/?$/,'/')+'assets/wildlife/'+kind+'.glb'));
  return models.get(kind);
 };
 function register(entry,field,overlay){
  if(closed)return;
  const candidates=wildlifeCandidates(entry,field,overlay).map(item=>({
   ...item,entry,field,key:entry.id+':'+item.id
  }));
  tiles.set(entry.id,candidates);
 }
 function setWaterProfiles(tileId,profiles){waterProfiles.set(tileId,profiles);}
 function stop(key){
  const value=live.get(key);
  if(!value)return;
  value.mixer?.stopAllAction();
  scene.remove(value.group);
  value.group.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});
  live.delete(key);
 }
 function unregister(tileId){
  tiles.delete(tileId);
  waterProfiles.delete(tileId);
  for(const [key,value] of [...live])if(value.item.entry.id===tileId)stop(key);
 }
 async function start(item){
  if(closed||pending.has(item.key)||live.has(item.key))return;
  pending.add(item.key);
  try{
   const gltf=await model(item.species);
   if(closed||mode!=='walk'||!tiles.has(item.entry.id)||live.has(item.key))return;
   if(Math.hypot(locate(item).x-player.x,locate(item).z-player.z)>MAX_DISTANCE)return;
   const cloned=cloneSkinned(gltf.scene);
   cloned.updateMatrixWorld(true);
   const bbox=new THREE.Box3().setFromObject(cloned);
   const span=bbox.max.y-bbox.min.y;
   if(!Number.isFinite(span)||span<=0)throw Error('Invalid animated model bounds '+item.species);
   const scale=species[item.species].height/span;
   // Normalize outside the animation hierarchy: imported root-keyframe tracks
   // must not undo the world-scale/grounding transform.
   const holder=new THREE.Group();
   holder.scale.setScalar(scale);
   holder.position.set(-(bbox.min.x+bbox.max.x)/2*scale,-bbox.min.y*scale,
    -(bbox.min.z+bbox.max.z)/2*scale);
   holder.add(cloned);
   cloned.traverse(obj=>{
    if(obj.isSkinnedMesh)obj.frustumCulled=false;
    // Water draws without depth testing at renderOrder 1. Fauna must draw later.
    if(obj.isMesh)obj.renderOrder=2;
   });
   const group=new THREE.Group();
   group.name='wildlife-'+item.species;
   group.add(holder);
   const mixer=new THREE.AnimationMixer(cloned);
   const clip=gltf.animations.find(a=>a.name==='idle')||gltf.animations[0];
   if(clip)mixer.clipAction(clip).play();
   const v={group,mixer,clip,item,time:0};live.set(item.key,v);scene.add(group);
  }catch(error){console.warn('Optional wildlife model unavailable:',item.species,error);}
  finally{pending.delete(item.key);}
 }
 function update({dt,playerX,playerZ,currentMode='walk'}){
  if(closed)return;
  mode=currentMode;player={x:playerX,z:playerZ};
  elapsed+=Math.max(0,dt);
  if(elapsed<UPDATE_INTERVAL)return;
  const step=Math.min(.25,elapsed);elapsed=0;
  const desired=new Map();
  if(mode==='walk'){
   const choices=[...tiles.values()].flat().map(item=>({
    ...item,distance:Math.hypot(locate(item).x-playerX,locate(item).z-playerZ)
   })).filter(item=>item.distance<MAX_DISTANCE).sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key));
   const counts={bee:0,duck:0};
   for(const item of choices){
    if(desired.size>=ACTIVE_LIMIT)break;
    const max=item.species==='bee'?5:2;
    if(counts[item.species]>=max)continue;
    desired.set(item.key,item);counts[item.species]++;
   }
  }
  for(const key of [...live.keys()])if(!desired.has(key))stop(key);
  for(const item of desired.values())if(!live.has(item.key)&&!pending.has(item.key)&&live.size+pending.size<ACTIVE_LIMIT)void start(item);
  for(const v of live.values()){
   v.time+=step;
   const t=v.time+v.item.phase,base=locate(v.item);
   if(Math.hypot(base.x-playerX,base.z-playerZ)<12)onDiscover(v.item.species);
   const bee=v.item.species==='bee',height=species[v.item.species].hover;
   const x=base.x+Math.cos(t*(bee?1.7:.7))*(bee?1.15:.55);
   const z=base.z+Math.sin(t*(bee?1.5:.7))*(bee?1.05:.55);
   const localX=x-v.item.entry.offset[0],localZ=z-v.item.entry.offset[1];
   const foot=bee
    ?terrainMeshHeight(v.item.field.terrain,localX,localZ)-baseElevation
    :wildlifeFootHeight(v.item.field,localX,localZ,baseElevation,
       waterProfiles.get(v.item.entry.id)||[]);
   v.group.position.set(x,foot+height+(bee?Math.sin(t*3)*.23:0),z);
   v.group.rotation.y=t*(bee?.3:.12);
   if(v.clip?.name==='clip'){
    // Gobkit duck: baked animation's walk segment = 90..119 frames at 24 fps.
    v.mixer.setTime(90/24+(v.time%(29/24)));
   }else if(v.clip)v.mixer.update(step);
  }
  visibleCount=live.size;
 }
 function dispose(){
  closed=true;
  for(const key of [...live.keys()])stop(key);
  tiles.clear();waterProfiles.clear();pending.clear();
  for(const promise of models.values())promise.then(gltf=>{
   const mats=new Set(),geoms=new Set();
   gltf.scene.traverse(o=>{if(o.geometry)geoms.add(o.geometry);if(o.material)
    for(const mat of Array.isArray(o.material)?o.material:[o.material])mats.add(mat);});
   for(const m of mats){m.map?.dispose();m.dispose();}
   for(const g of geoms)g.dispose();
  }).catch(()=>{});
  models.clear();
 }
 return {register,unregister,setWaterProfiles,update,dispose,get visibleCount(){return visibleCount;},
  get candidateCount(){return [...tiles.values()].reduce((a,b)=>a+b.length,0);},
  get candidatePositions(){return [...tiles.values()].flat().map(item=>({
   species:item.species,x:locate(item).x,z:locate(item).z
  }));}};
}
