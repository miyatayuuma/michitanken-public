import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {terrainMeshHeight} from '../lib/geo.mjs';

// Kenney Nature Kit 2.1, CC0. Models are hosted by the PRIVATE game site.
const SPEC={
 tree:{models:['tree_oak','tree_default','tree_pineDefaultA'],height:[5,9],limit:100},
 bush:{models:['plant_bush'],height:[.6,1.8],limit:180},
 grass:{models:['grass'],height:[.35,1.15],limit:310},
 flower:{models:['flower_yellowA'],height:[.35,.8],limit:65},
 rock:{models:['rock_smallA'],height:[.45,1],limit:22}
};
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
function occupied(x,z,field){
 const osm=field.osm||{};
 for(const house of osm.buildings||[]){
  if(inside(x,z,house.footprint)||nearPath(x,z,[...house.footprint,house.footprint[0]],3))return true;
 }
 for(const water of osm.waterAreas||[])if(inside(x,z,water.footprint)||nearPath(x,z,[...water.footprint,water.footprint[0]],3))return true;
 for(const road of osm.roads||[])if(nearPath(x,z,road.points,(road.width||3)/2+2.5))return true;
 for(const rail of osm.railways||[])if(nearPath(x,z,rail.points,7))return true;
 for(const river of osm.waterways||[])if(nearPath(x,z,river.points,(river.width||3)/2+3))return true;
 return false;
}
function kindForArea(tag,roll){
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
export function sampleVegetation(entry,field,overlay,{maxTotal=540}={}){
 if(overlay?.schema!==1||overlay.tileId!==entry.id||!Array.isArray(overlay.areas))return [];
 if(!Number.isInteger(maxTotal)||maxTotal<0||maxTotal>900)throw Error('Invalid nature instance budget');
 const out=[],used={tree:0,bush:0,grass:0,flower:0,rock:0},candidates=[];
 // Keep explicit tagged trees ahead of vegetation inferred from land cover.
 const add=(kind,x,z,seed)=>{
  if(!SPEC[kind]||used[kind]>=SPEC[kind].limit||out.length>=maxTotal||
     Math.abs(x)>=field.size/2-.5||Math.abs(z)>=field.size/2-.5||occupied(x,z,field))return;
  const spacing=kind==='tree'?8:kind==='bush'?2.6:1.25;
  if(out.some(p=>p.kind===kind&&Math.hypot(p.x-x,p.z-z)<spacing))return;
  const shape=SPEC[kind];
  const model=shape.models[Math.floor(hash(seed+':model')*shape.models.length)];
  const height=shape.height[0]+hash(seed+':height')*(shape.height[1]-shape.height[0]);
  out.push({kind,model,x,z,height,yaw:hash(seed+':angle')*Math.PI*2});
  used[kind]++;
 };
 for(const tree of (overlay.trees||[]).slice(0,200)){
  if(!Array.isArray(tree)||tree.length!==2||!tree.every(Number.isFinite))continue;
  add('tree',tree[0],tree[1],entry.id+':osm-tree:'+tree.join(':'));
 }
 if(out.length>=maxTotal)return out;
 const areas=overlay.areas.slice(0,500);
 for(const area of areas){
  if(!Array.isArray(area.ring)||area.ring.length<3||area.ring.length>5000)continue;
  const ring=area.ring;
  if(!ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))continue;
  const minX=Math.max(-field.size/2,Math.min(...ring.map(p=>p[0]))),
   maxX=Math.min(field.size/2,Math.max(...ring.map(p=>p[0]))),
   minZ=Math.max(-field.size/2,Math.min(...ring.map(p=>p[1]))),
   maxZ=Math.min(field.size/2,Math.max(...ring.map(p=>p[1])));
  if(maxX-minX<1||maxZ-minZ<1)continue;
  // Two passes: preserve standing trees, then carpet their gaps with small plants.
  for(const layer of ['canopy','understory']){
   const step=layer==='canopy'?(area.kind==='wood'?13:area.kind==='park'?18:20):
       area.kind==='wood'?5.5:area.kind==='grass'?5.5:area.kind==='scrub'?7:8;
   const chance=layer==='canopy'?.66:.75;
   const xmin=Math.ceil((minX+entry.offset[0])/step),
    xmax=Math.floor((maxX+entry.offset[0])/step),
    zmin=Math.ceil((minZ+entry.offset[1])/step),
    zmax=Math.floor((maxZ+entry.offset[1])/step);
   // Per-area candidate work bound protects unusual malformed/oversized OSM polygons.
   let collected=0;
   for(let gx=xmin;gx<=xmax&&collected<2600;gx++)for(let gz=zmin;gz<=zmax&&collected<2600;gz++){
    const seed=area.id+':'+layer+':'+gx+':'+gz;
    if(hash(seed+':density')>chance)continue;
    const x=gx*step-entry.offset[0]+(hash(seed+':dx')-.5)*step*.62;
    const z=gz*step-entry.offset[1]+(hash(seed+':dz')-.5)*step*.62;
    if(!inside(x,z,ring))continue;
    let kind;
    if(layer==='understory'){
     const r=hash(seed+':kind');
     kind=area.kind==='wood'?(r<.65?'grass':r<.96?'bush':'flower'):
       area.kind==='scrub'?(r<.72?'bush':'grass'):
       area.kind==='grass'?(r<.85?'grass':'flower'):
       (r<.68?'grass':r<.92?'bush':'flower');
    }else{
     kind=kindForArea(area.kind,hash(seed+':kind'));
     if(layer==='canopy'&&kind==='grass')continue; // grass belongs in understory
    }
    if(!SPEC[kind])continue;
    candidates.push({kind,x,z,seed,priority:hash(seed+':priority')});
    collected++;
   }
  }
 }
 // Local deterministic hash order avoids systematic empty map corners.
 candidates.sort((a,b)=>a.priority-b.priority||a.seed.localeCompare(b.seed));
 for(const item of candidates){
  if(out.length>=maxTotal)break;
  add(item.kind,item.x,item.z,item.seed);
 }
 return out;
}

export function createVegetationRenderer({baseURL}){
 const loader=new GLTFLoader(),templates=new Map();
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
    const {box,meshes}=await getModel(name);
    const unit=box.max.y-box.min.y;
    for(const source of meshes){
     const geometry=source.geometry.clone();
     const material=Array.isArray(source.material)?source.material.map(m=>m.clone()):source.material.clone();
     const batch=new THREE.InstancedMesh(geometry,material,items.length);
     batch.name='nature-'+name;
     batch.frustumCulled=false; // Parent tile group performs AABB culling.
     const object=new THREE.Object3D(),matrix=new THREE.Matrix4();
     items.forEach((item,index)=>{
      const scale=item.height/unit;
      object.position.set(item.x,terrainMeshHeight(field.terrain,item.x,item.z)-field.terrain.min+.05-box.min.y*scale,item.z);
      object.rotation.set(0,item.yaw,0);
      object.scale.setScalar(scale);object.updateMatrix();
      matrix.multiplyMatrices(object.matrix,source.matrixWorld);
      batch.setMatrixAt(index,matrix);
     });
     batch.instanceMatrix.needsUpdate=true;
     group.add(batch);
    }
   }
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
