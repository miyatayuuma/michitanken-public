import test from 'node:test';import assert from 'node:assert/strict';
import {buildRoadRibbon,roadSurfaceOptions} from '../lib/road-surface.mjs';
import {terrainMeshHeight} from '../lib/geo.mjs';
import {renderedFootHeight} from '../lib/avatar-ground.mjs';
import {validateRoadSupplement,applyRoadSupplement,loadRoadSupplement} from '../lib/road-supplement.mjs';
import {decodeWaterProfiles,loadWaterProfiles,profilesForWaterField} from '../lib/water-profile-data.mjs';
const field=()=>({size:500,terrain:{size:500,count:65,min:0,elevations:Array.from({length:65**2},(_,i)=>Math.sin(i%65)*2+Math.cos(Math.floor(i/65)))} ,osm:{roads:[]}});
test('both production road LODs clear DEM folds and match avatar contact',()=>{
 const f=field(),road={id:1,width:5,points:[[-230,-110],[245,189]],bridge:false};f.osm.roads=[road];
 for(const detail of ['full','overview']){
  const verts=buildRoadRibbon(...road.points,road.width,f,.23,roadSurfaceOptions(detail));
  let maxError=0;
  for(let i=0;i<verts.length;i+=9)for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[.2,.2,.6]]){
   const p=[0,1,2].map(k=>weights.reduce((s,w,n)=>s+w*verts[i+n*3+k],0));
   maxError=Math.max(maxError,Math.abs(p[1]-terrainMeshHeight(f.terrain,p[0],p[2])-.23));
   assert.ok(Math.abs(renderedFootHeight(f,p[0],p[2],0)-p[1]-.015)<1e-6);
  }
  assert.ok(maxError<1e-6);
 }
 assert.throws(()=>roadSurfaceOptions('invalid'));
});
test('source supplement only adds absent ways and preserves original field objects',()=>{
 const f=field(),road={id:1,width:4,kind:'residential',points:[[-250,0],[250,0]],bridge:false,tunnel:false,layer:0};f.osm.roads=[road];
 const m={size:500,tiles:[{id:'a'}]},v={schema:1,tiles:{a:[road,{...road,id:2,points:[[-250,20],[250,20]]}]}};
 validateRoadSupplement(v,m);const merged=applyRoadSupplement(f,{id:'a'},v);
 assert.equal(f.osm.roads.length,1);assert.equal(merged.osm.roads.length,2);assert.equal(merged.osm.roads[0],road);assert.equal(merged.terrain,f.terrain);
 assert.equal(applyRoadSupplement(merged,{id:'a'},v),merged);assert.equal(applyRoadSupplement(f,{id:'a'},null),f);
 for(const patch of [{points:[[NaN,0],[1,0]]},{points:[[-251,0],[1,0]]},{width:0},{bridge:'yes'}])assert.throws(()=>validateRoadSupplement({schema:1,tiles:{a:[{...road,...patch}]}},m));
 assert.throws(()=>validateRoadSupplement({schema:1,tiles:{unknown:[road]}},m));
});
test('production roads stop at shared tile edges instead of clamping heights into a neighbour',()=>{
 const f=field();
 for(const detail of ['full','overview']){
  const verts=buildRoadRibbon([-250,-220],[250,220],8,f,.23,roadSurfaceOptions(detail));
  assert.ok(verts.length>0);
  for(let i=0;i<verts.length;i+=3){assert.ok(Math.abs(verts[i])<=250+1e-7);assert.ok(Math.abs(verts[i+2])<=250+1e-7);}
  assert.ok(verts.some((v,i)=>i%3===0&&Math.abs(v-250)<1e-7));
  assert.ok(verts.some((v,i)=>i%3===0&&Math.abs(v+250)<1e-7));
 }
});
test('undeclared supplement makes no request; declared failures stop instead of silent loss',async()=>{
 let calls=0;assert.equal(await loadRoadSupplement({},'/',()=>{calls++;}),null);assert.equal(calls,0);
 await assert.rejects(loadRoadSupplement({roadSupplement:'../secret'},'/',()=>{}));
 await assert.rejects(loadRoadSupplement({roadSupplement:'data/roads.json'},'/',async()=>({ok:false})));
 const m={size:500,tiles:[{id:'a'}],roadSupplement:'data/roads.json'};
 const got=await loadRoadSupplement(m,'/game/',async url=>{assert.equal(url,'/game/data/roads.json');return {ok:true,json:async()=>({schema:1,tiles:{}})};});assert.equal(got.schema,1);
});
test('fixed full-field profiles preserve fitted heights independently of snapshot cache membership',async()=>{
 const m={tiles:[{id:'a'},{id:'b'}]},p={id:1,nodes:[[0,0],[100,0]],lengths:[0,100],length:100,start:3,slope:-.001,reverseFlow:false};
 const raw={schema:1,tileIds:['a','b'],profiles:[p]},decoded=decodeWaterProfiles(JSON.parse(JSON.stringify(raw)),m);
 assert.deepEqual(profilesForWaterField(decoded,{osm:{waterways:[]}}),[]);
 assert.deepEqual(profilesForWaterField(decoded,{osm:{waterways:[{id:2,layer:0,tunnel:false}]}}),[]);
 assert.equal(profilesForWaterField(decoded,{osm:{waterways:[{id:1,layer:0,tunnel:false}]}}).length,1);
 for(const cachedTiles of [['a'],['b'],['a','b']]){
  // The fixed corpus is decoded once; runtime cache eviction supplies no input.
  assert.equal(decoded[0].getHeight(50),2.95);assert.equal(decoded[0].getHeight(-10),3);assert.equal(decoded[0].getHeight(200),2.9);
 }
 assert.throws(()=>decodeWaterProfiles({...raw,tileIds:['a']},m));
 assert.throws(()=>decodeWaterProfiles({...raw,profiles:[{...p,lengths:[0,0]}]},m));
 assert.equal(await loadWaterProfiles({},'/',()=>{throw Error('No optional request');}),null);
 await assert.rejects(loadWaterProfiles({waterProfiles:'../bad'},'/',()=>{}));
 await assert.rejects(loadWaterProfiles({...m,waterProfiles:'data/water.json'},'/',async()=>({ok:false})));
});
