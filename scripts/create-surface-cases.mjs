// Coordinates in the output inherit the visibility of the supplied field.
import fs from 'node:fs/promises';import {gridSample} from '../lib/geo.mjs';
import {chooseSpawn,createCollisionWorld} from '../lib/navigation.mjs';
const [root,out]=process.argv.slice(2),manifest=JSON.parse(await fs.readFile(root+'/public/data/tiles.json'));
const snapshots=await Promise.all(manifest.tiles.map(async tile=>({tile,field:JSON.parse(await fs.readFile(root+'/public/'+tile.url))})));
const base=snapshots.find(s=>s.tile.id==='north').field.terrain.min;
function ground(x,z){const s=snapshots.find(s=>Math.abs(x-s.tile.offset[0])<=250&&Math.abs(z-s.tile.offset[1])<=250);return s?gridSample(s.field.terrain,x-s.tile.offset[0],z-s.tile.offset[1])-base:0;}
const cases=[];
for(const {tile,field} of snapshots){
 const spawn=chooseSpawn(createCollisionWorld(field)),x=tile.offset[0]+spawn.x,z=tile.offset[1]+spawn.z,y=ground(x,z);
 const ids=manifest.tiles.filter(t=>Math.hypot(Math.max(0,Math.abs(x-t.offset[0])-250),Math.max(0,Math.abs(z-t.offset[1])-250))<210).map(t=>t.id);
 for(const [view,height,distance,detail]of [['overview',780,110,'overview'],['walk',6,14,'full'],['oblique',1.8,32,'full']]){
  const px=x+Math.sin(spawn.yaw)*distance,pz=z+Math.cos(spawn.yaw)*distance;
  cases.push({name:tile.id+'-'+view,ids,detail,position:[px,Math.max(y,ground(px,pz))+height,pz],target:[x,y+.3,z]});
 }
}
await fs.writeFile(out,JSON.stringify(cases,null,2));
