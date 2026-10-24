import {terrainMeshHeight} from './geo.mjs';
import {validateManifest,tileAtPosition,adjacentTilePairs} from './tiles.mjs';

export const BIOMES=Object.freeze(['urban','grassland','woodland','waterside']);
export const BIOME_COLORS=Object.freeze({urban:'#b9a48d',grassland:'#a8cd65',woodland:'#477d51',waterside:'#5ba4c6'});
import {DEFAULT_SPAWN_POLICY,BIOME_OBJECTS} from './spawn-policy.mjs';
export {DEFAULT_SPAWN_POLICY,BIOME_OBJECTS} from './spawn-policy.mjs';
export function pointInRing(x,z,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],q=dx*dx+dz*dz,t=q?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/q)):0;return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
const pathDistance=(x,z,p)=>{let d=Infinity;for(let i=1;i<p.length;i++)d=Math.min(d,segmentDistance(x,z,p[i-1],p[i]));return d;};
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0)/4294967296;};
const ringDistance=(x,z,p)=>pathDistance(x,z,[...p,p[0]]);
// Conservative maximum gradient of both rendered DEM triangles in every
// grid cell intersecting the candidate's bounding square. Finite differences
// alone could miss a narrow ridge with equal heights on opposite sides.
function footprintSlope(grid,x,z,radius){
 const cell=grid.size/(grid.count-1),h=grid.size/2;
 const lo=v=>Math.max(0,Math.min(grid.count-2,Math.floor((v+h)/cell)));
 let max=0;
 for(let row=lo(z-radius);row<=lo(z+radius);row++)for(let col=lo(x-radius);col<=lo(x+radius);col++){
  const a=grid.elevations[row*grid.count+col],b=grid.elevations[row*grid.count+col+1],c=grid.elevations[(row+1)*grid.count+col],d=grid.elevations[(row+1)*grid.count+col+1];
  max=Math.max(max,Math.hypot(b-a,c-a)/cell,Math.hypot(d-c,d-b)/cell);
 }
 return max;
}
const finiteRing=p=>Array.isArray(p)&&p.length>=3&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite));
/** A global spatial index includes neighbouring tile features, so clipping cannot
 * create safe-looking gaps along roads, water or buildings at tile borders. */
