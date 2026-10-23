import test from 'node:test';
import assert from 'node:assert/strict';
import {wildlifeCandidates,createWildlifeRenderer} from '../src/wildlife.js';

const entry={id:'fictional-river-bank',offset:[0,0]};
const field={size:500,terrain:{size:500,count:2,elevations:[0,0,0,0],min:0,max:0},osm:{
 buildings:[{footprint:[[110,100],[130,100],[130,130],[110,130]]}],
 roads:[{width:4,points:[[-220,-80],[220,-80]]}],
 railways:[],waterAreas:[],
 waterways:[{id:200,layer:0,tunnel:false,width:4,points:[[-95,15],[95,15]]}]
}};
const green={schema:1,tileId:entry.id,trees:[],areas:[
 {id:'fictional-grove',kind:'grove',ring:[[-75,55],[75,55],[75,140],[-75,140]]},
 {id:'fictional-meadow',kind:'grass',ring:[[-200,120],[-100,120],[-100,210],[-200,210]]}
]};
test('Task6 wildlife uses mapped vegetation and stream banks, not arbitrary housing',()=>{
 const items=wildlifeCandidates(entry,field,green);
 assert.deepEqual(items,wildlifeCandidates(entry,field,green));
 assert.ok(items.some(x=>x.species==='bee'));
 assert.ok(items.some(x=>x.species==='duck'));
 assert.ok(items.filter(x=>x.species==='bee').length<=2);
 assert.ok(items.filter(x=>x.species==='duck').length<=1);
 for(const p of items){
  assert.ok(Math.abs(p.x)<238&&Math.abs(p.z)<238);
  assert.ok(!(p.x>107&&p.x<133&&p.z>97&&p.z<133));
  assert.ok(Math.abs(p.z+80)>5,'avoid road surface');
 }
});
test('Task6 missing overlay never fabricates wildlife locations',()=>{
 assert.deepEqual(wildlifeCandidates(entry,field,null),[]);
 assert.deepEqual(wildlifeCandidates(entry,field,{schema:1,tileId:'other',areas:green.areas}),[]);
 assert.deepEqual(wildlifeCandidates(entry,{...field,osm:{...field.osm,waterways:[]}},
  {schema:1,tileId:entry.id,areas:[],trees:[]}),[]);
});
test('Task6 tiny mapped residential crown is not automatically insect habitat',()=>{
 const cover={schema:1,tileId:entry.id,areas:[
  {id:'urban-canopy',kind:'canopy',ring:[[15,20],[21,20],[21,26],[15,26]]}
 ]};
 assert.equal(wildlifeCandidates(entry,{...field,osm:{...field.osm,waterways:[]}},cover).length,0);
});
test('Task6 tracked candidate resources are released on tile unload and map mode',()=>{
 const scene={remove(){},add(){}},renderer=createWildlifeRenderer({scene,baseURL:'/',baseElevation:0});
 const empty={...field,osm:{...field.osm,waterways:[]}};
 renderer.register(entry,empty,green);
 assert.ok(renderer.candidateCount<=2);
 renderer.update({dt:.2,playerX:900,playerZ:900,currentMode:'walk'});
 assert.equal(renderer.visibleCount,0);
 renderer.update({dt:.2,playerX:0,playerZ:0,currentMode:'map'});
 assert.equal(renderer.visibleCount,0);
 renderer.unregister(entry.id);
 assert.equal(renderer.candidateCount,0);
 renderer.dispose();
});
