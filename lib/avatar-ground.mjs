import {terrainMeshHeight} from './geo.mjs';

// Match the DEM-face-conforming ribbon triangles used by both road LODs.
// Physics retains its original height sampler; this is a visual foot anchor only.
function ribbonHeight(field,line,x,z,width,offset){
 let best=-Infinity;
 for(let i=1;i<line.points.length;i++){
  const a=line.points[i-1],b=line.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  if(length<.02)continue;
  const t=((x-a[0])*dx+(z-a[1])*dz)/(length*length);
  const s=((x-a[0])*(-dz/length)+(z-a[1])*(dx/length))/(width/2);
  if(t<-1e-9||t>1+1e-9||Math.abs(s)>1+1e-9)continue;
  best=Math.max(best,terrainMeshHeight(field.terrain,x,z)+offset);
 }
 return best;
}
export function renderedFootHeight(field,x,z,baseElevation,{roadStep=2.4}={}){
 let y=terrainMeshHeight(field.terrain,x,z);
 for(const road of field.osm.roads||[])
  y=Math.max(y,ribbonHeight(field,road,x,z,road.width,road.bridge?.40:.23,roadStep));
 for(const rail of field.osm.railways||[])if(!rail.tunnel&&!rail.bridge)
  y=Math.max(y,ribbonHeight(field,rail,x,z,rail.width||2.5,.31,roadStep));
 return y-baseElevation+.015;
}
