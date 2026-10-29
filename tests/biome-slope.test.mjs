import test from 'node:test';
import assert from 'node:assert/strict';
import {createBiomeWorld,generateBiomeCandidates} from '../lib/biomes.mjs';
test('triangle-gradient check rejects a narrow symmetric ridge missed by central differences',()=>{
 const manifest={schema:1,size:500,center:{lat:0,lon:0},tiles:[{id:'a',offset:[0,0],url:'data/a.json'},{id:'b',offset:[500,0],url:'data/b.json'}]};
 const n=251,elevations=Array.from({length:n*n},(_,i)=>i%n===125?1:0);
 const tiles=new Map(manifest.tiles.map(t=>[t.id,{terrain:{size:500,count:n,elevations,validRatio:1},osm:{roads:[],buildings:[],waterways:[],waterAreas:[],railways:[]}}]));const w=createBiomeWorld({manifest,tiles});
 assert.equal(w.inspect(0,0).reason,'slope');
 assert.throws(()=>generateBiomeCandidates(w,{maxSlope:NaN}));assert.throws(()=>generateBiomeCandidates(w,{radius:Infinity}));
});
