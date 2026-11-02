import * as THREE from 'three';
import {natureTint} from '../lib/appearance.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {terrainMeshHeight} from '../lib/geo.mjs';
import {buildRoadRibbon,roadSurfaceOptions} from '../lib/road-surface.mjs';
import {addContactShadows} from './contact-shadow.js';
import {surfaceContainsWater} from '../lib/surface-mesh.mjs';

// Kenney Nature Kit 2.1, CC0. Models are hosted by the PRIVATE game site.
const SPEC={
 tree:{models:['tree_oak','tree_default','tree_pineDefaultA'],height:[5,9],limit:100},
 bush:{models:['plant_bush'],height:[.6,1.8],limit:180},
 grass:{models:['grass'],height:[.35,1.15],limit:310},
 flower:{models:['flower_yellowA'],height:[.35,.8],limit:65},
 rock:{models:['rock_smallA'],height:[.45,1],limit:22}
};
/** Fixed upper limits are preliminary; phone p95 still needs real-device acceptance. */
export function natureInstanceBudget({coarsePointer=false,memoryGiB=null}={}){
 if(coarsePointer&&memoryGiB!==null&&memoryGiB<=4)return 240;
 return coarsePointer?360:540;
}
function hash(seed){
 let h=2166136261;
 for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
 return (h>>>0)/4294967296;
}
function inside(x,z,poly){
 let hit=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
function distanceSegment(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz;
 const t=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/d)):0;
 return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
function nearPath(x,z,points,clearance){
 for(let i=1;i<points.length;i++)if(distanceSegment(x,z,points[i-1],points[i])<clearance)return true;
 return false;
}
function occupied(x,z,field,{observedCanopy=false}={}){
 if(surfaceContainsWater(field.surface,x,z))return true;
 const osm=field.osm||{};
 for(const house of osm.buildings||[]){
  if(inside(x,z,house.footprint)||nearPath(x,z,[...house.footprint,house.footprint[0]],3))return true;
 }
 for(const water of osm.waterAreas||[])if(inside(x,z,water.footprint)||nearPath(x,z,[...water.footprint,water.footprint[0]],3))return true;
 for(const road of osm.roads||[])if(nearPath(x,z,road.points,(road.width||3)/2+(observedCanopy?0:2.5)))return true;
 for(const rail of osm.railways||[])if(nearPath(x,z,rail.points,7))return true;
 for(const river of osm.waterways||[])if(nearPath(x,z,river.points,(river.width||3)/2+3))return true;
 return false;
}
function kindForArea(tag,roll){
 if(tag==='grove'||tag==='canopy')return roll<.85?'tree':'bush';
 if(tag==='shrub')return 'bush';
 if(tag==='wood')return roll<.72?'tree':roll<.90?'bush':roll<.97?'grass':'rock';
 if(tag==='scrub')return roll<.72?'bush':roll<.95?'grass':'rock';
 if(tag==='grass')return roll<.74?'grass':roll<.90?'flower':roll<.97?'bush':'rock';
 if(tag==='park')return roll<.44?'tree':roll<.65?'bush':roll<.90?'grass':roll<.97?'flower':'rock';
 return null;
}
/** Deterministic candidate ranking scatters foliage across the *whole* green polygon.
 * The previous row-major cap left the second half of large forests bare.
 * Mesh density is controlled by a per-device instance budget, not draw calls.
 */
