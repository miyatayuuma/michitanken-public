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
  const roofs=after.children.at(-1).geometry.attributes.color,roofOffset=detail==='overview'?buildings.length*24:0;
  buildings.forEach((b,i)=>{
   const c=new THREE.Color(buildingColors(b).roof);
   assert.ok(Math.abs(roofs.getX(roofOffset+i*6)-c.r)<1e-6);
   assert.ok(Math.abs(roofs.getY(roofOffset+i*6)-c.g)<1e-6);
   assert.ok(Math.abs(roofs.getZ(roofOffset+i*6)-c.b)<1e-6);
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

test('overview buildings use one outward-facing batch with roof and walls, stable height/colour',()=>{
 const g=build('overview',true),mesh=g.children[0];assert.equal(g.children.length,1);assert.equal(mesh.material.side,THREE.FrontSide);
 assert.equal(mesh.geometry.attributes.position.count,64*10*3);
 const p=mesh.geometry.attributes.position,c=mesh.geometry.attributes.color,n=mesh.geometry.attributes.normal;
 for(let i=0;i<buildings.length;i++){
  const b=buildings[i],ys=Array.from({length:24},(_,j)=>p.getY(i*24+j));
  assert.ok(Math.abs(Math.min(...ys)-.15)<1e-6);assert.equal(Math.max(...ys),b.height);
  const color=new THREE.Color(buildingColors(b).wall);assert.ok(Math.abs(c.getX(i*24)-color.r)<1e-6);
  assert.equal(n.getZ(i*24),-1);assert.equal(n.getY(64*24+i*6),1);
 }
});

test('overview ray acceleration matches actual triangles, including transforms, occlusion range and missed roofs',()=>{
 const group=build('overview',true),mesh=group.children[0];group.position.set(120,7,-80);group.updateMatrixWorld(true);
 const accelerated=mesh.raycast;let seed=710;
 const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let i=0;i<240;i++){
  const origin=new THREE.Vector3(120+random()*200,7+random()*30,-80+(random()-.5)*40);
  const target=new THREE.Vector3(120+random()*200,7+random()*10,-80+random()*2);
  const ray=new THREE.Raycaster(origin,target.sub(origin).normalize(),0,i%3?200:3),a=[],b=[];
  accelerated.call(mesh,ray,a);THREE.Mesh.prototype.raycast.call(mesh,ray,b);
  const sorted=v=>v.map(h=>h.distance).sort((a,b)=>a-b);
  assert.deepEqual(sorted(a),sorted(b));assert.equal(mesh.geometry.drawRange.start,0);assert.equal(mesh.geometry.drawRange.count,Infinity);
 }
});
