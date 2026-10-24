import {collisionReason,terrainHeight,PLAYER_RADIUS} from './navigation.mjs';
import {tileAtPosition,distanceFromRect} from './tiles.mjs';
import {renderedFootHeight} from './avatar-ground.mjs';

// Legacy schema-1 confirmations remain readable; new records certify game geometry only.
const gameConfirmed=l=>l?.gameSafety==='GAME_SAFE_CONFIRMED'||l?.publicAccessVerified===true;

export function createWarpRegistry(data,pois,manifest){
 if(data?.schema!==1||!Array.isArray(data.points))throw Error('Invalid warp registry');
 const byId=new Map();
 for(const p of data.points){
  if(!pois.get(p.id)||byId.has(p.id)||typeof p.landing?.confirmed!=='boolean')throw Error('Invalid warp point');
  const l=p.landing;
  if(l.confirmed&&(!Array.isArray(l.position)||l.position.length!==3||!l.position.every(Number.isFinite)||!Number.isFinite(l.yaw)||(!Number.isFinite(l.clearance)||l.clearance<1.5)||!gameConfirmed(l)||!tileAtPosition(manifest,l.position[0],l.position[2])))throw Error('Unverified landing');
  byId.set(p.id,Object.freeze({...p,landing:Object.freeze({...l,position:l.position&&Object.freeze([...l.position])})}));
 }
 return Object.freeze({get:id=>byId.get(id),points:Object.freeze([...byId.values()]),enabled:data.points.some(p=>p.landing.confirmed)});
}
export const canWarp=(registry,store,id)=>!!(registry?.get(id)?.landing.confirmed&&store.has(id));
export function requiredLandingTiles(manifest,x,z){return manifest.tiles.filter(t=>distanceFromRect(x,z,t,manifest.size)<=12).map(t=>t.id);}
export function validateLanding(world,landing){
 const fail=reason=>({ok:false,reason});
 if(!landing?.confirmed||!gameConfirmed(landing)||(!Number.isFinite(landing.clearance)||landing.clearance<1.5)||!Array.isArray(landing.position)||!landing.position.every(Number.isFinite))return fail('unconfirmed');
 const [x,expected,z]=landing.position;
 if(landing.position.length!==3||!Number.isFinite(landing.yaw))return fail('invalid');
 const hit=collisionReason(world,x,z,1.5);if(hit)return fail(hit);
 const owner=tileAtPosition(world.manifest,x,z),tile=owner&&world.tileWorlds.get(owner.id);
 if(!tile)return fail('loading');
 const ground=terrainHeight(world,x,z),foot=renderedFootHeight(tile.field,x-owner.offset[0],z-owner.offset[1],world.baseElevation,{roadStep:2.4});
 if(!Number.isFinite(foot)||Math.abs(foot+world.baseElevation-expected)>.15||Math.abs(foot-ground)>.4)return fail('contact');
 for(let i=0;i<16;i++){
  const a=i*Math.PI/8,nx=x+1.5*Math.cos(a),nz=z+1.5*Math.sin(a);
  if(collisionReason(world,nx,nz,PLAYER_RADIUS))return fail('clearance');
  if(Math.abs(terrainHeight(world,nx,nz)-ground)/1.5>.35)return fail('slope');
 }
 let connected=false;
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4;let valid=true,previous=ground;
  for(let d=.5;d<=10;d+=.5){
   const nx=x+d*Math.cos(a),nz=z+d*Math.sin(a);
   if(collisionReason(world,nx,nz,PLAYER_RADIUS)){valid=false;break;}
   const y=terrainHeight(world,nx,nz);if(Math.abs(y-previous)/.5>.35){valid=false;break;}previous=y;
  }
  if(valid){connected=true;break;}
 }
 return connected?{ok:true,x,z,y:ground,foot,yaw:landing.yaw}:fail('disconnected');
}

/** One transaction owns input suspension. Cancellation never commits late results. */
export function createWarpController({allowed,load,validate,capture,commit,restore,transition=async()=>{},onBusy=()=>{},timeoutMs=12000}){
 let active=null;
 return {get busy(){return active!==null;},cancel(){active?.abort();},async warp(id){
  if(active||!allowed(id))return {ok:false,reason:'unavailable'};
  const controller=new AbortController();active=controller;const {signal}=controller;
  let before,changed=false,timer;
  onBusy(true);
  try{
   before=capture();
   const aborted=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));
   timer=setTimeout(()=>controller.abort(),timeoutMs);
   await Promise.race([load(id,signal),aborted]);
   if(signal.aborted||!allowed(id))throw Error('unavailable');
   let result=validate(id);if(!result.ok)throw Error(result.reason);
   await Promise.race([transition(signal),aborted]);
   if(signal.aborted||!allowed(id))throw Error('cancelled');
   result=validate(id);if(!result.ok)throw Error(result.reason);
   changed=true;commit(result);return {ok:true};
  }catch(e){if(changed&&before)restore(before);return {ok:false,reason:e.message};}
  finally{clearTimeout(timer);active=null;onBusy(false);}
 }};
}
