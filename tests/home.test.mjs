import test from 'node:test';
import assert from 'node:assert/strict';
import {closestPointOnFootprint,nearbyBuildings,homeStorageKey,validHomeRecord} from '../lib/home.mjs';

const square=[[0,0],[5,0],[5,5],[0,5]];

test('nearest building uses exterior footprint edges instead of its centroid',()=>{
 const nearest=closestPointOnFootprint([5.8,2],square);
 assert.ok(Math.abs(nearest.distance-.8)<1e-6);
 assert.deepEqual(nearest.point,[5,2]);
});

test('registered building lookup supports multiple streamed tiles and nearest-first selection',()=>{
 const world={tileWorlds:new Map([
  ['a',{entry:{id:'a',offset:[100,200]},field:{osm:{buildings:[{footprint:square}]}}}],
  ['b',{entry:{id:'b',offset:[200,200]},field:{osm:{buildings:[{footprint:square}]}}}]
 ])};
 assert.equal(nearbyBuildings(world,105.8,202,2).length,1);
 assert.equal(nearbyBuildings(world,105.8,202,2)[0].id,'a:0');
 assert.deepEqual(nearbyBuildings(world,105.8,202,2)[0].center,[102.5,202.5]);
 assert.deepEqual(nearbyBuildings(world,50,0,10),[]);
});

test('home record is scoped to world ZIP and requires a confirmed safe exterior landing',()=>{
 assert.notEqual(homeStorageKey('private-zip-a'),homeStorageKey('private-zip-b'));
 const item={schema:1,id:'north:3',center:[12,10],landing:{confirmed:true,gameSafety:'GAME_SAFE_CONFIRMED',position:[13,25,10],yaw:0,clearance:1.5}};
 assert.equal(validHomeRecord(item),true);
 assert.equal(validHomeRecord({...item,landing:{...item.landing,confirmed:false}}),false);
 assert.equal(validHomeRecord({...item,landing:{...item.landing,position:[NaN,0,0]}}),false);
});
