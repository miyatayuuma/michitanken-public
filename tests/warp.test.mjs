import test from 'node:test';import assert from 'node:assert/strict';
import {createWarpController,createWarpRegistry,canWarp,validateLanding,requiredLandingTiles} from '../lib/warp.mjs';
import {createTiledWorld,registerTile} from '../lib/tiles.mjs';
import {readFileSync} from 'node:fs';
const field=JSON.parse(readFileSync(new URL('../public/data/field.json',import.meta.url)));
const manifest={schema:1,size:500,center:field.center,tiles:[{id:'north',offset:[0,0],url:'data/field.json'},{id:'east',offset:[500,0],url:'data/tiles/east.json'}]};
const landing={confirmed:true,publicAccessVerified:true,position:[0,20.015,0],yaw:1,clearance:1.5};
function world(){const f=structuredClone(field);f.terrain.elevations.fill(20);f.terrain.min=f.terrain.max=20;f.osm={buildings:[],roads:[],waterways:[],waterAreas:[],railways:[]};const w=createTiledWorld(manifest);registerTile(w,manifest.tiles[0],f);return w;}
test('only explicitly confirmed and discovered points unlock; invalid confirmations fail closed',()=>{
 const pois={get:id=>id==='fictional'};const r=createWarpRegistry({schema:1,points:[{id:'fictional',landing}]},pois,manifest);
 assert.equal(canWarp(r,{has:()=>false},'fictional'),false);assert.equal(canWarp(r,{has:()=>true},'fictional'),true);
 assert.equal(canWarp(r,{has:()=>true},'missing'),false);
 assert.throws(()=>createWarpRegistry({schema:1,points:[{id:'fictional',landing:{...landing,publicAccessVerified:false}}]},pois,manifest));
 assert.equal(createWarpRegistry({schema:1,points:[{id:'fictional',landing:{confirmed:false}}]},pois,manifest).enabled,false);
});
test('real collision/terrain validation rejects water, buildings, boundary, missing tiles, height drift and slope',()=>{
 const w=world();assert.equal(validateLanding(w,landing).ok,true);
 assert.deepEqual(requiredLandingTiles(manifest,249,0),['north','east']);
 assert.equal(validateLanding(w,{...landing,position:[-249.5,20.015,0]}).ok,false);
 assert.equal(validateLanding(w,{...landing,position:[0,22,0]}).reason,'contact');
 w.tileWorlds.clear();assert.equal(validateLanding(w,landing).reason,'loading');
 for(const kind of ['building','water']){const a=world(),f=a.tileWorlds.get('north').field;const polygon=[[-3,-3],[3,-3],[3,3],[-3,3]];if(kind==='building')f.osm.buildings=[{id:1,footprint:polygon}];else f.osm.waterAreas=[{id:2,footprint:polygon}];registerTile(a,manifest.tiles[0],f);assert.equal(validateLanding(a,landing).ok,false);}
 const slope=world();slope.getHeight=(x,z)=>x;assert.equal(validateLanding(slope,{...landing,position:[0,.015+20,0]}).reason,'slope');
});
function controller(overrides={}){let state={x:12,camera:9},commits=0;const busy=[];const c=createWarpController({allowed:()=>true,load:async()=>{},validate:()=>({ok:true,x:90}),capture:()=>({...state}),commit:r=>{state.x=r.x;commits++;},restore:s=>{state=s;},onBusy:v=>busy.push(v),...overrides});return {c,busy,get state(){return state;},get commits(){return commits;}};}
test('successful warp commits once; duplicate requests and unavailable points cannot move',async()=>{let done;const v=controller({load:()=>new Promise(r=>done=r)});const p=v.c.warp('a');assert.equal(v.c.busy,true);assert.equal((await v.c.warp('a')).ok,false);done();assert.equal((await p).ok,true);assert.equal(v.commits,1);assert.equal(v.state.x,90);assert.deepEqual(v.busy,[true,false]);assert.equal((await controller({allowed:()=>false}).c.warp('a')).ok,false);});
test('load error, invalid landing, cancellation, timeout and revoked discovery preserve position/camera',async()=>{
 for(const opts of [{load:async()=>{throw Error('network');}},{validate:()=>({ok:false,reason:'water'})},{load:()=>new Promise(()=>{}),timeoutMs:5}]){const v=controller(opts);assert.equal((await v.c.warp('a')).ok,false);assert.deepEqual(v.state,{x:12,camera:9});assert.equal(v.commits,0);assert.equal(v.c.busy,false);}
 let done;const v=controller({load:()=>new Promise(r=>done=r)}),p=v.c.warp('a');v.c.cancel();assert.equal((await p).ok,false);done();await Promise.resolve();assert.equal(v.commits,0);
 let allowed=true;const revoked=controller({allowed:()=>allowed,load:async()=>{allowed=false;}});assert.equal((await revoked.c.warp('a')).ok,false);assert.equal(revoked.commits,0);
});
test('transition failure and commit exception restore snapshot and input',async()=>{const v=controller({commit:()=>{throw Error('commit');}});assert.equal((await v.c.warp('a')).ok,false);assert.deepEqual(v.state,{x:12,camera:9});assert.equal(v.c.busy,false);});
