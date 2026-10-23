import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sampleVegetation,natureInstanceBudget} from '../src/vegetation.js';

const entry={id:'fictional-woods',offset:[500,0]};
const field={size:500,osm:{
 buildings:[{footprint:[[-14,-14],[14,-14],[14,14],[-14,14]]}],
 roads:[{width:6,points:[[-250,0],[250,0]]}],
 railways:[{width:4,points:[[-250,120],[250,120]]}],
 waterways:[{width:4,points:[[-250,-115],[250,-115]]}],
 waterAreas:[{footprint:[[75,-70],[145,-70],[145,-10],[75,-10]]}]
}};
const overlay={schema:1,tileId:'fictional-woods',
 areas:[
  {id:'fictional-wood-1',kind:'wood',ring:[[-225,-225],[225,-225],[225,225],[-225,225]]},
  {id:'fictional-meadow-1',kind:'grass',ring:[[-50,160],[50,160],[50,225],[-50,225]]}
 ],trees:[[-90,-35]]};
const segDist=(p,a,b)=>{
 const vx=b[0]-a[0],vz=b[1]-a[1];
 const t=Math.max(0,Math.min(1,((p.x-a[0])*vx+(p.z-a[1])*vz)/(vx*vx+vz*vz)));
 return Math.hypot(p.x-a[0]-t*vx,p.z-a[1]-t*vz);
};
test('Task6 mapped low-poly nature is stable across re-entry and bounded per tile',()=>{
 const a=sampleVegetation(entry,field,overlay);
 const b=sampleVegetation(entry,field,overlay);
 assert.ok(a.length>10,'The mapped wood must produce visible natural objects');
 assert.deepEqual(a,b);
 assert.ok(a.length<=540);
 assert.ok(a.filter(x=>x.kind==='tree').length<=100);
 assert.ok(a.filter(x=>x.kind==='grass').length<=310);
 assert.ok(a.filter(x=>x.kind==='bush').length<=180);
 assert.ok(a.length>=340,'Dense woodland should have a visible understory');
 // A deterministic hash rank must fill the entire woodland, not its first corner.
 for(const x of [-1,1])for(const z of [-1,1])
  assert.ok(a.some(p=>p.x*x>60&&p.z*z>60),'Missing forest quadrant '+x+':'+z);
 assert.ok(a.every(x=>['tree_oak','tree_default','tree_pineDefaultA','plant_bush','grass','flower_yellowA','rock_smallA'].includes(x.model)));
 assert.ok(a.every(x=>Math.abs(x.x)<250&&Math.abs(x.z)<250&&Number.isFinite(x.height)&&x.height>0));
});
test('Task6 mapped foliage does not cover roads, rails, rivers or building footprints',()=>{
 for(const p of sampleVegetation(entry,field,overlay)){
  assert.ok(Math.abs(p.z)>5.5,'Road clearance');
  assert.ok(Math.abs(p.z-120)>7,'Rail clearance');
  assert.ok(Math.abs(p.z+115)>5,'Stream clearance');
  assert.ok(!(Math.abs(p.x)<17&&Math.abs(p.z)<17),'Building clearance');
  assert.ok(!(p.x>72&&p.x<148&&p.z>-73&&p.z<-7),'Water area clearance');
 }
});
test('Task6 does not invent nature when OSM polygon cover is absent',()=>{
 assert.deepEqual(sampleVegetation(entry,field,{schema:1,tileId:entry.id,areas:[],trees:[]}),[]);
 assert.deepEqual(sampleVegetation(entry,field,{schema:1,tileId:'wrong',areas:overlay.areas}),[]);
 assert.deepEqual(sampleVegetation(entry,field,{schema:0,tileId:entry.id,areas:overlay.areas}),[]);
});
test('Task6 atlas path still has source-ground vegetation areas without model dependency',()=>{
 const source=fs.readFileSync(new URL('../src/wide-overview.js',import.meta.url),'utf8');
 assert.ok(source.includes('if(vegetation?.schema===1'));
 assert.ok(source.indexOf('for(const area of vegetation.areas')<source.indexOf('for(const water of field.osm?.waterAreas'));
});

test('Task6 vegetation caps on low-memory devices and remains deterministic',()=>{
 assert.equal(natureInstanceBudget({coarsePointer:true,memoryGiB:4}),240);
 assert.equal(natureInstanceBudget({coarsePointer:true,memoryGiB:8}),360);
 assert.equal(natureInstanceBudget({coarsePointer:false,memoryGiB:4}),540);
 const low=sampleVegetation(entry,field,overlay,{maxTotal:240});
 const high=sampleVegetation(entry,field,overlay,{maxTotal:540});
 assert.ok(low.length<=240);
 assert.ok(high.length>low.length);
 assert.deepEqual(low,sampleVegetation(entry,field,overlay,{maxTotal:240}));
 assert.throws(()=>sampleVegetation(entry,field,overlay,{maxTotal:1000}),/budget/);
});

test('Task6 a mapped 2025 roadside tree crown places one tree without a landuse park',()=>{
 const residential={size:500,osm:{roads:[{width:4,points:[[-50,0],[50,0]]}],
  buildings:[],railways:[],waterAreas:[],waterways:[]}};
 const cover={schema:1,tileId:entry.id,trees:[],areas:[
  {id:'fictional-nagoya-canopy',kind:'canopy',
   ring:[[7,1],[13,1],[13,9],[7,9]]}
 ]};
 const placed=sampleVegetation(entry,residential,cover,{maxTotal:10});
 assert.equal(placed.length,1);
 assert.equal(placed[0].kind,'tree');
 assert.ok(placed[0].z>2,'Street tree must be beside, not in, road center');
});
test('Task6 2025 GIS excludes holes and shrine grove allows woodland understory',()=>{
 const region={size:500,osm:{roads:[],buildings:[],railways:[],waterAreas:[],waterways:[]}};
 const shrine={schema:1,tileId:entry.id,trees:[],areas:[{
  id:'fictional-shrine',kind:'grove',
  ring:[[-90,-90],[90,-90],[90,90],[-90,90]],
  holes:[[[-30,-30],[30,-30],[30,30],[-30,30]]]
 }]};
 const placed=sampleVegetation(entry,region,shrine,{maxTotal:220});
 assert.ok(placed.length>20,'Shrine with mapped precinct should include trees and understory');
 assert.ok(placed.some(p=>p.kind==='tree'));
 assert.ok(placed.some(p=>p.kind==='grass'||p.kind==='bush'));
 assert.ok(placed.every(p=>!(Math.abs(p.x)<30&&Math.abs(p.z)<30)),'No planting inside the paved-area hole');
});
