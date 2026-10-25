import test from 'node:test';import assert from 'node:assert/strict';
import {validateSurfaceMesh,createSurfaceMeshLoader,surfaceWaterHeight,surfaceContainsWater} from '../lib/surface-mesh.mjs';
import {createWaterLayer} from '../src/water.js';import {wildlifeFootHeight} from '../src/wildlife.js';
import {createCollisionWorld,collisionReason} from '../lib/navigation.mjs';
const sample=()=>({schema:1,tileId:'a',size:500,datum:0,terrain:null,coverage:[{outer:[[-5,-5],[5,-5],[5,5],[-5,5]],holes:[]}],water:{positions:[-5,-1,-5,5,-1,-5,-5,-1,5,5,-1,5],indices:[0,2,1,1,2,3],flow:[0,1,0,1,0,1,0,1],station:[0,0,10,10],lateral:[-5,5,-5,5],shore:[0,0,0,0]}});
const field=()=>({size:500,terrain:{size:500,count:3,min:0,elevations:Array(9).fill(0)},osm:{roads:[],buildings:[],waterAreas:[],waterways:[],railways:[]}});
test('prepared water samples actual indexed triangles and respects dry ground',()=>{
 const data=sample();validateSurfaceMesh(data,{id:'a'},field());assert.equal(surfaceWaterHeight(data,0,0),-1);assert.equal(surfaceWaterHeight(data,8,0),null);assert.equal(surfaceContainsWater(data,0,0),true);assert.equal(surfaceContainsWater(data,8,0),false);
 assert.equal(wildlifeFootHeight({...field(),surface:data},0,0,0),-.96);
});
test('source islands stay dry while circle contact at their banks remains blocked',()=>{
 const data=sample();data.coverage[0].holes=[[[-2,-2],[2,-2],[2,2],[-2,2]]];const world=createCollisionWorld({...field(),surface:data});
 assert.equal(collisionReason(world,0,0),null);assert.equal(collisionReason(world,1.8,0),'water-area');assert.equal(collisionReason(world,4,0),'water-area');assert.equal(collisionReason(world,8,0),null);
});
test('prepared opaque water uses real depth and indexed normals, legacy water is unchanged',()=>{
 const f={...field(),surface:sample()},layer=createWaterLayer(f);assert.equal(layer.summary.triangles,2);assert.equal(layer.summary.prepared,true);
 const mesh=layer.group.children[0];assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.depthWrite,true);assert.ok([...mesh.geometry.getAttribute('normal').array].every(Number.isFinite));mesh.geometry.dispose();mesh.material.dispose();
});
test('declared mesh loading deduplicates in flight, fails closed and leaves snapshots intact',async()=>{
 const m={tiles:[{id:'a'}],surfaceMeshes:{schema:1,tiles:{a:'data/surfaces/a.json'}}};let calls=0;
 const loader=createSurfaceMeshLoader(m,'/game/',async url=>{calls++;assert.equal(url,'/game/data/surfaces/a.json');return {ok:true,json:async()=>sample()};});
 const f=field();const [a,b]=await Promise.all([loader.attach(f,{id:'a'}),loader.attach(f,{id:'a'})]);assert.equal(calls,1);assert.equal(a.surface,b.surface);assert.equal(f.surface,undefined);assert.equal(a.terrain,f.terrain);
 await assert.rejects(createSurfaceMeshLoader(m,'/',async()=>({ok:false})).attach(f,{id:'a'}));
 assert.throws(()=>createSurfaceMeshLoader({...m,surfaceMeshes:{schema:1,tiles:{}}},'/',()=>{}));
 const bad=sample();bad.water.indices=[100,1,2];assert.throws(()=>validateSurfaceMesh(bad,{id:'a'},f));
});
