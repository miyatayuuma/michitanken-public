import test from 'node:test';
import assert from 'node:assert/strict';
import {clipPolygon,clipSegment} from '../lib/geo.mjs';
import {parseOsm,CENTER} from '../lib/field.mjs';

test('polygon clipping keeps buildings inside the 500m tile',()=>{
  const polygon=clipPolygon([[-300,-200],[300,-200],[300,200],[-300,200]],250);
  assert.ok(polygon.length>=4);
  assert.ok(polygon.every(([x,z])=>Math.abs(x)<=250 && Math.abs(z)<=250));
});
test('road segment completely beyond boundary is excluded',()=>{
  assert.equal(clipSegment([300,300],[400,400],250),null);
});
test('private driveways and motorways do not become exploration roads',()=>{
  const elements=[
    {type:'node',id:1,lat:CENTER.lat,lon:CENTER.lon},
    {type:'node',id:2,lat:CENTER.lat+.0001,lon:CENTER.lon+.0001},
    {type:'way',id:3,nodes:[1,2],tags:{highway:'service',access:'private'}},
    {type:'way',id:4,nodes:[1,2],tags:{highway:'motorway'}}
  ];
  assert.equal(parseOsm({elements}).roads.length,0);
});