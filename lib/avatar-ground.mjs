import {terrainMeshHeight} from './geo.mjs';

// Interpolate the same full-detail ribbon triangles as buildRoadRibbon.
// Physics retains its original height sampler; this is a visual foot anchor only.
function ribbonHeight(field,line,x,z,width,offset,step){
 let best=-Infinity;
 for(let i=1;i<line.points.length;i++){
  const a=line.points[i-1],b=line.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  if(length<.02)continue;
  const t=((x-a[0])*dx+(z-a[1])*dz)/(length*length);
  const s=((x-a[0])*(-dz/length)+(z-a[1])*(dx/length))/(width/2);
  if(t<0||t>1||Math.abs(s)>1)continue;
  const rows=Math.max(1,Math.ceil(length/step)),cols=Math.max(1,Math.ceil(width/2.4));
  const row=Math.min(rows-1,Math.floor(t*rows)),col=Math.min(cols-1,Math.floor((s+1)/2*cols));
  const ft=t*rows-row,fs=(s+1)/2*cols-col;
  const h=(it,is)=>{
   const u=it/rows,v=(2*is/cols-1)*width/2;
   return terrainMeshHeight(field.terrain,a[0]+dx*u-dz/length*v,a[1]+dz*u+dx/length*v)+offset;
  };
  const h00=h(row,col),h10=h(row+1,col),h01=h(row,col+1),h11=h(row+1,col+1);
  best=Math.max(best,ft+fs<=1?h00+(h10-h00)*ft+(h01-h00)*fs:
   h11+(h01-h11)*(1-ft)+(h10-h11)*(1-fs));
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
