import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pixelRatioBudget,tileDetail,geometryStats,NEAR_TILE_MARGIN} from '../lib/render-policy.mjs';
import {buildRoadRibbon} from '../lib/road-surface.mjs';
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
  const low=buildRoadRibbon(a,b,road.width,field,.23,{alongStep:11,acrossStep:8});
  fullTriangles+=full.length/9;
  overviewTriangles+=low.length/9;
  assert.ok(low.every(Number.isFinite));
 }
 assert.ok(overviewTriangles<fullTriangles*.52,`Road LOD improvement insufficient: ${overviewTriangles}/${fullTriangles}`);
});
test('overview river uses fewer tessellated triangles and preserves all named rivers',()=>{
 for(const field of [north,south]){
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
