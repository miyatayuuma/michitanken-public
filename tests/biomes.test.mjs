import test from 'node:test';
import assert from 'node:assert/strict';
import {createBiomeWorld,generateBiomeCandidates} from '../lib/biomes.mjs';
const manifest={schema:1,size:500,center:{lat:0,lon:0},tiles:[{id:'a',offset:[0,0],url:'data/a.json'},{id:'b',offset:[500,0],url:'data/b.json'}]};
function fixture(){
 const terrain={size:500,count:3,elevations:Array(9).fill(20),validRatio:1};
 const a={terrain,osm:{roads:[{points:[[-200,-180],[250,-180]],width:8}],buildings:[{footprint:[[-20,-20],[20,-20],[20,20],[-20,20]]}],waterAreas:[{footprint:[[90,-200],[120,-200],[120,200],[90,200]]}],waterways:[],railways:[]}};
 const b={terrain:structuredClone(terrain),osm:{roads:[],buildings:[],waterAreas:[],waterways:[],railways:[]}};
 const overlays=new Map([['a',{schema:1,tileId:'a',areas:[{kind:'wood',ring:[[-200,50],[-30,50],[-30,210],[-200,210]],holes:[[[-150,100],[-120,100],[-120,130],[-150,130]]]},{kind:'park',ring:[[150,40],[250,40],[250,150],[150,150]]}],trees:[]}]]);
 return {manifest,tiles:new Map([['a',a],['b',b]]),overlays,pois:[{id:'park',position:[0,20,0]}]};
}
test('mixed environments within one tile, holes, water exclusion and POI independence',()=>{
 const w=createBiomeWorld(fixture());assert.equal(w.inspect(-60,100).biome,'woodland');assert.equal(w.inspect(-135,115).biome,'urban');assert.equal(w.inspect(180,80).biome,'grassland');assert.equal(w.inspect(80,80).biome,'waterside');assert.equal(w.inspect(0,40).biome,'urban');
 assert.equal(w.inspect(0,0).reason,'building');assert.equal(w.inspect(0,-180).reason,'road');assert.equal(w.inspect(100,0).reason,'water');assert.equal(w.inspect(89,0).reason,'bank-clearance');assert.equal(w.inspect(800,0).reason,'outside');
 const r=generateBiomeCandidates(w,{density:1,step:20});assert.ok(r.candidates.length>0);assert.ok(!r.candidates.some(c=>c.position[0]===0&&c.position[2]===0));
 for(const c of r.candidates){assert.equal(w.inspect(c.position[0],c.position[2]).reason,null);assert.equal(c.position[1],20);assert.ok(c.allowedObjectTypes.length);assert.equal(c.terrain.surface,'dry-ground');}
});
test('determinism, density, tile order and complete sampled area',()=>{
 const input=fixture(),w=createBiomeWorld(input),a=generateBiomeCandidates(w),b=generateBiomeCandidates(w);assert.deepEqual(a,b);
 const reversed={...input,manifest:{...manifest,tiles:[...manifest.tiles].reverse()}};
 assert.deepEqual(a.candidates,generateBiomeCandidates(createBiomeWorld(reversed)).candidates);
 assert.equal(new Set(a.candidates.map(c=>c.id)).size,a.candidates.length);assert.equal(Object.values(a.totals).reduce((n,b)=>n+b.areaM2,0),500000);
 assert.equal(generateBiomeCandidates(w,{density:0}).candidates.length,0);
 assert.throws(()=>generateBiomeCandidates(w,{step:11}));assert.throws(()=>generateBiomeCandidates(w,{density:2}));
});
test('neighbour geometry, uncertain terrain, slope and mismatching seams reject candidates',()=>{
 let f=fixture();f.tiles.get('b').osm.buildings.push({footprint:[[-250,30],[-230,30],[-230,60],[-250,60]]});let w=createBiomeWorld(f);assert.equal(w.inspect(249,45).reason,'building');
 f=fixture();f.tiles.get('b').terrain.elevations.fill(25);w=createBiomeWorld(f);assert.equal(w.inspect(249,0).reason,'slope'); // neighbouring terrain jump
 assert.ok(generateBiomeCandidates(w).seams[0].maxHeightDelta===5);
 f=fixture();f.tiles.get('a').terrain.validRatio=.99;assert.equal(createBiomeWorld(f).inspect(40,40).reason,'uncertain-elevation');
 f=fixture();f.tiles.get('a').terrain.elevations[0]=NaN;assert.throws(()=>createBiomeWorld(f),/terrain/);
});

test('buried waterways do not create surface waterside habitat',()=>{
 const f=fixture();f.tiles.get('b').osm.waterways=[{points:[[-200,0],[200,0]],width:8,tunnel:true,layer:-1}];const w=createBiomeWorld(f);assert.equal(w.inspect(500,0).biome,'urban');assert.equal(w.inspect(500,0).reason,null);
});

test('missing obstruction layers and unknown DEM coverage fail closed',()=>{
 let f=fixture();delete f.tiles.get('a').osm.buildings;assert.throws(()=>createBiomeWorld(f),/safety geometry/);
 f=fixture();delete f.tiles.get('a').terrain.validRatio;assert.throws(()=>createBiomeWorld(f),/terrain/);
 assert.throws(()=>generateBiomeCandidates(createBiomeWorld(fixture()),{waterBand:NaN}));
});
