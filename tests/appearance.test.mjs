import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildingColors,buildingKey,natureTint,WALL_PALETTE,ROOF_PALETTE} from '../lib/appearance.mjs';
import {addBuildings} from '../src/buildings.js';
const buildings=Array.from({length:64},(_,i)=>({id:i+1,height:5+i%4,footprint:[[i*3,0],[i*3+2,0],[i*3+2,2],[i*3,2]]}));
const field={terrain:{count:2,size:500,min:0,elevations:[0,0,0,0]},osm:{buildings}};
function build(detail,enabled){const root=new THREE.Group(),layers={};addBuildings(field,root,layers,detail,{offset:[0,0]},enabled);return layers.buildings;}
test('building palettes are stable across reconstruction, clipping IDs and coordinate rebasing',()=>{
 const a=buildings.map(b=>buildingColors(b,{offset:[0,0]}));
 assert.deepEqual(a,JSON.parse(JSON.stringify(buildings)).map(b=>buildingColors(b,{offset:[500,500]})));
 assert.equal(new Set(a.map(c=>c.wall)).size,WALL_PALETTE.length);
 assert.equal(new Set(a.map(c=>c.roof)).size,ROOF_PALETTE.length);
 const b={footprint:[[0,0],[10,0],[10,10],[0,10]]};
 const shifted={footprint:[...b.footprint].reverse().map(([x,z])=>[x-500,z+500])};
 assert.equal(buildingKey(b),buildingKey(shifted,{offset:[500,-500]}));
});
test('full and overview reuse roof colours without changing geometry or batch counts',()=>{
 for(const detail of ['full','overview']){
  const before=build(detail,false),after=build(detail,true),reload=build(detail,true);
  assert.equal(after.children.length,detail==='full'?2:1);
  after.children.forEach((mesh,i)=>{
   assert.deepEqual(mesh.geometry.attributes.position.array,before.children[i].geometry.attributes.position.array);
   assert.deepEqual(mesh.geometry.attributes.normal.array,before.children[i].geometry.attributes.normal.array);
   assert.equal(mesh.geometry.attributes.color.count,mesh.geometry.attributes.position.count);
   assert.deepEqual(mesh.geometry.attributes.color.array,reload.children[i].geometry.attributes.color.array);
   assert.equal(mesh.material.vertexColors,true);
  });
  const roofs=after.children.at(-1).geometry.attributes.color;
  buildings.forEach((b,i)=>{
   const c=new THREE.Color(buildingColors(b).roof);
   assert.ok(Math.abs(roofs.getX(i*6)-c.r)<1e-6);
   assert.ok(Math.abs(roofs.getY(i*6)-c.g)<1e-6);
   assert.ok(Math.abs(roofs.getZ(i*6)-c.b)<1e-6);
  });
 }
});
test('individual nature colour is subtle, deterministic, species-limited and world anchored',()=>{
 for(const kind of ['grass','flower','bush','rock']){
  const a=natureTint(kind,3.25,4.5);assert.deepEqual(a,natureTint(kind,3.25,4.5));
  assert.ok(a.every(v=>v>=.9&&v<=1));
  assert.notDeepEqual(a,natureTint(kind,13.25,14.5));
 }
 assert.equal(natureTint('tree',0,0),null);assert.equal(natureTint('duck',0,0),null);
});

test('instanced nature tint preserves authored colours, geometry and matrices; textures are excluded',async()=>{
 const {createVegetationRenderer}=await import('../src/vegetation.js');
 const e={id:'fake',offset:[0,0]},f={size:500,terrain:field.terrain,osm:{buildings:[],roads:[],waterways:[],waterAreas:[],railways:[]}};
 const overlay={schema:1,tileId:e.id,areas:[{id:'meadow',kind:'grass',ring:[[-200,-200],[200,-200],[200,200],[-200,200]]}],trees:[]};
 for(const textured of [false,true]){
  const loader={loadAsync:async()=>{const scene=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0x609050,map:textured?new THREE.Texture():null});scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material));return {scene};}};
  const renderer=createVegetationRenderer({baseURL:'/',loader});
  const off=await renderer.build(e,f,overlay,{maxTotal:60,individualColors:false}),on=await renderer.build(e,f,overlay,{maxTotal:60,individualColors:true});
  assert.equal(on.children.length,off.children.length);let tinted=0;
  on.children.forEach((m,i)=>{const b=off.children[i];assert.deepEqual(m.instanceMatrix.array,b.instanceMatrix.array);assert.deepEqual(m.geometry.attributes.position.array,b.geometry.attributes.position.array);assert.equal(m.material.color.getHex(),b.material.color.getHex());assert.equal(m.count,b.count);if(m.instanceColor)tinted++;});
  assert.equal(tinted>0,!textured);renderer.dispose();
 }
});
