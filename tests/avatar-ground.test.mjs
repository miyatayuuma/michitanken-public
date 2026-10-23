import test from 'node:test';
import assert from 'node:assert/strict';
import {renderedFootHeight} from '../lib/avatar-ground.mjs';
import {buildRoadRibbon} from '../lib/road-surface.mjs';
import {gridSample} from '../lib/geo.mjs';
const fixture=()=>({size:10,terrain:{size:10,count:2,min:100,elevations:[100,100,100,110]},osm:{roads:[],railways:[]}});
test('sprite feet follow rendered DEM triangles while physics height stays unchanged',()=>{
 const field=fixture();assert.equal(gridSample(field.terrain,0,0),102.5);
 assert.ok(Math.abs(renderedFootHeight(field,0,0,100)-.015)<1e-9);
 assert.equal(gridSample(field.terrain,0,0),102.5);
});
test('visual feet match actual road ribbon interpolation including folds and bridges',()=>{
 const field=fixture(),road={points:[[-4,-2],[4,3]],width:3,bridge:true};field.osm.roads=[road];
 const verts=buildRoadRibbon(...road.points,road.width,field,.4);
 // Centroid of each actual road triangle supplies an independent raster-surface height.
 let checked=0;
 for(let i=0;i<verts.length;i+=9){
  const x=(verts[i]+verts[i+3]+verts[i+6])/3,z=(verts[i+2]+verts[i+5]+verts[i+8])/3,y=(verts[i+1]+verts[i+4]+verts[i+7])/3;
  const actual=renderedFootHeight(field,x,z,100);
  assert.ok(actual>=y+.015-1e-8); // Ground may be above a full-detail ribbon at a DEM fold.
  if(Math.abs(actual-y-.015)<1e-8)checked++;
 }
 assert.ok(checked>3);
});
test('ordinary road and rail contact heights do not lift a walker onto overhead rail bridges',()=>{
 const field=fixture();field.terrain.elevations=[100,100,100,100];
 field.osm.roads=[{points:[[-5,0],[5,0]],width:4}];
 assert.ok(Math.abs(renderedFootHeight(field,0,0,100)-.245)<1e-8);
 field.osm.railways=[{points:[[-5,0],[5,0]],width:2.5}];
 assert.ok(Math.abs(renderedFootHeight(field,0,0,100)-.325)<1e-8);
 field.osm.railways[0].bridge=true;
 assert.ok(Math.abs(renderedFootHeight(field,0,0,100)-.245)<1e-8);
 assert.ok(Math.abs(renderedFootHeight(field,0,4,100)-.015)<1e-8);
});