export function createBiomeWorld({manifest,tiles,overlays=new Map(),pois=[]}){
 validateManifest(manifest);const buckets=new Map(),size=40;
 const add=f=>{
  const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]),margin=f.margin||0;
  for(let x=Math.floor((Math.min(...xs)-margin)/size);x<=Math.floor((Math.max(...xs)+margin)/size);x++)for(let z=Math.floor((Math.min(...zs)-margin)/size);z<=Math.floor((Math.max(...zs)+margin)/size);z++){
   const k=x+':'+z;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(f);
  }
 };
 for(const entry of manifest.tiles){
  const field=tiles.get(entry.id);if(!field)throw Error('Missing biome tile '+entry.id);
  const g=field.terrain;if(!g||g.size!==500||!Number.isInteger(g.count)||g.count<3||!Number.isFinite(g.validRatio)||g.validRatio<0||g.validRatio>1||g.elevations?.length!==g.count*g.count||!g.elevations.every(Number.isFinite))throw Error('Invalid biome terrain '+entry.id);
  if(['roads','buildings','waterways','waterAreas','railways'].some(k=>!Array.isArray(field.osm?.[k])))throw Error('Missing biome safety geometry '+entry.id);
  const shift=p=>p.map(v=>[v[0]+entry.offset[0],v[1]+entry.offset[1]]),osm=field.osm||{};
  for(const b of osm.buildings||[]){if(!finiteRing(b.footprint))throw Error('Invalid biome building');add({type:'building',points:shift(b.footprint),margin:4});}
  for(const a of osm.waterAreas||[]){if(!finiteRing(a.footprint))throw Error('Invalid biome water');add({type:'water',points:shift(a.footprint),margin:20});}
  for(const [key,type,defaultWidth] of [['roads','road',4],['railways','rail',8],['waterways','river',3]])for(const a of osm[key]||[]){
   if(!Array.isArray(a.points)||a.points.length<2||!a.points.every(p=>p.length===2&&p.every(Number.isFinite)))throw Error('Invalid biome line');
   // Buried channels are not surface habitat. Roads/rail are conservatively
   // reserved in plan view even when their grade metadata says tunnel/bridge.
   if(type==='river'&&(a.tunnel||a.layer<0))continue;
   const width=Number.isFinite(a.width)&&a.width>0?a.width:defaultWidth;
   add({type,points:shift(a.points),width,margin:width/2+(type==='river'?20:5)});
  }
  const overlay=overlays.get(entry.id);
  if(overlay&&(overlay.schema!==1||overlay.tileId!==entry.id||!Array.isArray(overlay.areas)))throw Error('Invalid biome vegetation');
  for(const a of overlay?.areas||[]){if(!finiteRing(a.ring)||(a.holes||[]).some(h=>!finiteRing(h)))throw Error('Invalid biome green area');
   add({type:'green',kind:a.kind,points:shift(a.ring),holes:(a.holes||[]).map(shift)});
  }
  for(const t of overlay?.trees||[]){if(!Array.isArray(t)||t.length!==2||!t.every(Number.isFinite))throw Error('Invalid biome tree');add({type:'tree',points:[[t[0]+entry.offset[0],t[1]+entry.offset[1]]],margin:6});}
 }
 const nearby=(x,z)=>buckets.get(Math.floor(x/size)+':'+Math.floor(z/size))||[];
 const height=(x,z)=>{const e=tileAtPosition(manifest,x,z);if(!e)return null;return terrainMeshHeight(tiles.get(e.id).terrain,x-e.offset[0],z-e.offset[1]);};
 function inspect(x,z,policy=DEFAULT_SPAWN_POLICY){
  const entry=tileAtPosition(manifest,x,z);if(!entry)return {biome:null,reason:'outside'};
  let biome='urban',waterDistance=Infinity,wet=false,building=false,road=false,rail=false,tree=false;
  const greens=[];
  for(const f of nearby(x,z)){
   const ring=f.points;
   if(f.type==='building'&&(pointInRing(x,z,ring)||ringDistance(x,z,ring)<policy.radius))building=true;
   if(f.type==='road'&&pathDistance(x,z,ring)<f.width/2+policy.radius+1)road=true;
   if(f.type==='rail'&&pathDistance(x,z,ring)<f.width/2+policy.radius+2)rail=true;
   if(f.type==='tree'&&Math.hypot(x-ring[0][0],z-ring[0][1])<policy.radius+1.5)tree=true;
   if(f.type==='water'){const inside=pointInRing(x,z,ring);waterDistance=Math.min(waterDistance,inside?0:ringDistance(x,z,ring));wet ||= inside;}
   if(f.type==='river'){const d=pathDistance(x,z,ring)-f.width/2;waterDistance=Math.min(waterDistance,Math.max(0,d));wet ||= d<=0;}
   if(f.type==='green'&&pointInRing(x,z,ring)&&!f.holes.some(h=>pointInRing(x,z,h)))greens.push(f.kind);
  }
  if(greens.some(k=>['wood','grove','canopy'].includes(k)))biome='woodland';
  else if(greens.some(k=>['park','grass','scrub','shrub'].includes(k)))biome='grassland';
  if(waterDistance<=policy.waterBand)biome='waterside';
  const y=height(x,z),samples=[[x-2,z],[x+2,z],[x,z-2],[x,z+2]].map(p=>height(...p));
  let slope=samples.every(Number.isFinite)?Math.hypot((samples[1]-samples[0])/4,(samples[3]-samples[2])/4):Infinity;
  for(const t of manifest.tiles){if(Math.max(0,Math.abs(x-t.offset[0])-250)>policy.radius||Math.max(0,Math.abs(z-t.offset[1])-250)>policy.radius)continue;slope=Math.max(slope,footprintSlope(tiles.get(t.id).terrain,x-t.offset[0],z-t.offset[1],policy.radius));}
  let reason=!Number.isFinite(y)?'elevation':samples.some(v=>v===null)?'edge':tiles.get(entry.id).terrain.validRatio<1?'uncertain-elevation':building?'building':road?'road':rail?'rail':wet?'water':waterDistance<policy.radius+1?'bank-clearance':tree?'tree':slope>policy.maxSlope?'slope':null;
  // A candidate with radius crossing a seam needs both tiles to agree at the boundary.
  if(!reason)for(const other of manifest.tiles){
   if(other.id===entry.id)continue;
   const dx=Math.max(0,Math.abs(x-other.offset[0])-250),dz=Math.max(0,Math.abs(z-other.offset[1])-250);
   if(Math.hypot(dx,dz)>policy.radius+2)continue;
   const bx=Math.max(other.offset[0]-250,Math.min(other.offset[0]+250,x)),bz=Math.max(other.offset[1]-250,Math.min(other.offset[1]+250,z));
   const a=terrainMeshHeight(tiles.get(entry.id).terrain,bx-entry.offset[0],bz-entry.offset[1]);
   const b=terrainMeshHeight(tiles.get(other.id).terrain,bx-other.offset[0],bz-other.offset[1]);
   if(Math.abs(a-b)>policy.seamTolerance){reason='seam';break;}
  }
  const relatedPoiIds=pois.filter(p=>Math.hypot(p.position[0]-x,p.position[2]-z)<=40).map(p=>p.id).sort();
  return {tileId:entry.id,biome,y,slope,wet,waterDistance:Number.isFinite(waterDistance)?waterDistance:null,ground:'dry',relatedPoiIds,reason};
 }
 return {manifest,tiles,inspect,height};
}
/** Grid-cell centres give stable world IDs and a minimum spacing equal to step.
 * Area is a sampled estimate (not cadastral area), including excluded surfaces. */
