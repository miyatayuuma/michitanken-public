// Diagnostic only. Does not move vertices or overwrite water profiles.
import fs from 'node:fs/promises';import path from 'node:path';
import {fitGlobalWaterProfiles,profilesInLocalSpace} from '../lib/tile-water.mjs';
import {waterVertex,distanceToSegment} from '../lib/water-field.mjs';
import {terrainMeshHeight} from '../lib/geo.mjs';import {distanceFromRect} from '../lib/tiles.mjs';
const [rootArg,out]=process.argv.slice(2),root=path.resolve(rootArg),m=JSON.parse(await fs.readFile(root+'/public/data/tiles.json'));
const snapshots=await Promise.all(m.tiles.map(async tile=>({tile,field:JSON.parse(await fs.readFile(root+'/public/'+tile.url))})));
const all=fitGlobalWaterProfiles(snapshots,m),rows=[];
for(const s of snapshots){
 const {tile,field}=s,one=profilesInLocalSpace(fitGlobalWaterProfiles([s],m),tile),global=profilesInLocalSpace(all,tile);
 for(const line of field.osm.waterways){
  if(line.tunnel||line.layer<0)continue;
  const p=line.points[0],q=line.points.at(-1),mid=[(p[0]+q[0])/2,(p[1]+q[1])/2],x=mid[0]+tile.offset[0],z=mid[1]+tile.offset[1];
  const nearby=snapshots.filter(s=>distanceFromRect(x,z,s.tile,m.size)<=205);
  const near=profilesInLocalSpace(fitGlobalWaterProfiles(nearby,m),tile);
  const h=profiles=>waterVertex(field,mid,profiles,null).position[1]+field.terrain.min;
  rows.push({tile:tile.id,id:line.id,point:[x,z],oneTile:h(one),nearby:h(near),all:h(global),ground:terrainMeshHeight(field.terrain,...mid),nearbyTiles:nearby.map(s=>s.tile.id)});
 }
}
rows.sort((a,b)=>Math.abs(b.oneTile-b.all)-Math.abs(a.oneTile-a.all));
await fs.writeFile(out,JSON.stringify({rendererWaterDepthTest:false,profileInput:'current CPU snapshot cache, not whole-field fixed authority',maxCacheDependentShift:Math.max(...rows.map(r=>Math.abs(r.oneTile-r.all))),segments:rows.length,rows},null,2));
console.log(JSON.stringify({segments:rows.length,maxCacheDependentShift:Math.max(...rows.map(r=>Math.abs(r.oneTile-r.all)))}));
