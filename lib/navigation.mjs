import {gridSample} from './geo.mjs';

/**
 * Collision and movement use horizontal metres (x,z) independently of Three.js.
 * Buildings and surface water/rails are 2D obstacles; tagged crossing corridors are openings.\n * This is a conservative approximation, NOT a surveyed pedestrian-access map.
 */
export const PLAYER_RADIUS = 0.7;
export const WALK_SPEED = 5.6;
export const RUN_SPEED = 10.2;
const CELL_SIZE = 16;
const MAX_SUBSTEP = 0.28;

export function pointInPolygon(x,z,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [xi,zi]=polygon[i], [xj,zj]=polygon[j];
    if((zi>z)!==(zj>z) && x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;
  }
  return inside;
}

function squaredDistanceToSegment(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz;
  const t=den?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/den)):0;
  return (x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;
}

export function circleIntersectsPolygon(x,z,r,polygon){
  if(pointInPolygon(x,z,polygon))return true;
  const radiusSq=r*r;
  for(let i=0;i<polygon.length;i++){
    if(squaredDistanceToSegment(x,z,polygon[i],polygon[(i+1)%polygon.length])<=radiusSq)return true;
  }
  return false;
}

const cellKey=(x,z)=>`${x},${z}`;
const range=(low,high)=>[Math.floor(low/CELL_SIZE),Math.floor(high/CELL_SIZE)];

function boundsOf(poly){
 const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);
 return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
}
function insertGrid(cells,id,box){
 const [x0,x1]=range(box.minX,box.maxX),[z0,z1]=range(box.minZ,box.maxZ);
 for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++){
   const key=cellKey(i,j);
   if(!cells.has(key))cells.set(key,[]);
   cells.get(key).push(id);
 }
}
function nearby(cells,x,z,r){
 const ids=new Set(),[x0,x1]=range(x-r,x+r),[z0,z1]=range(z-r,z+r);
 for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++)
   for(const id of cells.get(cellKey(i,j))||[])ids.add(id);
 return ids;
}
function corridorContains(segment,x,z,r=PLAYER_RADIUS){
 const a=segment.points[0],b=segment.points.at(-1);
 const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
 if(len<.01)return false;
 const t=((x-a[0])*dx+(z-a[1])*dz)/(len*len);
 if(t<0||t>1)return false;
 const px=a[0]+t*dx,pz=a[1]+t*dz;
 return Math.hypot(x-px,z-pz)<=Math.max(.3,segment.width/2-r);
}
function crossingContains(node,x,z,railWidth,r){
 const dx=x-node.x,dz=z-node.z;
 const along=Math.abs(dx*node.dx+dz*node.dz);
 const lateral=Math.abs(dx*node.dz-dz*node.dx);
 return lateral<=Math.max(.4,node.width/2-r) && along<=railWidth/2+r+1.5;
}
export function createCollisionWorld(field){
 if(!field?.terrain||!Array.isArray(field.osm?.buildings)||!Array.isArray(field.osm?.roads))
   throw Error('Field has no terrain, buildings or roads');
 const colliders=[],cells=new Map(),barriers=[],barrierCells=new Map();
 for(const building of field.osm.buildings){
   const polygon=building.footprint;
   if(!Array.isArray(polygon)||polygon.length<3||!polygon.every(p=>p.length===2&&p.every(Number.isFinite)))continue;
   const box=boundsOf(polygon),id=colliders.length;
   colliders.push({id:building.id,polygon,box});insertGrid(cells,id,box);
 }
 function pushBarrier(barrier){
   const id=barriers.length;barriers.push(barrier);
   insertGrid(barrierCells,id,barrier.box);
 }
 for(const rail of field.osm.railways||[]){
   if(rail.bridge||rail.tunnel||rail.layer&&rail.layer!==0)continue;
   const {points}=rail,width=rail.width||2.5;
   if(!points||points.length<2)continue;
   const box=boundsOf(points);
   pushBarrier({id:rail.id,kind:'railway',points,width,
     box:{minX:box.minX-width/2,maxX:box.maxX+width/2,minZ:box.minZ-width/2,maxZ:box.maxZ+width/2}});
 }
 for(const water of field.osm.waterways||[]){
   if(water.tunnel||water.layer&&water.layer<0)continue;
   const {points}=water,width=water.width||2.4;
   if(!points||points.length<2)continue;
   const box=boundsOf(points);
   pushBarrier({id:water.id,kind:'waterway',points,width,
     box:{minX:box.minX-width/2,maxX:box.maxX+width/2,minZ:box.minZ-width/2,maxZ:box.maxZ+width/2}});
 }
 for(const area of field.osm.waterAreas||[]){
   if(!area.footprint||area.footprint.length<3)continue;
   pushBarrier({id:area.id,kind:'water-area',polygon:area.footprint,box:boundsOf(area.footprint)});
 }
 const bridgeRoads=field.osm.roads.filter(r=>r.bridge&&!r.tunnel&&Array.isArray(r.points)&&r.points.length>=2);
 return {size:field.size,terrain:field.terrain,terrainMin:field.terrain.min,
   roads:field.osm.roads,colliders,cells,barriers,barrierCells,
   crossings:field.osm.crossings||[],bridgeRoads};
}

