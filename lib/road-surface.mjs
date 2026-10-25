import {terrainMeshHeight} from './geo.mjs';

const CLIP_EPS=1e-9;

// DEM-face clipping provides the subdivisions needed by either LOD. A finer
// rectangular grid could still pass under a ridge between its sample points.
export function roadSurfaceOptions(detail='full'){
 if(!['full','overview'].includes(detail))throw Error('Invalid road LOD');
 return {terrainSafe:true};
}

/** Intersect a convex ribbon polygon in XZ with one terrain half-plane. */
function clipPlane(poly,signedDistance){
 if(poly.length<3)return [];
 const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  const da=signedDistance(a),db=signedDistance(b);
  const inA=da>=-CLIP_EPS,inB=db>=-CLIP_EPS;
  if(inA&&inB)out.push(b);
  else if(inA!==inB){
   const t=da/(da-db),cross=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
   out.push(cross);
   if(inB)out.push(b);
  }
 }
 return out;
}

/**
 * A coarse quad cannot safely interpolate heights across a DEM fold: its
 * corners may clear the ground while its interior passes under the terrain.
 * Clip against the actual triangular DEM faces, so every output triangle is
 * coplanar with the underlying terrain face (plus the requested clearance).
 */
function appendTerrainSafeQuad(corners,terrain,offset,result){
 const {size,count}=terrain,half=size/2,cell=size/(count-1);
 const xs=corners.map(p=>p[0]),zs=corners.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs);
 const minZ=Math.min(...zs),maxZ=Math.max(...zs);
 const index=v=>Math.max(-1,Math.min(count-1,Math.floor((v+half)/cell)));
 const axisBounds=(i,low,high)=>i<0?[low-1,-half]:
  i>=count-1?[half,high+1]:[-half+i*cell,-half+(i+1)*cell];
 function emit(poly){
  if(poly.length<3)return;
  const vertices=poly.map(([x,z])=>[x,terrainMeshHeight(terrain,x,z)-terrain.min+offset,z]);
  for(let i=1;i<vertices.length-1;i++){
   const a=vertices[0],b=vertices[i],c=vertices[i+1];
   const area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
   if(Math.abs(area)>1e-8)result.push(...a,...b,...c);
  }
 }
 for(let ix=index(minX);ix<=index(maxX);ix++){
  const [x0,x1]=axisBounds(ix,minX,maxX);
  for(let iz=index(minZ);iz<=index(maxZ);iz++){
   const [z0,z1]=axisBounds(iz,minZ,maxZ);
   let poly=clipPlane(corners,p=>p[0]-x0);
   poly=clipPlane(poly,p=>x1-p[0]);
   poly=clipPlane(poly,p=>p[1]-z0);
   poly=clipPlane(poly,p=>z1-p[1]);
   if(poly.length<3)continue;
   // Outside the DEM square, terrainMeshHeight clamps to an edge; each
   // exterior strip is planar, so a diagonal split is unnecessary.
   if(ix<0||iz<0||ix>=count-1||iz>=count-1){emit(poly);continue;}
   const diagonal=x0+z1; // exact DEM mesh diagonal: fx + fz = 1
   emit(clipPlane(poly,p=>diagonal-p[0]-p[1]));
   emit(clipPlane(poly,p=>p[0]+p[1]-diagonal));
  }
 }
}

/**
 * Build a ribbon over the exact piecewise-planar DEM triangles. The overview
 * LOD clips coarse quads to DEM faces instead of raising the whole ribbon or
 * drawing through the terrain; full-detail and source OSM geometry are kept.
 */
export function buildRoadRibbon(a,b,width,field,offset=.32,{alongStep=2.4,acrossStep=2.4,terrainSafe=false}={}){
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
 if(length<.02)return [];
 if(!Number.isFinite(width)||width<=0||width>100)throw Error('Invalid road width');
 const normal=[-dz/length,dx/length];
 // DEM faces supply every required break in overview mode. Splitting the
 // initial quad on an arbitrary 11 m grid would create redundant triangles.
 const longitudinal=terrainSafe?1:Math.max(1,Math.ceil(length/alongStep));
 const lateral=terrainSafe?1:Math.max(1,Math.ceil(width/acrossStep));
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
   if(terrainSafe)appendTerrainSafeQuad(
    [[a0[0],a0[2]],[a1[0],a1[2]],[b1[0],b1[2]],[b0[0],b0[2]]],
    field.terrain,offset,result
   );
   else result.push(...a0,...a1,...b0,...b0,...a1,...b1);
  }
 }
 return result;
}
