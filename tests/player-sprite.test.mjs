import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {validateSpriteConfig,createSpriteAnimator,spriteFlip} from '../lib/sprite-animation.mjs';
import {createSpriteAvatar,loadPlayerSprite} from '../src/player-sprite.js';
const fixture=()=>({schema:1,image:'assets/demo.png',width:31,height:23,pixelsPerUnit:10,stride:2,
 frames:[{rect:[1,2,8,12],pivot:[3,11]},{rect:[13,3,11,14],pivot:[5,13]}],animations:{idle:[0],walk:[0,1]}});

test('explicit irregular rectangles and foot pivots are validated',()=>{
 assert.equal(validateSpriteConfig(fixture()).frames.length,2);
 for(const change of [c=>c.frames[1].rect[0]=30,c=>c.frames[0].pivot[1]=99,
  c=>c.animations.walk=[8],c=>c.image='assets/../../private.png',c=>c.pixelsPerUnit=0]){
  const c=fixture();change(c);assert.throws(()=>validateSpriteConfig(c));
 }
});
test('gait follows actual distance and stops for collision, idle, map or teleport',()=>{
 const a=createSpriteAnimator(fixture());
 a.update({x:0,z:0,moving:false});
 assert.equal(a.update({x:1.1,z:0,moving:true}).frame,1);
 assert.equal(a.update({x:1.1,z:0,moving:true}).frame,1,'120Hz zero-step RAF retains the gait phase');
 assert.equal(a.update({x:1.1,z:0,moving:false}).active,false,'collision stops the gait');
 assert.equal(a.update({x:1.2,z:0,moving:false}).frame,0);
 assert.equal(a.update({x:2,z:0,moving:true,walking:false}).frame,0);
 assert.equal(a.update({x:90,z:0,moving:true}).frame,0);
 a.reset();assert.equal(a.update({x:0,z:0,moving:true}).frame,0);
});
test('left/right mirroring is camera-relative and stable for forward/backward movement',()=>{
 assert.equal(spriteFlip(-1,0,0),true);
 assert.equal(spriteFlip(-1,0,Math.PI),false);
 assert.equal(spriteFlip(0,-1,0,true),true);
 assert.equal(spriteFlip(0,0,0,true),true);
});
test('foot origin, common pixel scale, inset UVs and depth occlusion survive frame changes',()=>{
 const config=fixture(),texture=new THREE.Texture(),a=createSpriteAvatar(config,texture);
 const plane=a.group.getObjectByName('player-sprite'),pos=plane.geometry.attributes.position;
 assert.ok(Math.abs(pos.getX(0)+.3)<1e-6);
 assert.ok(Math.abs(pos.getY(2)+.1)<1e-6);
 assert.ok(plane.geometry.attributes.uv.getX(0)>1/31);
 assert.equal(texture.generateMipmaps,false);
 assert.equal(plane.material.depthTest,true);assert.equal(plane.material.depthWrite,true);
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,5,10);
 a.update({state:{x:0,z:0,moving:false},camera});
 a.update({state:{x:1.1,z:0,moving:true},camera});
 assert.equal(a.snapshot().frame,1);
 assert.ok(Math.abs(pos.getX(0)+.5)<1e-6);
 let disposed=0;texture.addEventListener('dispose',()=>disposed++);a.dispose();a.dispose();assert.equal(disposed,1);
});
test('optional absence preserves old avatar, present invalid metadata fails visibly',async()=>{
 assert.equal(await loadPlayerSprite({fetcher:async()=>({status:404})}),null);
 await assert.rejects(loadPlayerSprite({fetcher:async()=>({ok:false,status:403})}),/403/);
 await assert.rejects(loadPlayerSprite({fetcher:async()=>({ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({schema:2})})}),/schema/);
 let disposed=false;
 await assert.rejects(loadPlayerSprite({fetcher:async()=>({ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>fixture()}),
  loader:{loadAsync:async()=>({image:{width:10,height:10},dispose(){disposed=true;}})}}),/dimensions/);
 assert.equal(disposed,true);
});

test('authored character frames switch without replacing texture, position or physics',()=>{
 const c=fixture();c.characters=[{id:'cat',animations:{idle:[0],walk:[0]}},{id:'rabbit',animations:{idle:[1],walk:[1]}}];
 const a=createSpriteAvatar(c,new THREE.Texture());a.group.position.set(2,3,4);assert.equal(a.switchCharacter(),'rabbit');assert.equal(a.snapshot().character,'rabbit');assert.deepEqual(a.group.position.toArray(),[2,3,4]);assert.equal(a.switchCharacter(),'cat');a.dispose();
 c.characters[1].animations.walk=[99];assert.throws(()=>validateSpriteConfig(c));
});
