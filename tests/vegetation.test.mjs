import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sampleVegetation} from '../src/vegetation.js';

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
 assert.ok(a.length<=260);
 assert.ok(a.filter(x=>x.kind==='tree').length<=80);
 assert.ok(a.filter(x=>x.kind==='grass').length<=115);
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
