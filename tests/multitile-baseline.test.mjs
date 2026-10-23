import test from 'node:test';
import assert from 'node:assert/strict';
import {unproject} from '../lib/geo.mjs';
import {validateManifest,manifestBounds} from '../lib/tiles.mjs';
import {overviewPose} from '../lib/overview.mjs';
import {createTileStreamer} from '../src/tile-stream.js';

// Fictional square grids only. No private location or real OSM/GSI snapshots.
function fictionalGrid(side){
 const offset=(side-1)*250;
 return {
  schema:1,size:500,center:{lat:0,lon:0},
  tiles:Array.from({length:side*side},(_,i)=>{
   const col=i%side,row=Math.floor(i/side);
   return {id:'tile-'+row+'-'+col,
    offset:[col*500-offset,row*500-offset],
    url:'data/tiles/tile-'+row+'-'+col+'.json'};
  })
 };
}

function fictionalField(manifest,entry){
 return {
  schema:2,size:manifest.size,
  center:unproject(entry.offset[0],entry.offset[1],manifest.center),
  terrain:{size:manifest.size,count:2,min:0,max:0,elevations:[0,0,0,0]}
 };
}

test('Task 5C baseline: generalized 3x3 and 5x5 fictional grids are valid and fit an overview',()=>{
 for(const side of [3,5]){
  const manifest=fictionalGrid(side);
  assert.equal(validateManifest(manifest),true);
  const bounds=manifestBounds(manifest);
  assert.equal(bounds.maxX-bounds.minX,side*500);
  assert.equal(bounds.maxZ-bounds.minZ,side*500);
  const pose=overviewPose(manifest,1,55);
  assert.deepEqual(pose.dimensions,[side*500,side*500]);
  assert.ok(pose.requiredAltitude>0);
 }
});

test('Task 5C baseline: current ensureAll scales linearly in resident GPU tiles; walking releases them',async t=>{
 for(const side of [3,5]){
  await t.test(side+'x'+side,async()=>{
   const manifest=fictionalGrid(side);
   const stats={requested:0,mounted:0,unmounted:0};
   const streamer=createTileStreamer({
    manifest,cacheLimit:3,
    fetchTile:async entry=>{stats.requested++;return fictionalField(manifest,entry);},
    mount:async()=>{stats.mounted++;return {};},
    unmount:async()=>{stats.unmounted++;}
   });
   try{
    await streamer.ensureAll({concurrency:2});
    assert.equal(stats.requested,side*side);
    assert.equal(stats.mounted,side*side);
    assert.equal(streamer.snapshot().active.length,side*side);
    // Current map implementation uses retainAll. This is a baseline, not
    // a target memory budget: 5x5 occupies 25 mounted tiles.
    streamer.update(0,0,{retainAll:true});
    assert.equal(streamer.snapshot().active.length,side*side);
    streamer.update(0,0,{retainAll:false});
    const walking=streamer.snapshot().active.length;
    assert.ok(walking>=1&&walking<side*side);
    console.log('Task5C fictional baseline: '+JSON.stringify({
     grid:side+'x'+side,overviewMounted:side*side,walkingMounted:walking
    }));
   }finally{
    await streamer.dispose();
    assert.equal(stats.unmounted,stats.mounted,'GPU tile resources must be released');
   }
  });
 }
});
