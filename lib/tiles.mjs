import {unproject,gridSample} from './geo.mjs';
import {createCollisionWorld,collisionReason as singleCollision} from './navigation.mjs';

export const TILE_SIZE=500;
export const PRELOAD_DISTANCE=205;
export const RELEASE_DISTANCE=325;

export function validateManifest(manifest){
 if(manifest?.schema!==1||manifest.size!==TILE_SIZE||!manifest.center||
   !Number.isFinite(manifest.center.lat)||!Number.isFinite(manifest.center.lon)||
   !Array.isArray(manifest.tiles)||manifest.tiles.length<2)throw Error('Invalid tile manifest');
 const seen=new Set(),offsets=new Set(),xs=new Set(),zs=new Set();
 for(const tile of manifest.tiles){
  if(!/^[a-z][a-z0-9-]*$/.test(tile.id)||seen.has(tile.id)||
    !Array.isArray(tile.offset)||tile.offset.length!==2||
    !tile.offset.every(n=>Number.isInteger(n)&&n%TILE_SIZE===0)||
    typeof tile.url!=='string'||!/^data\/[a-z0-9/_-]+\.json$/.test(tile.url))
    throw Error('Invalid manifest tile');
  const key=tile.offset.join(':');
  if(offsets.has(key))throw Error('Duplicate tile offset: '+key);
  offsets.add(key);xs.add(tile.offset[0]);zs.add(tile.offset[1]);
  seen.add(tile.id);
 }
 const ordered=value=>[...value].sort((a,b)=>a-b);
 const X=ordered(xs),Z=ordered(zs);
 if(X.length*Z.length!==manifest.tiles.length||
    X.some((x,i)=>i&&x-X[i-1]!==TILE_SIZE)||
    Z.some((z,i)=>i&&z-Z[i-1]!==TILE_SIZE))throw Error('Tile manifest has gaps or inconsistent grid spacing');
 return true;
}
export function tileAtPosition(manifest,x,z){
 const h=manifest.size/2;
 return manifest.tiles.find(t=>x>=t.offset[0]-h&&x<t.offset[0]+h&&
   z>=t.offset[1]-h&&z<t.offset[1]+h)||
   manifest.tiles.find(t=>x>=t.offset[0]-h&&x<=t.offset[0]+h&&
   z>=t.offset[1]-h&&z<=t.offset[1]+h)||null;
}
export function adjacentTilePairs(manifest){
 validateManifest(manifest);
 const pairs=[];
 for(let i=0;i<manifest.tiles.length;i++)for(let j=i+1;j<manifest.tiles.length;j++){
  const a=manifest.tiles[i],b=manifest.tiles[j],dx=b.offset[0]-a.offset[0],dz=b.offset[1]-a.offset[1];
  if(Math.abs(dx)+Math.abs(dz)===manifest.size)pairs.push([a,b]);
 }
 return pairs;
}
export function distanceFromRect(x,z,tile,size=TILE_SIZE){
 const h=size/2,dx=Math.max(0,Math.abs(x-tile.offset[0])-h),dz=Math.max(0,Math.abs(z-tile.offset[1])-h);
 return Math.hypot(dx,dz);
}
export function manifestBounds(manifest){
 const h=manifest.size/2;
 return {
  minX:Math.min(...manifest.tiles.map(t=>t.offset[0]-h)),
  maxX:Math.max(...manifest.tiles.map(t=>t.offset[0]+h)),
  minZ:Math.min(...manifest.tiles.map(t=>t.offset[1]-h)),
  maxZ:Math.max(...manifest.tiles.map(t=>t.offset[1]+h))
 };
}
export function validateTileForManifest(manifest,entry,field){
 if(field?.schema!==2||field.size!==manifest.size||!field.center||!field.terrain)throw Error('Unexpected tile snapshot');
 const expected=unproject(...[entry.offset[0],entry.offset[1],manifest.center]);
 if(Math.abs(field.center.lat-expected.lat)>1e-6||Math.abs(field.center.lon-expected.lon)>1e-6)
   throw Error(`Tile center differs from manifest: ${entry.id}`);
 return true;
}
export function createTiledWorld(manifest){
 validateManifest(manifest);
 const world={kind:'tiled',manifest,tileWorlds:new Map(),bounds:manifestBounds(manifest),baseElevation:null};
 world.getCollision=(x,z,r)=>tiledCollisionReason(world,x,z,r);
 world.getHeight=(x,z)=>tiledTerrainHeight(world,x,z);
 return world;
}
export function registerTile(world,entry,field){
 validateTileForManifest(world.manifest,entry,field);
 world.tileWorlds.set(entry.id,{entry,field,world:createCollisionWorld(field)});
 if(world.baseElevation===null)world.baseElevation=field.terrain.min;
}
export function removeTile(world,id){world.tileWorlds.delete(id);}
const boundsContains=(b,x,z,r)=>x-r>=b.minX&&x+r<=b.maxX&&z-r>=b.minZ&&z+r<=b.maxZ;
export function tiledCollisionReason(world,x,z,r){
 if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(r)||r<=0)return 'invalid';
 if(!boundsContains(world.bounds,x,z,r))return 'boundary';
 const primary=tileAtPosition(world.manifest,x,z);
 if(!primary)return 'boundary';
 if(!world.tileWorlds.has(primary.id))return 'loading';
 // Near an unloaded tile, pause until its geometry and colliders are present.
 for(const tile of world.manifest.tiles){
  if(distanceFromRect(x,z,tile,world.manifest.size)>r)continue;
  if(!world.tileWorlds.has(tile.id))return 'loading';
 }
 for(const {entry,world:local} of world.tileWorlds.values()){
  if(distanceFromRect(x,z,entry,world.manifest.size)>r)continue;
  const hit=singleCollision(local,x-entry.offset[0],z-entry.offset[1],r,true);
  if(hit)return hit;
 }
 return null;
}
export function tiledTerrainHeight(world,x,z){
 const owner=tileAtPosition(world.manifest,x,z);
 const found=owner&&world.tileWorlds.get(owner.id);
 if(!found)throw Error('Terrain requested before tile loaded: '+(owner?.id||'outside'));
 return gridSample(found.field.terrain,x-owner.offset[0],z-owner.offset[1])-
   world.baseElevation;
}
/** Compare the shared DEM edge in raw absolute metres, not local rendering Y. */
export function seamAudit(fieldA,fieldB,entryA,entryB){
 const dx=entryB.offset[0]-entryA.offset[0],dz=entryB.offset[1]-entryA.offset[1];
 const size=fieldA.size;
 if(size!==fieldB.size||Math.abs(dx)+Math.abs(dz)!==size)throw Error('Not adjacent equal-sized tiles');
 const a=fieldA.terrain,b=fieldB.terrain;
 if(a.count!==b.count)throw Error('Different DEM resolutions');
 const count=a.count,delta=[],coordinates=[];
 for(let i=0;i<count;i++){
  const ia=dx>0?i*count+count-1:dx<0?i*count:dz>0?(count-1)*count+i:i;
  const ib=dx>0?i*count:dx<0?i*count+count-1:dz>0?i:(count-1)*count+i;
  const va=a.elevations[ia],vb=b.elevations[ib];
  delta.push(Math.abs(va-vb));
  coordinates.push([ia,ib]);
 }
 return {samples:count,maxDifference:Math.max(...delta),meanDifference:delta.reduce((x,y)=>x+y,0)/count,indices:coordinates};
}
/** Roads originally sharing an OSM way ID must agree in world coordinates at tile seam. */
export function seamRoadAudit(fieldA,fieldB,entryA,entryB){
 const dx=entryB.offset[0]-entryA.offset[0],dz=entryB.offset[1]-entryA.offset[1];
 if(Math.abs(dx)+Math.abs(dz)!==fieldA.size)throw Error('Not adjacent');
 const axis=dx?0:1,value=(dx||dz)/2;
 const boundaryA=entryA.offset[axis]+value;
 const touches=(field,entry)=>field.osm.roads.flatMap(r=>r.points
   .filter(p=>Math.abs(p[axis]+entry.offset[axis]-boundaryA)<.06)
   .map(p=>({id:r.id,p:[p[0]+entry.offset[0],p[1]+entry.offset[1]]})));
 const endsA=touches(fieldA,entryA),endsB=touches(fieldB,entryB),matched=[],unmatched=[];
 for(const a of endsA){
  const b=endsB.find(x=>x.id===a.id&&Math.hypot(x.p[0]-a.p[0],x.p[1]-a.p[1])<.55);
  if(b)matched.push({id:a.id,point:a.p});
  else unmatched.push(a);
 }
 return {edgeCountA:endsA.length,edgeCountB:endsB.length,matched,unmatched,
  unmatchedB:endsB.filter(b=>!endsA.some(a=>a.id===b.id&&Math.hypot(a.p[0]-b.p[0],a.p[1]-b.p[1])<.55))};
}
/** OSM river centerline segments must meet at tile seams when their way crosses them. */
export function seamRiverAudit(fieldA,fieldB,entryA,entryB){
 const dx=entryB.offset[0]-entryA.offset[0],dz=entryB.offset[1]-entryA.offset[1];
 if(Math.abs(dx)+Math.abs(dz)!==fieldA.size)throw Error('Not adjacent');
 const axis=dx?0:1,edge=entryA.offset[axis]+(dx||dz)/2;
 const endpoints=(field,entry)=>field.osm.waterways.flatMap(r=>r.points
   .filter(p=>Math.abs(p[axis]+entry.offset[axis]-edge)<.07)
   .map(p=>({id:r.id,p:[p[0]+entry.offset[0],p[1]+entry.offset[1]]})));
 const a=endpoints(fieldA,entryA),b=endpoints(fieldB,entryB);
 const same=(p,q)=>p.id===q.id&&Math.hypot(p.p[0]-q.p[0],p.p[1]-q.p[1])<.55;
 return {edgeCountA:a.length,edgeCountB:b.length,
  matched:a.filter(p=>b.some(q=>same(p,q))),
  unmatchedA:a.filter(p=>!b.some(q=>same(p,q))),
  unmatchedB:b.filter(p=>!a.some(q=>same(p,q)))};
}
