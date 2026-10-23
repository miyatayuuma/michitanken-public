import test from 'node:test';
import assert from 'node:assert/strict';
import {unproject} from '../lib/geo.mjs';
import {createTileStreamer} from '../src/tile-stream.js';
import {
 createWideOverview,wideOverviewNeeded,terrainCellsPerTile,atlasGeometryBudget,
 atlasCoordinates,WIDE_ATLAS_PIXELS,WIDE_TERRAIN_CELL_BUDGET
} from '../src/wide-overview.js';

function manifestFor(side){
 const base=(side-1)*250;
 return {schema:1,size:500,center:{lat:0,lon:0},
  tiles:Array.from({length:side*side},(_,i)=>{
   const row=Math.floor(i/side),col=i%side,id='fictional-'+row+'-'+col;
   return {id,offset:[col*500-base,row*500-base],url:'data/tiles/'+id+'.json'};
  })};
}
function fieldFor(manifest,entry){
 const values=Array.from({length:25},(_,i)=>
  100+Math.sin((i%5)*.5)*2+Math.cos(Math.floor(i/5)*.5));
 return {schema:2,size:manifest.size,
  center:unproject(entry.offset[0],entry.offset[1],manifest.center),
  terrain:{size:500,count:5,elevations:values,min:Math.min(...values),max:Math.max(...values)},
  osm:{
   waterways:[{id:'fictional-water',points:[[-250,0],[250,0]],width:4,layer:0}],
   waterAreas:[],railways:[],
   roads:[{id:'fictional-road',kind:'residential',width:5,points:[[-250,5],[250,5]]}],
   buildings:[{id:'fictional-house',height:4,footprint:[[-20,-20],[20,-20],[20,20],[-20,20]]}]
  }};
}
function fakeCanvas(){
 const calls={stroke:0,fill:0};
 const context={
  beginPath(){},moveTo(){},lineTo(){},closePath(){},
  stroke(){calls.stroke++;},fill(){calls.fill++;}
 };
 return {width:0,height:0,getContext:()=>context,calls};
}

test('Task 5C wide overview keeps a fixed triangle and texture budget',()=>{
 for(const side of [3,4,5,10,30]){
  const tiles=side*side;
  const budget=atlasGeometryBudget(tiles);
  assert.ok(budget.triangles<=WIDE_TERRAIN_CELL_BUDGET*2);
  assert.ok(budget.cells>=2);
 }
 assert.equal(wideOverviewNeeded(manifestFor(3)),false);
 assert.equal(wideOverviewNeeded(manifestFor(5)),true);
 assert.equal(terrainCellsPerTile(25),12);
 assert.throws(()=>terrainCellsPerTile(901),/unsupported/);
 assert.deepEqual(atlasCoordinates({minX:-1250,maxX:1250,minZ:-1250,maxZ:1250},0,0),[WIDE_ATLAS_PIXELS/2,WIDE_ATLAS_PIXELS/2]);
});

test('Task 5C scanAll reads 25 tiles with only two snapshot workers and no GPU mounts',async()=>{
 const manifest=manifestFor(5),seen=new Set();
 let pending=0,maxPending=0,unmounted=0;
 const stream=createTileStreamer({manifest,cacheLimit:3,
  fetchTile:async entry=>{
   pending++;maxPending=Math.max(maxPending,pending);
   await new Promise(resolve=>setImmediate(resolve));
   pending--;return fieldFor(manifest,entry);
  },
  mount:async()=>{throw Error('scanAll must not mount GPU geometry');},
  unmount:async()=>{unmounted++;}
 });
 try{
  const count=await stream.scanAll({concurrency:2,onTile:async entry=>{seen.add(entry.id);}});
  assert.equal(count,25);assert.equal(seen.size,25);assert.ok(maxPending<=2);
  assert.equal(stream.snapshot().active.length,0);
  assert.equal(stream.snapshot().cached.length,0);
 }finally{await stream.dispose();}
 assert.equal(unmounted,0);
});

test('Task 5C aborted scan cannot call back for all distant tiles or mount them',async()=>{
 const manifest=manifestFor(5),ctrl=new AbortController();let visited=0,requested=0;
 const stream=createTileStreamer({manifest,
  fetchTile:async entry=>{requested++;return fieldFor(manifest,entry);},
  mount:async()=>{throw Error('Unexpected mount');},unmount:async()=>{}
 });
 try{
  await assert.rejects(stream.scanAll({concurrency:1,signal:ctrl.signal,onTile:()=>{
   visited++;ctrl.abort();
  }}),{name:'AbortError'});
  assert.equal(visited,1);assert.ok(requested<25);
  assert.equal(stream.snapshot().active.length,0);
 }finally{await stream.dispose();}
});

test('Task 5C fictional atlas keeps full tile coverage in one shared geometry',()=>{
 const previousDocument=globalThis.document;
 const canvases=[];
 globalThis.document={createElement:tag=>{
  assert.equal(tag,'canvas');
  const canvas=fakeCanvas();canvases.push(canvas);return canvas;
 }};
 let finished;
 try{
  const manifest=manifestFor(5),builder=createWideOverview(manifest,100);
  for(const entry of manifest.tiles)builder.addTile(entry,fieldFor(manifest,entry));
  assert.throws(()=>builder.addTile(manifest.tiles[0],fieldFor(manifest,manifest.tiles[0])),/Duplicate/);
  finished=builder.finish();
  assert.equal(finished.loadedTiles,25);
  assert.equal(finished.group.children.length,4);
  const meshes=finished.group.children;
  assert.ok(meshes.every(mesh=>mesh.geometry===meshes[0].geometry),'Atlas shares one geometry');
  assert.equal(meshes[0].geometry.index.count/3,atlasGeometryBudget(25).triangles);
  assert.equal(canvases.length,3);
  assert.ok(canvases.every(c=>c.width===WIDE_ATLAS_PIXELS&&c.height===WIDE_ATLAS_PIXELS));
  assert.ok(canvases.some(c=>c.calls.stroke>0));
  assert.ok(canvases.some(c=>c.calls.fill>0));
  assert.deepEqual(Object.keys(finished.layers),['water','roads','buildings']);
 }finally{finished?.dispose();globalThis.document=previousDocument;}
});

test('Task 5C retains the player collision tile during far-away map inspection',async()=>{
 const manifest=manifestFor(5),home=manifest.tiles.find(t=>t.offset[0]===0&&t.offset[1]===0);
 const far=manifest.tiles.at(-1);
 const released=[];
 const stream=createTileStreamer({manifest,
  fetchTile:async entry=>fieldFor(manifest,entry),
  mount:async entry=>({id:entry.id}),
  unmount:async entry=>{released.push(entry.id);}
 });
 try{
  await stream.ensure(home.id);
  await stream.ensure(far.id);
  stream.update(...far.offset,{retainIds:[home.id]});
  assert.ok(stream.snapshot().active.includes(home.id),'Stationary player tile must remain mounted');
  assert.ok(!released.includes(home.id));
  // On switching back to walk, the far tile can be disposed normally.
  stream.update(...home.offset);
  assert.ok(stream.snapshot().active.includes(home.id));
  assert.ok(released.includes(far.id));
 }finally{await stream.dispose();}
});
