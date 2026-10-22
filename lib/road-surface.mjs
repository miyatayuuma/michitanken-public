import {terrainMeshHeight} from './geo.mjs';

/**
 * An elevated road ribbon subdivided in both axes, draped over the same
 * piecewise-linear DEM triangles used for the green terrain mesh.
 * Ground collision and actual OSM road geometry remain untouched.
 */
export function buildRoadRibbon(a,b,width,field,offset=.32,{alongStep=2.4,acrossStep=2.4}={}){
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
 if(length<.02)return [];
 if(!Number.isFinite(width)||width<=0||width>100)throw Error('Invalid road width');
 const normal=[-dz/length,dx/length];
 const longitudinal=Math.max(1,Math.ceil(length/alongStep));
 const lateral=Math.max(1,Math.ceil(width/acrossStep));
 const result=[];
 function point(t,s){
  const x=a[0]+dx*t+normal[0]*s*width/2;
  const z=a[1]+dz*t+normal[1]*s*width/2;
  return [x,terrainMeshHeight(field.terrain,x,z)-field.terrain.min+offset,z];
 }
 for(let i=0;i<longitudinal;i++){
  const t0=i/longitudinal,t1=(i+1)/longitudinal;
  for(let j=0;j<lateral;j++){
   const s0=2*j/lateral-1,s1=2*(j+1)/lateral-1;
   const a0=point(t0,s0),a1=point(t0,s1),b0=point(t1,s0),b1=point(t1,s1);
   result.push(...a0,...a1,...b0,...b0,...a1,...b1);
  }
 }
 return result;
}
