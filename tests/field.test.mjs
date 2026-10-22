import test from 'node:test';
import assert from 'node:assert/strict';
import {boundsFromCenter,project,unproject,tileAt,clipSegment,clipPolygon,gridSample} from '../lib/geo.mjs';
import {CENTER,SIZE,parseOsm,validateField,overpassQuery} from '../lib/field.mjs';
const approx=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('500m bbox projection',()=>{
 const b=boundsFromCenter(CENTER,SIZE);
 approx(project(b.north,b.west,CENTER)[0],-250,.01);approx(project(b.north,b.west,CENTER)[1],-250,.01);
 const g=unproject(52,-66,CENTER),p=project(g.lat,g.lon,CENTER);approx(p[0],52);approx(p[1],-66);
 assert.match(overpassQuery(),/way\["building"\]/);
});
test('tile coordinates',()=>{const a=tileAt(CENTER.lat,CENTER.lon,15);assert.ok(a.x>0&&a.y>0);});
test('clip boundaries',()=>{
 assert.deepEqual(clipSegment([-400,0],[400,0],250),[[-250,0],[250,0]]);
 assert.equal(clipSegment([-400,400],[-300,300],250),null);
 const p=clipPolygon([[-500,-10],[10,-10],[10,10],[-500,10]],250);
 assert.equal(p.length,4);assert.ok(p.every(a=>Math.abs(a[0])<=250&&Math.abs(a[1])<=250));
});
test('grid interpolation',()=>{approx(gridSample({size:500,count:2,elevations:[0,10,20,30]},0,0),15);});
test('parse OSM networks',()=>{
 const coords=[[-.003,0],[.003,0],[.001,.001],[-.001,.001]];
 const elements=[...coords.map(([dx,dz],i)=>({type:'node',id:i+1,lat:CENTER.lat+dz,lon:CENTER.lon+dx})),
  {type:'way',id:90,nodes:[1,2],tags:{highway:'residential'}},
  {type:'way',id:91,nodes:[1,2,3,4,1],tags:{building:'yes','building:levels':'2'}},
  {type:'way',id:92,nodes:[1,2],tags:{highway:'motorway'}}];
 const p=parseOsm({elements});assert.equal(p.roads.length,1);assert.equal(p.buildings.length,1);
 assert.equal(p.buildings[0].height,6);assert.ok(p.roads[0].points.every(pt=>Math.abs(pt[0])<=250.00001));
});
test('invalid schema rejected',()=>{
 const base={schema:1,center:CENTER,size:500,terrain:{size:500,count:3,elevations:Array(9).fill(3),validRatio:1},osm:{roads:[{id:1}],buildings:[{id:2}]}};
 assert.equal(validateField(base),true);assert.throws(()=>validateField({...base,terrain:{...base.terrain,validRatio:.1}}));
 assert.throws(()=>validateField({...base,osm:{roads:[],buildings:[]}}));
});