export function sampleVegetation(entry,field,overlay,{maxTotal=540,reserved=[]}={}){
 if(overlay?.schema!==1||overlay.tileId!==entry.id||!Array.isArray(overlay.areas))return [];
 if(!Number.isInteger(maxTotal)||maxTotal<0||maxTotal>900)throw Error('Invalid nature instance budget');
 const out=[],used={tree:0,bush:0,grass:0,flower:0,rock:0},candidates=[];
 // Keep explicit tagged trees ahead of vegetation inferred from land cover.
 const add=(kind,x,z,seed,observedCanopy=false)=>{
  if(!SPEC[kind]||used[kind]>=SPEC[kind].limit||out.length>=maxTotal||
     Math.abs(x)>=field.size/2-.5||Math.abs(z)>=field.size/2-.5||
     reserved.some(p=>Math.hypot(x-p.x,z-p.z)<(p.radius||8))||occupied(x,z,field,{observedCanopy}))return;
  const spacing=kind==='tree'?8:kind==='bush'?2.6:1.25;
  if(out.some(p=>p.kind===kind&&Math.hypot(p.x-x,p.z-z)<spacing))return;
  const shape=SPEC[kind];
  let model=shape.models[Math.floor(hash(seed+':model')*shape.models.length)];
  // Two detailed CC0 trees supplement the light existing trees.
  if(kind==='tree'&&hash(seed+':detailed')<.08)model=hash(seed+':detail-kind')<.5?'new-tree2':'new-tree3';
  const height=shape.height[0]+hash(seed+':height')*(shape.height[1]-shape.height[0]);
  out.push({kind,model,x,z,height,yaw:hash(seed+':angle')*Math.PI*2});
  used[kind]++;
 };
 for(const tree of (overlay.trees||[]).slice(0,200)){
  if(!Array.isArray(tree)||tree.length!==2||!tree.every(Number.isFinite))continue;
  add('tree',tree[0],tree[1],entry.id+':osm-tree:'+tree.join(':'),true);
 }
 if(out.length>=maxTotal)return out;
 const areas=[...overlay.areas].sort((a,b)=>hash(String(a.id)+':scatter')-hash(String(b.id)+':scatter')).slice(0,1500);
 for(const area of areas){
  if(!Array.isArray(area.ring)||area.ring.length<3||area.ring.length>5000)continue;
  const ring=area.ring;
  if(!ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))continue;
  const minX=Math.max(-field.size/2,Math.min(...ring.map(p=>p[0]))),
   maxX=Math.min(field.size/2,Math.max(...ring.map(p=>p[0]))),
   minZ=Math.max(-field.size/2,Math.min(...ring.map(p=>p[1]))),
   maxZ=Math.min(field.size/2,Math.max(...ring.map(p=>p[1])));
  if(maxX-minX<1||maxZ-minZ<1)continue;
  // Aerial photo-derived tree crown may be smaller than the grid step.
  // Place at its observed polygon centroid, not in an arbitrary courtyard.
  if(area.kind==='canopy'||area.kind==='shrub'){
   const x=ring.reduce((n,p)=>n+p[0],0)/ring.length;
   const z=ring.reduce((n,p)=>n+p[1],0)/ring.length;
   if(inside(x,z,ring)&&!(area.holes||[]).some(h=>inside(x,z,h))){
    const kind=area.kind==='canopy'?'tree':'bush';
    candidates.push({kind,x,z,seed:area.id+':crown',priority:-1,observedCanopy:area.kind==='canopy'});
   }
  }
  // Two passes: preserve standing trees, then carpet their gaps with small plants.
  for(const layer of ['canopy','understory']){
   const step=layer==='canopy'?(area.kind==='wood'||area.kind==='grove'?13:area.kind==='canopy'?10:area.kind==='park'?18:20):
       area.kind==='wood'||area.kind==='grove'?5.5:area.kind==='canopy'?30:area.kind==='grass'?5.5:area.kind==='shrub'?9:area.kind==='scrub'?7:8;
   if(layer==='understory'&&area.kind==='canopy')continue;
   if(layer==='canopy'&&(area.kind==='shrub'||area.kind==='grass'))continue;
   const chance=layer==='canopy'?.66:.75;
   const xmin=Math.ceil((minX+entry.offset[0])/step),
    xmax=Math.floor((maxX+entry.offset[0])/step),
    zmin=Math.ceil((minZ+entry.offset[1])/step),
    zmax=Math.floor((maxZ+entry.offset[1])/step);
   // Randomly thin the *whole* grid when a polygon is very large. A row-major
   // early stop would starve the east/south half of large forests.
   const gridCount=(xmax-xmin+1)*(zmax-zmin+1);
   const sampling=Math.min(1,2000/Math.max(1,gridCount));
   for(let gx=xmin;gx<=xmax;gx++)for(let gz=zmin;gz<=zmax;gz++){
    const seed=area.id+':'+layer+':'+gx+':'+gz;
    if(hash(seed+':sample')>sampling||hash(seed+':density')>chance)continue;
    const x=gx*step-entry.offset[0]+(hash(seed+':dx')-.5)*step*.62;
    const z=gz*step-entry.offset[1]+(hash(seed+':dz')-.5)*step*.62;
    if(!inside(x,z,ring)||(area.holes||[]).some(h=>inside(x,z,h)))continue;
    let kind;
    if(layer==='understory'){
     const r=hash(seed+':kind');
     kind=area.kind==='wood'||area.kind==='grove'?(r<.65?'grass':r<.96?'bush':'flower'):
       area.kind==='shrub'?'bush':area.kind==='scrub'?(r<.72?'bush':'grass'):
       area.kind==='grass'?(r<.85?'grass':'flower'):
       (r<.68?'grass':r<.92?'bush':'flower');
    }else{
     kind=kindForArea(area.kind,hash(seed+':kind'));
     if(layer==='canopy'&&kind==='grass')continue; // grass belongs in understory
    }
    if(!SPEC[kind])continue;
    candidates.push({kind,x,z,seed,priority:hash(seed+':priority'),observedCanopy:area.kind==='canopy'});
   }
  }
 }
 // Sparse inferred roadside trees supplement mapped green polygons. The seed
 // is world-space stable; these positions are explicitly estimated, not OSM trees.
 for(const road of field.osm.roads||[]){
  if(road.bridge||road.tunnel||!['residential','living_street','tertiary','unclassified'].includes(road.kind))continue;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
   if(len<6)continue;
   const seed='estimated-tree:'+road.id+':'+Math.round((a[0]+b[0])/2+entry.offset[0])+':'+Math.round((a[1]+b[1])/2+entry.offset[1]);
   if(hash(seed)>.17)continue;
   const side=hash(seed+':side')<.5?-1:1,d=(road.width||4)/2+3.5;
   candidates.push({kind:'tree',x:(a[0]+b[0])/2-side*dz/len*d,z:(a[1]+b[1])/2+side*dx/len*d,seed,priority:.3+hash(seed+':rank')*.7,observedCanopy:false,estimated:true});
  }
 }
 // Supplement known riversides and residential gardens with sparse,
 // estimated planting. Existing water/road/building clearance rules apply.
 for(const river of field.osm.waterways||[]){
  if(river.tunnel)continue;
  for(let i=1;i<river.points.length;i++){
   const a=river.points[i-1],b=river.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<8)continue;
   const seed='riverbank:'+river.id+':'+i;if(hash(seed)>.30)continue;
   const side=hash(seed+':side')<.5?-1:1,d=(river.width||3)/2+5;
   candidates.push({kind:hash(seed+':type')<.62?'bush':'tree',x:(a[0]+b[0])/2-side*dz/len*d,z:(a[1]+b[1])/2+side*dx/len*d,seed,priority:.15+hash(seed+':rank')*.6});
  }
 }
 for(const house of field.osm.buildings||[]){
  const poly=house.footprint;if(!poly||poly.length<3)continue;const seed='yard:'+house.id;if(hash(seed)>.22)continue;
  const a=poly[0],b=poly[1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<4)continue;
  const side=hash(seed+':side')<.5?-1:1;
  candidates.push({kind:'bush',x:(a[0]+b[0])/2-side*dz/len*4,z:(a[1]+b[1])/2+side*dx/len*4,seed,priority:.4+hash(seed+':rank')*.5});
 }
 // Local deterministic hash order avoids systematic empty map corners.
 candidates.sort((a,b)=>a.priority-b.priority||a.seed.localeCompare(b.seed));
 for(const item of candidates){
  if(out.length>=maxTotal)break;
  add(item.kind,item.x,item.z,item.seed,item.observedCanopy);
 }
 return out;
}

