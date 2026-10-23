import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePlayer,WALK_SPEED,RUN_SPEED,PLAYER_RADIUS} from '../lib/navigation.mjs';

const emptyWorld={kind:'tiled',getHeight:()=>0,getCollision:()=>null};
const starting={x:0,z:0,y:0,facing:0};

test('Task6 faster movement respects analogue intensity',()=>{
 assert.equal(WALK_SPEED,5.6);
 assert.equal(RUN_SPEED,10.2);
 const walk=advancePlayer(starting,{forward:1,right:0,yaw:0,run:false},emptyWorld,.1);
 const run=advancePlayer(starting,{forward:1,right:0,yaw:0,run:true},emptyWorld,.1);
 const half=advancePlayer(starting,{forward:.5,right:0,yaw:0,run:false},emptyWorld,.1);
 assert.ok(Math.abs(walk.distance-WALK_SPEED*.1)<1e-10);
 assert.ok(Math.abs(run.distance-RUN_SPEED*.1)<1e-10);
 assert.ok(Math.abs(half.distance-WALK_SPEED*.05)<1e-10);
});

test('Task6 dash cannot cross a narrow obstacle',()=>{
 const wall={kind:'tiled',getHeight:()=>0,
  getCollision:(x,z,r=PLAYER_RADIUS)=>(x+r>1.1&&x-r<1.3)?'building':null};
 const result=advancePlayer(starting,{forward:0,right:1,yaw:0,run:true},wall,.1);
 assert.equal(result.collided,true);
 assert.equal(result.collision,'building');
 assert.ok(result.x<=1.1-PLAYER_RADIUS+1e-8);
 assert.equal(result.z,0);
});
