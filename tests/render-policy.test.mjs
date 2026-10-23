import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pixelRatioBudget,tileDetail,geometryStats,NEAR_TILE_MARGIN} from '../lib/render-policy.mjs';
import {buildRoadRibbon} from '../lib/road-surface.mjs';
import {terrainMeshHeight} from '../lib/geo.mjs';
import {createWaterLayer} from '../src/water.js';
import {createTileStreamer} from '../src/tile-stream.js';

const manifest=JSON.parse(fs.readFileSync(new URL('../public/data/tiles.json',import.meta.url)));
const north=JSON.parse(fs.readFileSync(new URL('../public/data/field.json',import.meta.url)));
const south=JSON.parse(fs.readFileSync(new URL('../public/data/tiles/south.json',import.meta.url)));
test('DPR policy caps GPU render resolution without affecting CSS input geometry',()=>{
 assert.equal(pixelRatioBudget(3,{coarse:true,memoryGiB:4}),1.1);
 assert.equal(pixelRatioBudget(3,{coarse:true,memoryGiB:8}),1.35);
 assert.equal(pixelRatioBudget(3,{coarse:false}),1.75);
 assert.equal(pixelRatioBudget(1,{coarse:true}),1);
 assert.throws(()=>pixelRatioBudget(NaN),/Invalid/);
});
test('nearby tile uses detailed geometry but map and distant walk use overview LOD',()=>{
 const northTile=manifest.tiles.find(x=>x.id==='north');
 const east=manifest.tiles.find(x=>x.id==='east');
 assert.equal(tileDetail({mode:'walk',x:0,z:0,entry:northTile}),'full');
 assert.equal(tileDetail({mode:'walk',x:0,z:0,entry:east}),'overview');
 assert.equal(tileDetail({mode:'map',x:0,z:0,entry:northTile}),'overview');
 assert.equal(tileDetail({mode:'map',x:0,z:0,entry:northTile,camera:{x:0,y:100,z:0}}),'full');
 assert.equal(tileDetail({mode:'map',x:0,z:0,entry:northTile,camera:{x:0,y:2800,z:0}}),'overview');
 assert.equal(tileDetail({mode:'map',x:0,z:0,entry:east,camera:{x:0,y:100,z:0}}),'overview');
 assert.equal(tileDetail({mode:'walk',x:250+NEAR_TILE_MARGIN-1,z:0,entry:northTile}),'full');
 assert.equal(tileDetail({mode:'walk',x:250+NEAR_TILE_MARGIN+1,z:0,entry:northTile}),'overview');
});
test('overview road tessellation reduces vertices but preserves source endpoints',()=>{
 let fullTriangles=0,overviewTriangles=0;
 for(const field of [north,south])for(const road of field.osm.roads){
  const a=road.points[0],b=road.points[1];
  const full=buildRoadRibbon(a,b,road.width,field,.23);
  const low=buildRoadRibbon(a,b,road.width,field,.23,{alongStep:11,acrossStep:8,terrainSafe:true});
  fullTriangles+=full.length/9;
  overviewTriangles+=low.length/9;
  assert.ok(low.every(Number.isFinite));
 }
 assert.ok(overviewTriangles<fullTriangles*.52,`Road LOD improvement insufficient: ${overviewTriangles}/${fullTriangles}`);
});
function minimumClearance(verts,field){
 let minimum=Infinity;
 for(let i=0;i<verts.length;i+=9){
  const triangle=[verts.slice(i,i+3),verts.slice(i+3,i+6),verts.slice(i+6,i+9)];
  for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
   const [x,y,z]=[0,1,2].map(k=>triangle.reduce((sum,p,j)=>sum+weights[j]*p[k],0));
   minimum=Math.min(minimum,y-(terrainMeshHeight(field.terrain,x,z)-field.terrain.min));
  }
 }
 return minimum;
}
test('overview road triangles clear a synthetic DEM ridge in their interiors',()=>{
 // Coarse corner heights miss the high DEM vertex under the ribbon center.
 const elevations=Array(25).fill(0);elevations[12]=8;
 const field={terrain:{count:5,size:40,elevations,min:0}};
 const a=[-15,0],b=[15,0],options={alongStep:32,acrossStep:8};
 const old=buildRoadRibbon(a,b,8,field,.23,options);
 const safe=buildRoadRibbon(a,b,8,field,.23,{...options,terrainSafe:true});
 assert.ok(minimumClearance(old,field)<-2,'Baseline fixture must bury coarse triangles');
 assert.ok(safe.length>old.length,'DEM fold must create additional triangles');
 assert.ok(minimumClearance(safe,field)>=.23-1e-6,'Safe ribbon must clear all sampled triangle interiors');
});
test('DEM-face road clipping also clears diagonal ridges and tile-border overhangs',()=>{
 const elevations=Array(25).fill(0);
 elevations[7]=9;elevations[12]=5;elevations[18]=7;
 const field={terrain:{count:5,size:40,elevations,min:0}};
 for(const [a,b] of [
  [[-18,-17],[18,16]],
  [[-22,-11],[23,13]], // ribbon straddles clamped DEM edges
  [[-19,18],[18,-19]]
 ]){
  const verts=buildRoadRibbon(a,b,7,field,.31,{alongStep:14,acrossStep:8,terrainSafe:true});
  assert.ok(verts.length>0&&verts.every(Number.isFinite));
  assert.ok(minimumClearance(verts,field)>=.31-1e-5,a+' -> '+b+': road penetrated DEM');
 }
});
test('terrain-safe overview follows a 65x65 fictional DEM within the road triangle budget',()=>{
 const elevations=[];
 for(let z=0;z<65;z++)for(let x=0;x<65;x++)
  elevations.push(10+Math.sin(x*.11)*3+Math.cos(z*.13)*2);
 const field={terrain:{count:65,size:500,elevations,min:0}};
 const a=[-250,-250],b=[250,250],width=4;
 const full=buildRoadRibbon(a,b,width,field,.23);
 const safe=buildRoadRibbon(a,b,width,field,.23,{alongStep:11,acrossStep:8,terrainSafe:true});
 assert.ok(safe.length/9<full.length/9*.65,'Dense DEM should still substantially reduce triangles');
 assert.ok(minimumClearance(safe,field)>=.23-1e-5,'Dense DEM ribbon intersects terrain');
});
test('overview geometry clips DEM folds without gaps in road footprint',()=>{
 const elevations=Array(25).fill(0);elevations[7]=9;elevations[12]=5;elevations[18]=7;
 const field={terrain:{count:5,size:40,elevations,min:0}};
 for(const [a,b] of [[[-18,-17],[18,16]],[[-22,-11],[23,13]],[[-28,-28],[25,25]]]){
  const width=7,verts=buildRoadRibbon(a,b,width,field,.31,{terrainSafe:true});
  let area=0;
  for(let i=0;i<verts.length;i+=9)
   area+=Math.abs((verts[i+3]-verts[i])*(verts[i+8]-verts[i+2])-
    (verts[i+5]-verts[i+2])*(verts[i+6]-verts[i]))/2;
  const expected=width*Math.hypot(b[0]-a[0],b[1]-a[1]);
  assert.ok(Math.abs(area-expected)<1e-5,'Clipped road must cover original footprint exactly');
 }
});
test('overview river lowers tessellation for a synthetic stream without losing geometry',()=>{
 for(const base of [north,south]){
  // Public fixtures contain no real waterways. Generate fictional geometry in memory.
  const field={...base,osm:{...base.osm,waterAreas:[],waterways:[
   {id:'fictional-stream',kind:'stream',points:[[-125,-60],[125,-60]],width:6,layer:0,tunnel:false}
  ]}};
  const full=createWaterLayer(field,{detail:'full'});
  const low=createWaterLayer(field,{detail:'overview'});
  assert.equal(low.summary.areas,full.summary.areas);
  assert.equal(low.summary.ribbons,full.summary.ribbons);
  assert.ok(low.summary.triangles<full.summary.triangles*.55,
   `Water budget insufficient: ${low.summary.triangles}/${full.summary.triangles}`);
  for(const layer of [full,low]){
   const mats=new Set();
   layer.group.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});
   mats.forEach(m=>m.dispose());
  }
 }
});
test('geometryStats reports detail and actual GPU triangle inputs separately',()=>{
 const mesh=n=>({geometry:{getAttribute:()=>({count:n*3})}});
 const world=[
  {level:'full',layers:{roads:{children:[mesh(100)]},buildings:{children:[mesh(200)]}},water:{summary:{triangles:50}}},
  {level:'overview',layers:{roads:{children:[mesh(20)]},buildings:{children:[mesh(25)]}},water:{summary:{triangles:10}}}
 ];
 assert.deepEqual(geometryStats(world),{
  roadTriangles:120,buildingTriangles:225,waterTriangles:60,full:1,overview:1,totalTriangles:405
 });
});
test('aborting nine tile overview stops remaining network fetches without corrupting cache',async()=>{
 const ctrl=new AbortController(),fetched=[];
 const stream=createTileStreamer({manifest,cacheLimit:2,
  fetchTile:async entry=>{fetched.push(entry.id);return entry.id==='south'?south:north;},
  mount:async()=>{ctrl.abort();return {};},unmount:async()=>{}
 });
 try{
  await assert.rejects(stream.ensureAll({concurrency:1,signal:ctrl.signal}),{name:'AbortError'});
  assert.equal(fetched.length,1);
  assert.equal(stream.snapshot().active.length,1);
 }finally{await stream.dispose();}
});

test('frustum visibility refreshes after camera movement on every render frame',()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const start=source.indexOf(' function draw(){');
 assert.ok(start>=0,'Draw loop must exist');
 const draw=source.slice(start);
 const cameraMove=draw.indexOf('controls.update();');
 const qualityThrottle=draw.indexOf('if(qualityTime>.28){');
 const visibility=draw.indexOf('updateVisibleTiles();');
 const render=draw.indexOf('renderer.render(scene,camera);');
 assert.ok(cameraMove>=0&&cameraMove<visibility,'Frustum update must follow walk/orbit camera movement');
 assert.ok(qualityThrottle>=0&&qualityThrottle<visibility,'Frustum update must not live in throttled quality block');
 assert.ok(visibility<render,'Frustum update must precede rendering');
 assert.equal(draw.split('updateVisibleTiles();').length-1,1,'One unconditional visibility refresh per draw');
});
