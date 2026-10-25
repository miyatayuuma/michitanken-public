// Verify the prepared triangles against original DEM and immutable data.
// Real reports must stay PRIVATE.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {terrainMeshHeight} from '../lib/geo.mjs';import {createSurfaceMeshLoader,surfaceWaterHeight,surfaceContainsWater} from '../lib/surface-mesh.mjs';
const [rootArg,out]=process.argv.slice(2),root=path.resolve(rootArg),read=async p=>JSON.parse(await fs.readFile(root+'/public/'+p)),m=await read('data/tiles.json');
const loader=createSurfaceMeshLoader(m,'',async url=>({ok:true,json:()=>read(url)})),rows=[];let totalVertices=0;
for(const t of m.tiles){
 const raw=await fs.readFile(root+'/public/'+t.url),f=await loader.attach(JSON.parse(raw),t),s=f.surface;assert.ok(s);assert.equal(s.sourceSHA256,createHash('sha256').update(raw).digest('hex'));
 let bankVertices=0,maxAbove=-Infinity,nan=0;const p=s.water.positions;
 for(let i=0;i<p.length;i+=3){
  const x=Math.fround(p[i]),y=Math.fround(p[i+1])+s.datum,z=Math.fround(p[i+2]);assert.ok([x,y,z].every(Number.isFinite));
  if(s.water.shore[i/3]<=1e-5){bankVertices++;maxAbove=Math.max(maxAbove,y-terrainMeshHeight(f.terrain,x,z));}
 }
 assert.ok(maxAbove<=-.1799,'Water exceeds bank clearance '+t.id+' '+maxAbove);
 // Every actual water triangle interior must be queryable by the same sampler
 // used by fauna, with no independent DEM-based water-height approximation.
 for(let i=0;i<s.water.indices.length;i+=3){
  const ids=s.water.indices.slice(i,i+3),x=ids.reduce((n,j)=>n+p[j*3],0)/3,z=ids.reduce((n,j)=>n+p[j*3+2],0)/3,y=ids.reduce((n,j)=>n+p[j*3+1],0)/3+s.datum;
  const sampled=surfaceWaterHeight(s,x,z);assert.ok(sampled!==null&&Math.abs(sampled-y)<1e-4,'Water height sampler mismatch '+t.id);
 }
 totalVertices+=p.length/3;rows.push({tile:t.id,waterTriangles:s.water.indices.length/3,landBankTriangles:(s.terrain?.indices.length||0)/3,bankVertices,maxWaterAboveBank:Number.isFinite(maxAbove)?maxAbove:null,sourceHash:true});
}
await fs.writeFile(out,JSON.stringify({status:'PASS',tiles:rows.length,waterVertices:totalVertices,shoreFreeboard:.18,actualFloat32:true,rows},null,2));console.log(JSON.stringify({status:'PASS',tiles:rows.length,maxWaterAboveBank:Math.max(...rows.map(r=>r.maxWaterAboveBank??-Infinity)),waterTriangles:rows.reduce((n,r)=>n+r.waterTriangles,0)}));