export function terrainHeight(world,x,z){
 if(world.kind==='tiled')return world.getHeight(x,z);
 return gridSample(world.terrain,x,z)-world.terrainMin;
}

/** Return the first obstacle cause, or null when the position is traversable. */
export function collisionReason(world,x,z,r=PLAYER_RADIUS,ignoreBoundary=false){
 if(world.kind==='tiled')return world.getCollision(x,z,r);
 if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(r)||r<=0)return 'invalid';
 const half=world.size/2;
 if(!ignoreBoundary&&(x-r<-half||x+r>half||z-r<-half||z+r>half))return 'boundary';
 for(const id of nearby(world.cells,x,z,r)){
   const {polygon,box}=world.colliders[id];
   if(x+r<box.minX||x-r>box.maxX||z+r<box.minZ||z-r>box.maxZ)continue;
   if(circleIntersectsPolygon(x,z,r,polygon))return 'building';
 }
 for(const id of nearby(world.barrierCells,x,z,r)){
   const barrier=world.barriers[id],{box}=barrier;
   if(x+r<box.minX||x-r>box.maxX||z+r<box.minZ||z-r>box.maxZ)continue;
   const inside=barrier.polygon?circleIntersectsPolygon(x,z,r,barrier.polygon):
     squaredDistanceToSegment(x,z,barrier.points[0],barrier.points[1])<=(barrier.width/2+r)**2;
   if(!inside)continue;
   // Explicit OSM road bridges are playable corridors across mapped water or tracks.
   if(world.bridgeRoads.some(road=>corridorContains(road,x,z,r)))continue;
   if(barrier.kind==='railway'&&world.crossings.some(node=>
     node.railIds.includes(barrier.id)&&crossingContains(node,x,z,barrier.width,r)))continue;
   return barrier.kind;
 }
 return null;
}
export function blocked(world,x,z,r=PLAYER_RADIUS){
 return collisionReason(world,x,z,r)!==null;
}

/** Start on a mapped road when possible, prioritizing plausible streets near map center. */
export function chooseSpawn(world,r=PLAYER_RADIUS){
  const preference={residential:0,unclassified:0,tertiary:5,pedestrian:10,
    living_street:0,footway:30,path:30,service:80,primary:60,secondary:25};
  let best=null;
  for(const road of world.roads){
    if(!Array.isArray(road.points)||road.points.length<2)continue;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
      if(Math.hypot(dx,dz)<0.01)continue;
      for(const t of [0.5,0.25,0.75]){
        const x=a[0]+dx*t,z=a[1]+dz*t;
        if(blocked(world,x,z,r))continue;
        const score=Math.hypot(x,z)+(preference[road.kind]??45);
        if(!best||score<best.score)best={x,z,score,yaw:Math.atan2(-dx,-dz),roadId:road.id};
      }
    }
  }
  if(!best)throw Error('No safe initial position on mapped roads');
  return {x:best.x,z:best.z,y:terrainHeight(world,best.x,best.z),yaw:best.yaw,roadId:best.roadId};
}

/** Camera yaw 0 looks north (negative z). Pure, frame-rate-independent movement. */
export function advancePlayer(state,intent,world,dt){
  if(!Number.isFinite(dt)||dt<0)throw Error('Invalid timestep');
  const seconds=Math.min(dt,0.1);
  const yaw=Number.isFinite(intent.yaw)?intent.yaw:0;
  let forward=Number.isFinite(intent.forward)?intent.forward:0;
  let right=Number.isFinite(intent.right)?intent.right:0;
  const magnitude=Math.hypot(forward,right);
  if(magnitude>1){forward/=magnitude;right/=magnitude;}
  const speed=intent.run?RUN_SPEED:WALK_SPEED;
  const dx=(right*Math.cos(yaw)-forward*Math.sin(yaw))*speed*seconds;
  const dz=(-right*Math.sin(yaw)-forward*Math.cos(yaw))*speed*seconds;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/MAX_SUBSTEP));
  let x=state.x,z=state.z,collided=false,collision=null;
  for(let i=0;i<steps;i++){
    const nx=x+dx/steps;
    const hitX=collisionReason(world,nx,z);if(!hitX){x=nx;}else if(Math.abs(dx)>1e-9){collided=true;collision=hitX;}
    const nz=z+dz/steps;
    const hitZ=collisionReason(world,x,nz);if(!hitZ){z=nz;}else if(Math.abs(dz)>1e-9){collided=true;collision=hitZ;}
  }
  const moving=Math.hypot(x-state.x,z-state.z)>1e-7;
  return {x,z,y:terrainHeight(world,x,z),
    facing:moving?Math.atan2(-(x-state.x),-(z-state.z)):(state.facing??yaw),
    moving,collided,collision,distance:Math.hypot(x-state.x,z-state.z)};
}