// Lightweight instanced street furniture and park details. OSM polygons are
// mapped; all object positions here are procedural scenery estimates.
function addLandscapeDetails(group,entry,field,overlay,reserved,benchTemplate=null,fenceTemplate=null){
 const spots=[],parks=[];
 const safe=(x,z,r=1)=>{
  if(Math.abs(x)>field.size/2-3||Math.abs(z)>field.size/2-3||
     reserved.some(p=>Math.hypot(x-p.x,z-p.z)<(p.radius||8)+r)||
     occupied(x,z,field))return false;
  return !spots.some(p=>Math.hypot(x-p.x,z-p.z)<(p.spacing||5));
 };
 for(const road of field.osm.roads||[]){
  if(road.bridge||road.tunnel||!['residential','living_street','tertiary','unclassified'].includes(road.kind))continue;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
   if(len<5)continue;
   const seed='street:'+road.id+':'+Math.round((a[0]+b[0])/2+entry.offset[0])+':'+Math.round((a[1]+b[1])/2+entry.offset[1]);
   if(hash(seed)>.20)continue;
   const side=hash(seed+':side')<.5?-1:1,d=(road.width||4)/2+3.2;
   const x=(a[0]+b[0])/2-side*dz/len*d,z=(a[1]+b[1])/2+side*dx/len*d;
   if(!safe(x,z,1)||spots.some(p=>Math.hypot(x-p.x,z-p.z)<35))continue;
   spots.push({kind:hash(seed+':type')<.67?'pole':'lamp',x,z,yaw:Math.atan2(dx,dz),spacing:8});
   if(spots.length>=45)break;
  }
  if(spots.length>=45)break;
 }
 for(const area of overlay.areas||[]){
  if(parks.length>=24)break;
  if(area.kind!=='park'||!Array.isArray(area.ring)||area.ring.length<3)continue;
  const ring=area.ring,xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  const minX=Math.max(-field.size/2,Math.min(...xs)),maxX=Math.min(field.size/2,Math.max(...xs));
  const minZ=Math.max(-field.size/2,Math.min(...zs)),maxZ=Math.min(field.size/2,Math.max(...zs));
  const size=(maxX-minX)*(maxZ-minZ);if(size<100)continue;
  const options=[];
  for(let i=1;i<=4;i++)for(let j=1;j<=4;j++){
   const x=minX+(maxX-minX)*i/5,z=minZ+(maxZ-minZ)*j/5;
   if(inside(x,z,ring)&&!(area.holes||[]).some(h=>inside(x,z,h)))options.push({x,z});
  }
  let count=0,limit=Math.min(5,Math.max(1,Math.floor(size/1200)));
  for(const p of options){
   if(!safe(p.x,p.z,2)||parks.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<13))continue;
   parks.push({...p,kind:count===1&&size>1800?'play':count>=2&&count%2===0&&size>1800?'garden':'bench',yaw:hash(area.id+':'+count)*Math.PI*2,spacing:5});
   count++;if(count>=limit)break;
  }
 }
 const batches=new Map(),queue=(key,geometry,color,x,y,z,scaleX,scaleY,scaleZ,yaw=0)=>{
  if(!batches.has(key))batches.set(key,{geometry,color,items:[]});
  batches.get(key).items.push({x,y,z,scaleX,scaleY,scaleZ,yaw});
 };
 // Unit boxes/cylinders are shared inside each material batch.
 const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(.5,.5,1,6);
 const ground=(x,z)=>terrainMeshHeight(field.terrain,x,z)-field.terrain.min;
 for(const p of spots){
  const y=ground(p.x,p.z),lamp=p.kind==='lamp',height=lamp?4.4:5.7;
  queue('pole',cylinder,0x777976,p.x,y+height/2,p.z,.19,height,.19,p.yaw);
  queue('arm',box,0x777976,p.x,y+height-.15,p.z,lamp?.65:1.15,.12,.12,p.yaw);
  if(lamp)queue('light',box,0xe9dbb4,p.x,y+height-.30,p.z,.48,.14,.3,p.yaw);
 }
 for(const p of parks){
  const y=ground(p.x,p.z);
  if(p.kind==='bench'&&!benchTemplate){
   queue('bench',box,0x8c6548,p.x,y+.48,p.z,1.55,.15,.48,p.yaw);
   queue('benchback',box,0x8c6548,p.x,y+.90,p.z,1.55,.70,.12,p.yaw);
   queue('benchlegs',box,0x696762,p.x,y+.22,p.z,1.10,.44,.17,p.yaw);
  }else if(p.kind==='bench'){
   // Drawn as one instanced GLB batch below.
  }else if(p.kind==='garden'){
   queue('planter',box,0x9b7657,p.x,y+.16,p.z,2.4,.32,.9,p.yaw);
   queue('gardenflowers',box,0xe3a477,p.x,y+.43,p.z,2.1,.35,.65,p.yaw);
   queue('gardenflowers2',box,0xe9d68d,p.x+.25*Math.sin(p.yaw),y+.48,p.z+.25*Math.cos(p.yaw),1.8,.25,.18,p.yaw);
  }else{
   queue('playposts',box,0xb47757,p.x-.9*Math.cos(p.yaw),y+.95,p.z+.9*Math.sin(p.yaw),.15,1.9,.15,p.yaw);
   queue('playposts',box,0xb47757,p.x+.9*Math.cos(p.yaw),y+.95,p.z-.9*Math.sin(p.yaw),.15,1.9,.15,p.yaw);
   queue('playbeam',box,0xb47757,p.x,y+1.88,p.z,1.95,.15,.15,p.yaw);
   queue('playseat',box,0xe2b96b,p.x,y+.55,p.z,1.0,.12,.35,p.yaw);
   queue('playside',box,0xc78463,p.x,y+1.12,p.z,.12,1.5,.12,p.yaw);
  }
 }
 // Short painted footpaths stay inside mapped park polygons and avoid
 // reserved points; they do not add collision or alter the walkable ground.
 let pathSegments=0;const pathVertices=[];
 for(const area of overlay.areas||[]){
  if(area.kind!=='park'||!Array.isArray(area.ring)||area.ring.length<3)continue;
  const ring=area.ring,xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  if((x1-x0)*(z1-z0)<1500)continue;
  const alongX=x1-x0>=z1-z0,fixed=alongX?(z0+z1)/2:(x0+x1)/2,from=alongX?x0:z0,to=alongX?x1:z1;
  for(let v=from+2;v<to-2;v+=3){
   const x=alongX?v:fixed,z=alongX?fixed:v,a=alongX?[x-1.3,z]:[x,z-1.3],b=alongX?[x+1.3,z]:[x,z+1.3];
   if(!inside(x,z,ring)||!inside(a[0],a[1],ring)||!inside(b[0],b[1],ring)||
      (area.holes||[]).some(h=>inside(x,z,h))||parks.some(p=>Math.hypot(x-p.x,z-p.z)<2)||!safe(x,z,1))continue;
   pathVertices.push(...buildRoadRibbon(alongX?[x-1.5,z]:[x,z-1.5],alongX?[x+1.5,z]:[x,z+1.5],1.1,field,.16,roadSurfaceOptions('full')));
   if(++pathSegments>=80)break;
  }
  if(pathSegments>=80)break;
 }
 // Keep fine street and park details in the existing tile LOD group.
 const details=new THREE.Group();details.name='estimated-landscape-details';
 for(const [key,b] of batches){
  const mesh=new THREE.InstancedMesh(b.geometry.clone(),new THREE.MeshLambertMaterial({color:b.color}),b.items.length);
  mesh.name='estimated-'+key;mesh.frustumCulled=false;mesh.raycast=()=>{};
  const object=new THREE.Object3D();
  b.items.forEach((p,i)=>{object.position.set(p.x,p.y,p.z);object.scale.set(p.scaleX,p.scaleY,p.scaleZ);object.rotation.set(0,p.yaw,0);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);});
  mesh.instanceMatrix.needsUpdate=true;details.add(mesh);
 }
 if(pathVertices.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pathVertices,3));const normals=new Float32Array(pathVertices.length);for(let i=1;i<normals.length;i+=3)normals[i]=1;geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));const path=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:0xc9b893,side:THREE.DoubleSide}));path.name='estimated-parkpath';path.raycast=()=>{};details.add(path);}
 if(benchTemplate){
  const items=parks.filter(p=>p.kind==='bench'),unit=benchTemplate.box.max.y-benchTemplate.box.min.y;
  for(const source of benchTemplate.meshes){if(!items.length)break;const mesh=new THREE.InstancedMesh(source.geometry.clone(),Array.isArray(source.material)?source.material.map(m=>m.clone()):source.material.clone(),items.length),obj=new THREE.Object3D(),matrix=new THREE.Matrix4();
   items.forEach((p,i)=>{const scale=.9/unit;obj.position.set(p.x,ground(p.x,p.z)-benchTemplate.box.min.y*scale,p.z);obj.rotation.set(0,p.yaw,0);obj.scale.setScalar(scale);obj.updateMatrix();matrix.multiplyMatrices(obj.matrix,source.matrixWorld);mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.name='park-model-bench';mesh.raycast=()=>{};details.add(mesh);
  }
 }
 group.add(details);group.userData.landscapeDetails=details;
 box.dispose();cylinder.dispose();
 group.userData.estimatedStreetFurniture=spots.length;
 group.userData.estimatedParkFurniture=parks.length;
 group.userData.estimatedParkPaths=pathSegments;
}

export function createVegetationRenderer({baseURL,loader=new GLTFLoader()}){
 const templates=new Map();
 const url=name=>baseURL.replace(/\/?$/,'/')+'assets/nature/'+name+'.glb';
 async function getModel(name){
  if(!templates.has(name))templates.set(name,loader.loadAsync(url(name)).then(gltf=>{
   gltf.scene.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(gltf.scene);
   if(!Number.isFinite(box.min.y)||!Number.isFinite(box.max.y)||box.max.y-box.min.y<.0001)
    throw Error('Invalid nature GLB geometry: '+name);
   const meshes=[];
   gltf.scene.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh)meshes.push(o);});
   if(!meshes.length)throw Error('No static meshes in nature model: '+name);
   return {box,meshes,scene:gltf.scene};
  }));
  return templates.get(name);
 }
 async function build(entry,field,overlay,options={}){
  const placement=sampleVegetation(entry,field,overlay,options);
  const group=new THREE.Group();group.name='mapped-vegetation-'+entry.id;
  const groups=new Map();
  for(const item of placement){
   if(!groups.has(item.model))groups.set(item.model,[]);
   groups.get(item.model).push(item);
  }
  try{
   for(const [name,items] of groups){
    const {box,meshes}=await getModel(name).catch(()=>getModel(name.startsWith('new-tree')?'tree_default':name));
    const unit=box.max.y-box.min.y;
    for(const source of meshes){
     const geometry=source.geometry.clone();
     const material=Array.isArray(source.material)?source.material.map(m=>m.clone()):source.material.clone();
     const batch=new THREE.InstancedMesh(geometry,material,items.length);
     batch.name='nature-'+name;
     batch.frustumCulled=false; // Parent tile group performs AABB culling.
     const object=new THREE.Object3D(),matrix=new THREE.Matrix4();
     const tintable=options.individualColors!==false&&!(Array.isArray(material)?material:[material]).some(m=>m.map);
     items.forEach((item,index)=>{
      const scale=item.height/unit;
      object.position.set(item.x,terrainMeshHeight(field.terrain,item.x,item.z)-field.terrain.min+.05-box.min.y*scale,item.z);
      object.rotation.set(0,item.yaw,0);
      object.scale.setScalar(scale);object.updateMatrix();
      matrix.multiplyMatrices(object.matrix,source.matrixWorld);
      batch.setMatrixAt(index,matrix);
      const tint=tintable&&natureTint(item.kind,item.x+entry.offset[0],item.z+entry.offset[1]);
      if(tint)batch.setColorAt(index,new THREE.Color().setRGB(...tint));
     });
     batch.instanceMatrix.needsUpdate=true;
     if(batch.instanceColor)batch.instanceColor.needsUpdate=true;
     group.add(batch);
    }
   }
   addContactShadows(field,group,placement.filter(p=>p.kind==='tree').map(p=>({x:p.x-.65,z:p.z-.4,width:p.height*.85,depth:p.height*.7})));
   const benchTemplate=await getModel('new-bench').catch(()=>null);
   addLandscapeDetails(group,entry,field,overlay,[...(options.reserved||[]),...placement.filter(p=>p.kind==='tree'||p.kind==='bush').map(p=>({x:p.x,z:p.z,radius:p.kind==='tree'?2.8:1.2}))],benchTemplate);
   group.userData.vegetationCount=placement.length;
   return group;
  }catch(error){
   group.traverse(o=>{if(o.isInstancedMesh){
    o.geometry.dispose();
    const mats=Array.isArray(o.material)?o.material:[o.material];
    mats.forEach(m=>m.dispose());
   }});
   throw error;
  }
 }
 function dispose(){
  for(const promise of templates.values())promise.then(({meshes})=>{
   const geometry=new Set(meshes.map(x=>x.geometry)),materials=new Set(meshes.flatMap(x=>Array.isArray(x.material)?x.material:[x.material]));
   geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }).catch(()=>{});
  templates.clear();
 }
 return {build,dispose};
}

