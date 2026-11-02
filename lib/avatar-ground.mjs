import {terrainMeshHeight} from './geo.mjs';

// Roads and avatars share the same surface height. Bridge elevations are
// estimated by interpolating their mapped segment endpoints; no surveyed deck
// elevation is implied.
export function roadSurfaceHeight(field,road,x,z,offset=road.bridge?.40:.23){
 if(!road.bridge)return terrainMeshHeight(field.terrain,x,z)+offset;
 let best=null;
 for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],q=dx*dx+dz*dz;
  if(q<.0004)continue;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/q));
  const d=(x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;
  if(!best||d<best.distance){
   const y0=terrainMeshHeight(field.terrain,a[0],a[1]),y1=terrainMeshHeight(field.terrain,b[0],b[1]);
   best={distance:d,height:y0+(y1-y0)*t+offset};
  }
 }
 return best?.height??terrainMeshHeight(field.terrain,x,z)+offset;
}
function ribbonHeight(field,line,x,z,width,offset){
 let best=-Infinity;
 for(let i=1;i<line.points.length;i++){
  const a=line.points[i-1],b=line.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  if(length<.02)continue;
  const t=((x-a[0])*dx+(z-a[1])*dz)/(length*length);
  const s=((x-a[0])*(-dz/length)+(z-a[1])*(dx/length))/(width/2);
  if(t<-1e-9||t>1+1e-9||Math.abs(s)>1+1e-9)continue;
  best=Math.max(best,roadSurfaceHeight(field,line,x,z,offset));
 }
 return best;
}
export function renderedFootHeight(field,x,z,baseElevation,{roadStep=2.4,bridgeId=undefined}={}){
 let y=terrainMeshHeight(field.terrain,x,z);
 for(const road of field.osm.roads||[])if(!road.tunnel&&(!road.bridge||bridgeId===undefined||road.id===bridgeId))
  y=Math.max(y,ribbonHeight(field,road,x,z,road.width,road.bridge?.40:.23,roadStep));
 for(const rail of field.osm.railways||[])if(!rail.tunnel&&!rail.bridge)
  y=Math.max(y,ribbonHeight(field,rail,x,z,rail.width||2.5,.31,roadStep));
 return y-baseElevation+.015;
}