export function generateBiomeCandidates(world,options={}){
 const p={...DEFAULT_SPAWN_POLICY,...options};
 if(!Number.isInteger(p.step)||p.step<5||500%p.step!==0||!Number.isFinite(p.density)||p.density<0||p.density>1||!Number.isFinite(p.radius)||!Number.isFinite(p.maxSlope)||!Number.isFinite(p.seamTolerance)||typeof p.seed!=='string'||!/^[-a-z0-9]{1,64}$/.test(p.seed)||p.radius<=0||p.radius>2||!Number.isFinite(p.waterBand)||p.waterBand<0||p.waterBand>16||p.maxSlope<0||p.seamTolerance<0)throw Error('Invalid spawn policy');
 const candidates=[],samples=[],byTile={},totals=Object.fromEntries(BIOMES.map(b=>[b,{areaM2:0,candidates:0}])),excluded={};
 for(const e of [...world.manifest.tiles].sort((a,b)=>a.id.localeCompare(b.id))){
  const counts=Object.fromEntries(BIOMES.map(b=>[b,{areaM2:0,candidates:0}]));const reasons={};
  for(let x=e.offset[0]-250+p.step/2;x<e.offset[0]+250;x+=p.step)for(let z=e.offset[1]-250+p.step/2;z<e.offset[1]+250;z+=p.step){
   const id=`${p.seed}:${x}:${z}`,s=world.inspect(x,z,p);counts[s.biome].areaM2+=p.step*p.step;totals[s.biome].areaM2+=p.step*p.step;
   const reason=s.reason||(hash(id+':density')>=p.density?'density':null);
   samples.push({position:[x,s.y,z],biome:s.biome,reason,tileId:e.id});
   if(reason){reasons[reason]=(reasons[reason]||0)+1;excluded[reason]=(excluded[reason]||0)+1;continue;}
   candidates.push({id,position:[x,s.y,z],tileId:e.id,biome:s.biome,terrain:{slope:s.slope,waterDistance:s.waterDistance,surface:'dry-ground',clearance:p.radius},allowedObjectTypes:[...BIOME_OBJECTS[s.biome]],relatedPoiIds:s.relatedPoiIds});counts[s.biome].candidates++;totals[s.biome].candidates++;
  }
  byTile[e.id]={biomes:counts,excluded:reasons};
 }
 const seams=adjacentTilePairs(world.manifest).map(([a,b])=>{
  let maxHeightDelta=0,classificationChanges=0;
  for(let i=0;i<=100;i++){
   const x=a.offset[0]===b.offset[0]?a.offset[0]-250+i*5:(a.offset[0]+b.offset[0])/2;
   const z=a.offset[1]===b.offset[1]?a.offset[1]-250+i*5:(a.offset[1]+b.offset[1])/2;
   const ya=terrainMeshHeight(world.tiles.get(a.id).terrain,x-a.offset[0],z-a.offset[1]),yb=terrainMeshHeight(world.tiles.get(b.id).terrain,x-b.offset[0],z-b.offset[1]);
   maxHeightDelta=Math.max(maxHeightDelta,Math.abs(ya-yb));
   const dx=a.offset[0]===b.offset[0]?0:.01,dz=a.offset[1]===b.offset[1]?0:.01;
   if(world.inspect(x-dx,z-dz,p).biome!==world.inspect(x+dx,z+dz,p).biome)classificationChanges++;
  }
  return {tiles:[a.id,b.id],maxHeightDelta,classificationChanges};
 });
 return {schema:1,policy:p,areaMethod:'world grid cell centres; sampled estimate',totals,byTile,excluded,seams,candidates,samples};
}
