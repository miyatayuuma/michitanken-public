// Real field reports are PRIVATE; fictional inputs are suitable for PUBLIC CI.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createTiledWorld,registerTile,adjacentTilePairs,seamRoadAudit} from '../lib/tiles.mjs';
import {chooseSpawn,createCollisionWorld,advancePlayer,collisionReason} from '../lib/navigation.mjs';
import {validateLanding} from '../lib/warp.mjs';
import {sampleVegetation} from '../src/vegetation.js';import {wildlifeCandidates} from '../src/wildlife.js';
import {distanceToSegment} from '../lib/water-field.mjs';
import {applyRoadSupplement} from '../lib/road-supplement.mjs';
const [beforeArg,afterArg,out]=process.argv.slice(2),before=path.resolve(beforeArg),after=path.resolve(afterArg);
const read=async p=>JSON.parse(await fs.readFile(p)),m=await read(before+'/public/data/tiles.json'),ma=await read(after+'/public/data/tiles.json');
assert.deepEqual(ma.tiles,m.tiles);
const supplement=ma.roadSupplement?await read(after+'/public/'+ma.roadSupplement):null;
const worlds=[createTiledWorld(m),createTiledWorld(ma)],fields=[new Map(),new Map()],rows=[];
for(const t of m.tiles){
 const original=await read(before+'/public/'+t.url),rawAfter=await read(after+'/public/'+t.url);assert.deepEqual(rawAfter,original);
 const corrected=applyRoadSupplement(rawAfter,t,supplement);
 for(const [i,f]of [original,corrected].entries()){registerTile(worlds[i],t,f);fields[i].set(t.id,f);}
 const spawn=chooseSpawn(createCollisionWorld(original));
 const p={...spawn,x:spawn.x+t.offset[0],z:spawn.z+t.offset[1]};
 rows.push({tile:t.id,spawn:p,originalRoads:original.osm.roads.length,correctedRoads:corrected.osm.roads.length});
 let cover=await read(before+'/public/data/vegetation/'+t.id+'.json').catch(()=>null);
 const municipal=await read(before+'/public/data/green-cover/'+t.id+'.json').catch(()=>null);
 if(cover&&municipal?.areas?.length)cover={...cover,areas:municipal.areas};
 if(cover){
  const diff=(old,now)=>{
   const key=p=>JSON.stringify(p);const a=new Set(old.map(key)),b=new Set(now.map(key));
   const removed=old.filter(p=>!b.has(key(p))),added=now.filter(p=>!a.has(key(p)));
   for(const p of removed)assert.ok((supplement?.tiles[t.id]||[]).some(r=>distanceToSegment([p.x,p.z],...r.points).distance<=r.width/2+3.1),'unrelated placement removed '+t.id);
   return {before:old.length,after:now.length,removed,added};
  };
  rows.at(-1).vegetation=diff(sampleVegetation(t,original,cover),sampleVegetation(t,corrected,cover));
  rows.at(-1).wildlife=diff(wildlifeCandidates(t,original,cover),wildlifeCandidates(t,corrected,cover));
 }
}
let movements=0,collisionSamples=0;
for(const row of rows){for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
 let a={...row.spawn},b={...a};for(let i=0;i<90;i++){a=advancePlayer(a,{forward:1,yaw},worlds[0],1/60);b=advancePlayer(b,{forward:1,yaw},worlds[1],1/60);assert.deepEqual(b,a);movements++;}
}}
for(const t of m.tiles)for(let z=-240;z<=240;z+=12)for(let x=-240;x<=240;x+=12){
 const px=x+t.offset[0],pz=z+t.offset[1],old=collisionReason(worlds[0],px,pz),now=collisionReason(worlds[1],px,pz);
 // Only source-backed missing bridge corridors may turn an obstacle into access.
 if(now!==old){assert.equal(now,null);assert.ok(['water-area','waterway','railway'].includes(old));assert.ok((supplement?.tiles[t.id]||[]).some(r=>r.bridge));}
 collisionSamples++;
}
const seams=[];
for(const [a,b]of adjacentTilePairs(m)){
 const dx=Math.sign(b.offset[0]-a.offset[0]),dz=Math.sign(b.offset[1]-a.offset[1]);
 const matched=seamRoadAudit(fields[1].get(a.id),fields[1].get(b.id),a,b).matched;
 const candidate=matched.find(({point:[x,z]})=>Array.from({length:25},(_,i)=>(i-12)/3).every(d=>!collisionReason(worlds[1],x+d*dx,z+d*dz)));
 assert.ok(candidate,'No clear seam corridor '+a.id+'/'+b.id);
 for(const sign of [-1,1]){
  let p={x:candidate.point[0]-dx*3*sign,z:candidate.point[1]-dz*3*sign};
  for(let i=0;i<90;i++)p=advancePlayer(p,{forward:1,yaw:Math.atan2(-dx*sign,-dz*sign)},worlds[1],1/60);
  assert.ok((p.x-candidate.point[0])*dx*sign+(p.z-candidate.point[1])*dz*sign>3);
 }
 seams.push({a:a.id,b:b.id,point:candidate.point,bothDirections:true});
}
const warps=await read(after+'/public/data/warps.json');let landings=0;
for(const p of warps.points.filter(p=>p.landing.confirmed)){const a=validateLanding(worlds[0],p.landing),b=validateLanding(worlds[1],p.landing);assert.deepEqual(b,a);assert.equal(b.ok,true);landings++;}
for(const p of ['data/pois.json','data/warps.json','data/exploration-map.json'])assert.deepEqual(await fs.readFile(before+'/public/'+p),await fs.readFile(after+'/public/'+p));
await fs.writeFile(out,JSON.stringify({status:'PASS',tiles:rows.length,originalSnapshotsUnchanged:true,movementSteps:movements,collisionSamples,seams,landings,poiWarpMapFilesUnchanged:true,rows},null,2));console.log(JSON.stringify({status:'PASS',tiles:rows.length,movementSteps:movements,collisionSamples,bidirectionalSeams:seams.length,landings}));
